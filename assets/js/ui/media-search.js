/**
 * ============================================================
 * media-search.js — Busca automática no formulário de mídia
 * ============================================================
 * Campo "Buscar dados automaticamente" no topo do formulário:
 * 1. A dona digita o título (mínimo 2 letras).
 * 2. Depois de uma pausa curta, o site pergunta ao Worker, que consulta
 *    a fonte certa para o tipo escolhido:
 *      Filmes/Séries/Animações → TMDB (títulos em português) + AniList
 *      Jogos → loja da Steam      Livros → Google Books
 *      Mangás → AniList           HQs → Comic Vine + Google Books
 * 3. Ao escolher um resultado, busca os detalhes (duração, temporadas,
 *    páginas, total de conquistas...) e entrega para media-form.js
 *    preencher os campos. Campos pessoais (horas jogadas, lidas,
 *    assistidas, nota) NÃO são tocados, e tudo continua editável.
 *
 * Acessibilidade: segue o padrão "combobox" do WAI-ARIA (setas para
 * navegar, Enter escolhe, Esc fecha a lista sem fechar a janela).
 */
import { $, escapeHtml, safeImageSrc } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { searchMedia, getMediaDetails, apiEnabled } from '../services/api.js';

/** Nome das fontes mostrado em cada resultado. */
const SOURCE_LABELS = {
  tmdb: 'TMDB', anilist: 'AniList', steam: 'Steam', gbooks: 'Google Books', comicvine: 'Comic Vine',
};

let input;
let list;
let status;
let box;
let results = [];
let active = -1;
let searchController = null;   // cancela buscas antigas
let detailsController = null;  // cancela pedidos de detalhes antigos
let searchTimer = null;        // espera a pessoa parar de digitar
let busyCount = 0;             // quantos pedidos estão em andamento (spinner)
let options = { getType: () => 'movies', onPick: () => {} };

/** Traduz o código de erro do Worker numa frase útil. */
export function apiErrorMessage(error) {
  const code = error?.code || 'upstream_error';
  const key = {
    missing_token: 'api.errors.login', not_owner: 'api.errors.login', invalid_token: 'api.errors.login', token_expired: 'api.errors.login',
    network_error: 'api.errors.network', origin_not_allowed: 'api.errors.origin',
    tmdb_not_configured: 'api.errors.tmdb', steam_not_configured: 'api.errors.steam',
    steam_id_not_configured: 'api.errors.steamId', steam_private: 'api.errors.steamPrivate',
    worker_not_configured: 'api.errors.worker', upstream_timeout: 'api.errors.timeout',
  }[code] || 'api.errors.generic';
  return t(key);
}

function setStatus(text, tone = '') {
  status.textContent = text;
  status.dataset.tone = tone;
}

/** Liga/desliga o spinner contando pedidos, para um não apagar o do outro. */
function setBusy(busy) {
  busyCount = Math.max(0, busyCount + (busy ? 1 : -1));
  box.classList.toggle('is-busy', busyCount > 0);
}

/** Cancela a busca que estava esperando a pessoa parar de digitar. */
function cancelPendingSearch() {
  clearTimeout(searchTimer);
  searchTimer = null;
}

function closeList() {
  list.hidden = true;
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
  active = -1;
}

