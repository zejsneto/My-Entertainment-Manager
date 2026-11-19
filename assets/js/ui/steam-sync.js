/**
 * ============================================================
 * steam-sync.js — Sincronizar jogos da Steam
 * ============================================================
 * Fluxo:
 * 1. Botão Steam no topo (só para a dona, com o Worker configurado).
 * 2. A janela carrega a biblioteca da conta: nome, capa vertical,
 *    horas jogadas e última vez jogado.
 * 3. Cada jogo aparece como "Novo" ou "No acervo" (comparando pelo
 *    ID da Steam salvo ou, para jogos antigos, pelo título). Cada jogo
 *    do acervo só pode casar com UM jogo da Steam, e títulos que não
 *    viram texto comparável (ex.: só caracteres japoneses) nunca casam
 *    por título — assim um jogo nunca sobrescreve outro.
 *    As capas verticais chegam em lotes de 50 depois da lista aparecer.
 * 4. A dona marca quais quer (ou todos) e clica em Importar.
 * 5. O site busca as conquistas (obtidas/totais) em lotes de 40 e:
 *    - cria os jogos novos (com capa, horas, conquistas e data);
 *    - atualiza horas e conquistas dos que já existem, sem mexer em
 *      nota, data, status ou capa que você já tinha definido. As horas
 *      nunca diminuem (se você registrou mais horas à mão, ficam as suas).
 *    Platina é automática: todas as conquistas obtidas = platinado
 *    (e o jogo é marcado como zerado).
 *
 * Nenhuma chave passa pelo navegador: tudo vai pelo Worker.
 */
import { $, $$, escapeHtml, safeImageSrc } from '../core/dom.js';
import { t, tp } from '../core/i18n.js';
import { formatDate, formatNumber, todayISO } from '../core/format.js';
import { getState, upsertMedia } from '../core/state.js';
import { createMedia, updateMedia } from '../services/backend.js';
import { getProviders, getSteamLibrary, getSteamAchievements, getSteamCovers, apiEnabled } from '../services/api.js';
import { openDialog, toast } from './dialogs.js';
import { apiErrorMessage } from './media-search.js';

const ACHIEVEMENT_BATCH = 40;   // limite do Worker (plano gratuito da Cloudflare)
const COVER_BATCH = 50;         // capas por pedido ao Worker
const MIN_TITLE_MATCH = 3;      // título "dobrado" menor que isso não serve para comparar
const WRITE_CONCURRENCY = 4;    // gravações simultâneas no Firestore

let dialog;
let games = [];                 // biblioteca carregada
let loadedAt = 0;
const selected = new Set();     // appids marcados
let busy = false;

/* ------------------------------------------------------------
 * Comparação com o acervo
 * ------------------------------------------------------------ */