/** Desenha a lista de resultados. */
function renderResults() {
  if (!results.length) {
    list.innerHTML = '';
    closeList();
    return;
  }
  list.innerHTML = results.map((r, i) => {
    const cover = safeImageSrc(r.cover);
    const meta = [r.year, r.subtitle].filter(Boolean).join(' · ');
    return `
      <li id="media-search-opt-${i}" class="search-option" role="option" aria-selected="false" data-index="${i}">
        <span class="search-option__cover">${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy">` : '<i class="fa-solid fa-image" aria-hidden="true"></i>'}</span>
        <span class="search-option__text">
          <strong>${escapeHtml(r.title)}</strong>
          ${meta ? `<small>${escapeHtml(meta)}</small>` : ''}
        </span>
        <span class="search-option__source">${escapeHtml(SOURCE_LABELS[r.source] || r.source)}</span>
      </li>`;
  }).join('');
  // Só abre a lista se o campo ainda estiver em foco (resultado que chega
  // depois de a pessoa sair do campo não "pula" na tela).
  if (document.activeElement !== input) return;
  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  // Capa quebrada no resultado: troca por ícone.
  list.querySelectorAll('img').forEach((img) => img.addEventListener('error', () => {
    img.replaceWith(Object.assign(document.createElement('i'), { className: 'fa-solid fa-image' }));
  }, { once: true }));
}

/** Marca visualmente a opção ativa (navegação por setas). */
function highlight(index) {
  const items = list.querySelectorAll('.search-option');
  items.forEach((el, i) => el.setAttribute('aria-selected', String(i === index)));
  active = index;
  if (index >= 0 && items[index]) {
    input.setAttribute('aria-activedescendant', items[index].id);
    items[index].scrollIntoView({ block: 'nearest' });
  } else {
    input.removeAttribute('aria-activedescendant');
  }
}

/** Faz a busca (cancelando a anterior, se ainda estiver rodando). */
async function runSearch() {
  const q = input.value.trim();
  searchController?.abort();
  if (q.length < 2) {
    results = [];
    renderResults();
    setStatus('');
    return;
  }
  const controller = new AbortController();
  searchController = controller;
  setBusy(true);
  setStatus(t('search.searching'));
  try {
    const body = await searchMedia(options.getType(), q, controller.signal);
    results = body.results || [];
    renderResults();
    setStatus(results.length ? t('search.pick', { count: results.length }) : t('search.none'));
  } catch (error) {
    if (error.name === 'AbortError') return;
    results = [];
    renderResults();
    setStatus(apiErrorMessage(error), 'error');
  } finally {
    setBusy(false);
  }
}

/** Escolhe um resultado: busca os detalhes e entrega ao formulário. */
async function pick(index) {
  const chosen = results[index];
  if (!chosen) return;
  // Escolheu: nenhuma busca pendente pode mais interferir.
  cancelPendingSearch();
  searchController?.abort();
  closeList();
  input.value = chosen.title;
  detailsController?.abort();
  const controller = new AbortController();
  detailsController = controller;
  setBusy(true);
  setStatus(t('search.loadingDetails'));
  try {
    const details = await getMediaDetails(chosen.ref, controller.signal);
    // Se os detalhes vierem sem capa, usa a do resultado.
    options.onPick({ ...details, cover: details.cover || chosen.cover });
    setStatus(t('search.filled', { source: SOURCE_LABELS[details.source] || details.source }), 'success');
  } catch (error) {
    if (error.name === 'AbortError') return;
    // Mesmo sem detalhes, aproveita título e capa do resultado.
    options.onPick({ ...chosen, fields: {} });
    setStatus(apiErrorMessage(error), 'error');
  } finally {
    setBusy(false);
  }
}

/** Limpa o campo e a lista (ao abrir o formulário ou trocar de tipo). */
export function resetSearch() {
  if (!input) return;
  cancelPendingSearch();
  searchController?.abort();
  detailsController?.abort();
  input.value = '';
  results = [];
  renderResults();
  setStatus('');
  busyCount = 0;
  box.classList.remove('is-busy');
}

/** Mostra ou esconde a busca (só com Worker configurado e dona logada). */
export function toggleSearch(visible) {
  $('#media-search').hidden = !(visible && apiEnabled());
}

/** Atualiza a dica do campo conforme o tipo escolhido. */
export function updateSearchPlaceholder(type) {
  if (!input) return;
  input.placeholder = t(`search.placeholders.${type}`, {});
}

/**
 * Liga a busca. Chamado uma vez por media-form.js.
 * @param {object} opts
 * @param {() => string} opts.getType  tipo final escolhido no formulário
 * @param {(details: object) => void} opts.onPick  preenche o formulário
 */
export function initMediaSearch(opts) {
  options = { ...options, ...opts };
  input = $('#media-search-input');
  list = $('#media-search-results');
  status = $('#media-search-status');
  box = $('#media-search .media-search__box');

  input.addEventListener('input', () => {
    cancelPendingSearch();
    searchTimer = setTimeout(runSearch, 350);
  });

  input.addEventListener('keydown', (event) => {
    const open = !list.hidden && results.length;
    if (event.key === 'ArrowDown' && !open && results.length) {
      // Lista fechada (ex.: depois do Esc): seta para baixo reabre.
      event.preventDefault();
      renderResults();
      highlight(0);
    } else if (event.key === 'ArrowDown' && open) {
      event.preventDefault();
      highlight((active + 1) % results.length);
    } else if (event.key === 'ArrowUp' && open) {
      event.preventDefault();
      highlight((active - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      // Enter na busca nunca envia o formulário.
      event.preventDefault();
      if (open) pick(active >= 0 ? active : 0);
    } else if (event.key === 'Escape' && open) {
      // Fecha só a lista, não a janela inteira.
      event.preventDefault();
      event.stopPropagation();
      closeList();
    }
  });

  // mousedown (e não click) para escolher antes do campo perder o foco.
  list.addEventListener('mousedown', (event) => {
    const option = event.target.closest('.search-option');
    if (!option) return;
    event.preventDefault();
    pick(Number(option.dataset.index));
  });

  input.addEventListener('blur', () => setTimeout(closeList, 150));
  input.addEventListener('focus', () => {
    if (results.length) renderResults();
  });
}