/** Título "dobrado" para comparar: sem acento, símbolos e maiúsculas. */
function foldTitle(title) {
  return String(title || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Decide, de uma vez, qual jogo do acervo corresponde a cada jogo da Steam.
 * Devolve um Map appid → mídia do acervo.
 * Regras:
 * 1. Primeiro, pelo ID da Steam já salvo (sincronizações anteriores).
 * 2. Depois, pelo título — só para jogos do acervo SEM ID da Steam,
 *    só com títulos comparáveis (3+ letras/números) e cada jogo do
 *    acervo só pode ser usado UMA vez (ex.: Doom 1993 x DOOM 2016:
 *    o primeiro casa, o segundo vira jogo novo).
 * Calculado uma vez por desenho da lista (rápido mesmo com milhares).
 */
function buildMatches() {
  const owned = getState().medias.filter((m) => m.type === 'games');
  const byAppid = new Map();
  const byTitle = new Map();
  owned.forEach((m) => {
    if (m.steam_appid) byAppid.set(Number(m.steam_appid), m);
    else {
      const key = foldTitle(m.title);
      if (key.length >= MIN_TITLE_MATCH && !byTitle.has(key)) byTitle.set(key, m);
    }
  });
  const matches = new Map();
  const claimed = new Set();
  // Passo 1: ID da Steam
  games.forEach((g) => {
    const m = byAppid.get(g.appid);
    if (m) {
      matches.set(g.appid, m);
      claimed.add(m._docId);
    }
  });
  // Passo 2: título (jogos com mais horas escolhem primeiro)
  games.forEach((g) => {
    if (matches.has(g.appid)) return;
    const m = byTitle.get(foldTitle(g.name));
    if (m && !claimed.has(m._docId)) {
      matches.set(g.appid, m);
      claimed.add(m._docId);
    }
  });
  return matches;
}

let matches = new Map();

/** Jogo do acervo correspondente (ou null), segundo o último cálculo. */
function findExisting(game) {
  return matches.get(game.appid) || null;
}

/* ------------------------------------------------------------
 * Lista
 * ------------------------------------------------------------ */

/** Jogos que passam pelos filtros da janela. */
function visibleGames() {
  const term = foldTitle($('#steam-filter').value);
  const show = $('input[name="steam-show"]:checked', dialog).value;
  const hideUnplayed = $('#steam-hide-unplayed').checked;
  return games.filter((g) => {
    if (hideUnplayed && g.hours <= 0) return false;
    if (term && !foldTitle(g.name).includes(term)) return false;
    const exists = !!findExisting(g);
    if (show === 'new' && exists) return false;
    if (show === 'existing' && !exists) return false;
    return true;
  });
}

function rowHtml(g) {
  const existing = findExisting(g);
  const cover = safeImageSrc(g.cover);
  const diff = existing ? Math.round((g.hours - (existing.hours_played || 0)) * 10) / 10 : 0;
  const badge = existing
    ? `<span class="steam-badge steam-badge--existing" title="${escapeHtml(t('steam.inLibrary'))}"><i class="fa-solid fa-check" aria-hidden="true"></i><span class="steam-badge__text">${escapeHtml(t('steam.inLibrary'))}${diff > 0 ? ` · +${formatNumber(diff)}h` : ''}</span></span>`
    : `<span class="steam-badge steam-badge--new" title="${escapeHtml(t('steam.new'))}"><i class="fa-solid fa-plus" aria-hidden="true"></i><span class="steam-badge__text">${escapeHtml(t('steam.new'))}</span></span>`;
  const meta = [
    `${formatNumber(g.hours)}h`,
    g.lastPlayed ? t('steam.lastPlayed', { date: formatDate(g.lastPlayed) }) : null,
  ].filter(Boolean).join(' · ');

  return `
    <li class="steam-game" data-appid="${g.appid}">
      <label class="steam-game__label">
        <input type="checkbox" class="steam-game__check" value="${g.appid}" ${selected.has(g.appid) ? 'checked' : ''}>
        <span class="steam-game__cover">
          ${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async">` : ''}
          <i class="fa-solid fa-gamepad" aria-hidden="true"></i>
        </span>
        <span class="steam-game__text">
          <strong>${escapeHtml(g.name)}</strong>
          <small>${escapeHtml(meta)}</small>
        </span>
        ${badge}
      </label>
    </li>`;
}

/** Redesenha a lista e os contadores. */
function renderList() {
  matches = buildMatches();
  const visible = visibleGames();
  const list = $('#steam-list');
  list.innerHTML = visible.length
    ? visible.map(rowHtml).join('')
    : `<li class="steam__empty muted">${escapeHtml(t('steam.noneVisible'))}</li>`;
  // Capa que não carregou: esconde a imagem e mostra o ícone.
  list.querySelectorAll('img').forEach((img) => img.addEventListener('error', () => img.remove(), { once: true }));
  syncCheckAll(visible);
}

/** Atualiza a caixa "selecionar todos" (marcada, desmarcada ou parcial) e o rodapé. */
function syncCheckAll(visible = visibleGames()) {
  const allChecked = visible.length > 0 && visible.every((g) => selected.has(g.appid));
  const someChecked = visible.some((g) => selected.has(g.appid));
  const checkAll = $('#steam-check-all');
  checkAll.checked = allChecked;
  checkAll.indeterminate = !allChecked && someChecked;
  updateFooter();
}

function updateFooter() {
  const chosen = games.filter((g) => selected.has(g.appid));
  const newCount = chosen.filter((g) => !findExisting(g)).length;
  const updateCount = chosen.length - newCount;
  $('#steam-selected').textContent = chosen.length
    ? t('steam.selectedSummary', { new: newCount, update: updateCount })
    : '';
  $('#steam-import-label').textContent = chosen.length ? tp('steam.importCount', chosen.length) : t('steam.import');
  $('#steam-import').disabled = busy || chosen.length === 0;
}

/* ------------------------------------------------------------
 * Carregamento
 * ------------------------------------------------------------ */

function showState(html) {
  $('#steam-state').innerHTML = html;
  $('#steam-state').hidden = !html;
  $('#steam-content').hidden = !!html;
}

async function loadLibrary(force = false) {
  // Reaproveita a lista por 5 minutos (evita chamadas repetidas).
  if (!force && games.length && Date.now() - loadedAt < 5 * 60 * 1000) {
    showState('');
    renderList();
    return;
  }
  showState(`<div class="steam__loading"><span class="spinner" aria-hidden="true"></span><span>${escapeHtml(t('steam.loading'))}</span></div>`);
  try {
    const body = await getSteamLibrary();
    games = body.games || [];
    loadedAt = Date.now();
    selected.clear();
    showState('');
    renderList();
    loadCovers();
  } catch (error) {
    showState(`
      <div class="empty">
        <div class="empty__icon" aria-hidden="true"><i class="fa-brands fa-steam"></i></div>
        <p class="empty__text">${escapeHtml(apiErrorMessage(error))}</p>
        <button type="button" class="btn btn--secondary" data-action="steam-retry"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i><span>${escapeHtml(t('actions.retry'))}</span></button>
      </div>`);
  }
}

/* ------------------------------------------------------------
 * Importação
 * ------------------------------------------------------------ */

/**
 * Busca capas verticais e nomes em português em lotes de 50, depois
 * que a lista já apareceu. Atualiza só as imagens na tela (sem redesenhar).
 */
async function loadCovers(list = games) {
  const pending = list.filter((g) => !g.coverResolved).map((g) => g.appid);
  for (let i = 0; i < pending.length; i += COVER_BATCH) {
    const batch = pending.slice(i, i + COVER_BATCH);
    try {
      const { covers = {} } = await getSteamCovers(batch);
      for (const [appid, info] of Object.entries(covers)) {
        const game = games.find((g) => g.appid === Number(appid));
        if (!game) continue;
        if (info.cover) game.cover = info.cover;
        if (info.name) game.name = info.name;
        game.coverResolved = true;
        const row = document.querySelector(`.steam-game[data-appid="${Number(appid)}"]`);
        if (!row) continue;
        const cover = row.querySelector('.steam-game__cover');
        let img = cover.querySelector('img');
        if (!img) {
          img = document.createElement('img');
          img.alt = '';
          img.loading = 'lazy';
          img.addEventListener('error', () => img.remove(), { once: true });
          cover.prepend(img);
        }
        img.src = safeImageSrc(game.cover);
        row.querySelector('.steam-game__text strong').textContent = game.name;
      }
    } catch {
      /* sem capas deste lote: fica a capa padrão */
    }
  }
}

function setProgress(done, total, label) {
  const box = $('#steam-progress');
  box.hidden = false;
  box.querySelector('.meter > span').style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
  $('#steam-progress-text').textContent = label;
}

/** Busca conquistas dos jogos escolhidos, em lotes de 40. */
async function fetchAchievements(chosen) {
  const withStats = chosen.filter((g) => g.hasStats).map((g) => g.appid);
  const result = {};
  for (let i = 0; i < withStats.length; i += ACHIEVEMENT_BATCH) {
    const batch = withStats.slice(i, i + ACHIEVEMENT_BATCH);
    setProgress(i, withStats.length, t('steam.progressAchievements', { done: i, total: withStats.length }));
    try {
      const body = await getSteamAchievements(batch);
      Object.assign(result, body.achievements || {});
    } catch {
      // Lote falhou: marca como erro (os jogos ficam só com as horas,
      // e as conquistas já salvas não são apagadas).
      batch.forEach((appid) => (result[appid] = { error: true }));
    }
  }
  return result;
}

/** Próximo "id" numérico (compatibilidade com o formato antigo). */
function nextIdFactory() {
  const ids = getState().medias.map((m) => Number(m.id)).filter(Number.isFinite);
  let next = ids.length ? Math.max(...ids) + 1 : 1;
  return () => next++;
}

/**
 * Grava um jogo: cria (novo) ou atualiza (existente).
 * Platina = todas as conquistas obtidas → também marca como zerado.
 */
async function saveGame(game, ach, nextId) {
  // ach = { total, obtained } ou { error: true } (falha ao ler: não mexe nas conquistas)
  const failed = !ach || ach.error;
  const total = failed ? 0 : ach.total || 0;
  const obtained = failed ? 0 : ach.obtained || 0;
  const platinum = total > 0 && obtained >= total;
  const existing = findExisting(game);

  if (existing) {
    const { _docId, ...rest } = existing;
    const data = {
      ...rest,
      // Horas nunca diminuem: se você registrou mais à mão, ficam as suas.
      hours_played: Math.max(Number(existing.hours_played) || 0, game.hours),
      steam_appid: game.appid,
      trophies_total: total || existing.trophies_total || null,
      trophies_obtained: total ? obtained : existing.trophies_obtained ?? null,
      beaten: existing.beaten || platinum,
      // Mantém "online" como estava, exceto quando a platina acaba de marcar como zerado.
      online: platinum && !existing.beaten ? false : existing.online,
      cover_img: existing.cover_img || game.cover,
    };
    const saved = await updateMedia(_docId, data);
    upsertMedia({ ...existing, ...saved });
    return 'updated';
  }

  const created = await createMedia({
    type: 'games',
    title: game.name,
    rating: null,
    // Data = última vez jogado (jogo nunca aberto fica sem data).
    consumed_date: game.lastPlayed || (game.hours > 0 ? todayISO() : null),
    cover_img: game.cover,
    hours_played: game.hours,
    trophies_total: total || null,
    trophies_obtained: total ? obtained : null,
    beaten: platinum,
    online: false,
    steam_appid: game.appid,
  }, nextId());
  upsertMedia(created);
  return 'created';
}

async function runImport() {
  const chosen = games.filter((g) => selected.has(g.appid));
  if (!chosen.length || busy) return;
  busy = true;
  dialog.classList.add('is-busy');
  updateFooter();

  const counts = { created: 0, updated: 0, failed: 0 };
  try {
    // As correspondências são decididas UMA vez, antes de gravar, para que
    // gravações em paralelo nunca escolham o mesmo jogo do acervo.
    matches = buildMatches();
    // Garante capa vertical e nome em português de quem ainda não carregou
    // (ex.: importou logo depois de abrir a janela).
    await loadCovers(chosen);
    const achievements = await fetchAchievements(chosen);
    const nextId = nextIdFactory();
    let done = 0;
    // Grava em pequenos grupos paralelos, com barra de progresso.
    for (let i = 0; i < chosen.length; i += WRITE_CONCURRENCY) {
      const group = chosen.slice(i, i + WRITE_CONCURRENCY);
      const results = await Promise.allSettled(group.map((g) => saveGame(g, achievements[g.appid], nextId)));
      results.forEach((r) => {
        if (r.status === 'fulfilled') counts[r.value]++;
        else {
          counts.failed++;
          console.error('Erro ao salvar jogo da Steam:', r.reason);
        }
      });
      done += group.length;
      setProgress(done, chosen.length, t('steam.progressSaving', { done, total: chosen.length }));
    }
  } finally {
    busy = false;
    dialog.classList.remove('is-busy');
    selected.clear();
    $('#steam-progress').hidden = true;
    renderList();
  }

  const message = t('steam.done', { created: counts.created, updated: counts.updated })
    + (counts.failed ? ` ${t('steam.failed', { count: counts.failed })}` : '');
  toast(message, counts.failed ? 'error' : 'success', 6000);
}

/* ------------------------------------------------------------
 * Inicialização
 * ------------------------------------------------------------ */

export function openSteamSync() {
  if (!getState().isOwner) return;
  openDialog(dialog);
  loadLibrary();
}

export function initSteamSync() {
  dialog = $('#steam-dialog');
  const button = $('#steam-button');

  // O botão só aparece se o Worker tiver a Steam configurada.
  if (apiEnabled()) {
    getProviders().then((providers) => {
      button.hidden = !providers.steamSync;
    });
  }
  button.addEventListener('click', openSteamSync);

  // Marcar/desmarcar um jogo (delegação: um listener para a lista toda).
  $('#steam-list').addEventListener('change', (event) => {
    const box = event.target.closest('.steam-game__check');
    if (!box) return;
    const appid = Number(box.value);
    if (box.checked) selected.add(appid);
    else selected.delete(appid);
    // Não redesenha a lista: mantém o foco e a rolagem onde estavam.
    syncCheckAll();
  });

  // Selecionar todos os VISÍVEIS (respeita busca e filtros).
  $('#steam-check-all').addEventListener('change', (event) => {
    visibleGames().forEach((g) => (event.target.checked ? selected.add(g.appid) : selected.delete(g.appid)));
    renderList();
  });

  $('#steam-filter').addEventListener('input', renderList);
  $('#steam-hide-unplayed').addEventListener('change', renderList);
  $$('input[name="steam-show"]', dialog).forEach((radio) => radio.addEventListener('change', renderList));
  $('#steam-import').addEventListener('click', runImport);

  $('#steam-state').addEventListener('click', (event) => {
    if (event.target.closest('[data-action="steam-retry"]')) loadLibrary(true);
  });

  // Não deixa fechar a janela no meio da importação.
  dialog.addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });
}
