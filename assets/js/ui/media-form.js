/**
 * ============================================================
 * media-form.js — UM formulário para adicionar E editar mídias
 * ============================================================
 * O código antigo tinha dois formulários quase iguais (Adicionar e
 * Editar), cada um montando o HTML dos campos na mão. Eles divergiam
 * e causavam bugs, por exemplo:
 * - editar um filme não salvava "use_hours", e a duração aparecia errada;
 * - editar uma série não salvava "use_episodes";
 * - editar a capa não redimensionava a imagem (estourava 1 MB);
 * - depois de salvar, a página recarregava e perdia o filtro.
 *
 * Agora os campos de cada tipo já estão no HTML (index.html, dentro de
 * <fieldset data-types="...">). Este arquivo só mostra o grupo certo,
 * preenche os valores, valida e monta o objeto que vai para o banco.
 */
import { $, $$, safeImageSrc, escapeHtml } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { todayISO } from '../core/format.js';
import { fileToResizedDataURL, COVER_SIZE } from '../core/image.js';
import { getState, upsertMedia } from '../core/state.js';
import { createMedia, updateMedia } from '../services/backend.js';
import { openDialog, closeDialog, toast, confirmDialog } from './dialogs.js';
import { typeIconHtml, typeName, initials } from './media-view.js';
import { PRIMARY_TYPES, ALL_TYPES } from '../config/media-types.js';
import { movieMinutes } from '../core/stats.js';
import { initMediaSearch, resetSearch, toggleSearch, updateSearchPlaceholder } from './media-search.js';

/** Limite seguro para a capa em base64 (o documento inteiro aceita 1 MB). */
const MAX_COVER_CHARS = 900_000;

let dialog;
let form;
let editing = null;        // mídia sendo editada (null = adicionando)
let coverValue = '';       // capa atual (base64, URL ou caminho relativo)
let snapshot = '';         // "foto" dos campos ao abrir, para detectar alterações

/** Serializa os campos visíveis + capa, para saber se algo mudou. */
function serialize() {
  const entries = [...new FormData(form)].filter(([, v]) => typeof v === 'string');
  return JSON.stringify(entries) + coverValue;
}

/* ------------------------------------------------------------
 * Tipo selecionado e grupos de campos
 * ------------------------------------------------------------ */

/** Tipo principal marcado no seletor (movies, series, ...). */
function selectedPrimaryType() {
  return form.querySelector('input[name="type"]:checked')?.value || '';
}

/**
 * Tipo FINAL que vai para o banco. "Filme" + "é animação" ou
 * "Animação" + "é um filme" viram "animated_movies".
 */
function finalType() {
  const primary = selectedPrimaryType();
  const animatedMovie = form.elements.is_animated_movie.checked;
  if ((primary === 'movies' || primary === 'animations') && animatedMovie) return 'animated_movies';
  return primary;
}

/**
 * Mostra apenas os campos do tipo escolhido. Os campos escondidos
 * também ficam "disabled": assim o navegador não exige preenchimento
 * de um campo obrigatório que está invisível.
 */
function syncFieldGroups() {
  const primary = selectedPrimaryType();
  const type = finalType();
  $$('fieldset[data-types]', form).forEach((fs) => {
    const visible = fs.dataset.types.split(' ').includes(type);
    fs.hidden = !visible;
    fs.disabled = !visible;
  });

  // Caixa "filme animado": só faz sentido para Filmes e Animações.
  const animatedRow = $('#animated-movie-row', form);
  const showAnimated = primary === 'movies' || primary === 'animations';
  animatedRow.hidden = !showAnimated;
  $('#animated-movie-label', form).textContent = t(primary === 'animations' ? 'form.isMovie' : 'form.isAnimated');

  // Séries: alterna entre controlar por temporadas ou por episódios.
  const byEpisodes = form.elements.use_episodes.value === 'true';
  $$('[data-track]', form).forEach((row) => {
    const visible = (row.dataset.track === 'episodes') === byEpisodes;
    row.hidden = !visible;
    row.querySelectorAll('input').forEach((input) => (input.disabled = !visible));
  });

  // Rótulo da data muda conforme o tipo ("Assistido em", "Jogado em"...).
  const verbKey = type === 'games' ? 'verbs.played' : ['books', 'mangas', 'comics'].includes(type) ? 'verbs.read' : 'verbs.watched';
  $('#consumed-date-label', form).textContent = t(verbKey);
  updateCoverPreview();
  updateSearchPlaceholder(type || 'movies');
}

/** Desenha os botões de tipo de acordo com os tipos ativos nas Configurações. */
function renderTypePicker(editingMedia = null) {
  const { activeTypes } = getState();
  // Na edição, o tipo da mídia SEMPRE aparece, mesmo que esteja desativado
  // nas Configurações (senão o formulário salvaria type vazio).
  const editPrimary = editingMedia ? primaryTypeOf(editingMedia) : null;
  const types = PRIMARY_TYPES.filter((type) => activeTypes.includes(type) || type === editPrimary);
  $('#type-picker', form).innerHTML = types.map((type) => `
    <label class="type-option" style="--accent: var(--type-${type})">
      <input type="radio" name="type" value="${type}" required>
      <span>${typeIconHtml(type)}${typeName(type)}</span>
    </label>`).join('');
}

/** Tipo principal usado no seletor para uma mídia já salva. */
function primaryTypeOf(m) {
  if (m.type !== 'animated_movies') return m.type;
  const { activeTypes } = getState();
  return activeTypes.includes('movies') || !activeTypes.includes('animations') ? 'movies' : 'animations';
}

/* ------------------------------------------------------------
 * Capa
 * ------------------------------------------------------------ */

/** Atualiza a pré-visualização da capa (imagem ou pôster gerado). */
function updateCoverPreview() {
  const preview = $('#cover-preview', form);
  const src = safeImageSrc(coverValue);
  const type = finalType() || 'movies';
  preview.style.setProperty('--accent', `var(--type-${type === 'animated_movies' ? 'animated' : type})`);
  preview.classList.toggle('poster--empty', !src);
  preview.querySelector('.poster__fallback').innerHTML = `${typeIconHtml(type)}<span>${escapeHtml(initials(form.elements.title.value || '?'))}</span>`;
  const img = preview.querySelector('img');
  if (src) {
    img.src = src;
    img.hidden = false;
  } else {
    img.removeAttribute('src');
    img.hidden = true;
  }
  $('#cover-remove', form).hidden = !src;
}

/** Processa um arquivo de imagem (input ou arrastar e soltar). */
async function useCoverFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    toast(t('form.errors.notImage'), 'error');
    return;
  }
  try {
    const dataUrl = await fileToResizedDataURL(file, COVER_SIZE);
    if (dataUrl.length > MAX_COVER_CHARS) throw new Error('too big');
    coverValue = dataUrl;
    form.elements.cover_url.value = '';
    updateCoverPreview();
  } catch (error) {
    console.error(error);
    toast(t('form.errors.image'), 'error');
  }
}

function setupCoverInputs() {
  const fileInput = $('#cover-file', form);
  const drop = $('#cover-preview', form);

  fileInput.addEventListener('change', () => useCoverFile(fileInput.files[0]));

  // Arrastar e soltar uma imagem em cima da pré-visualização.
  ['dragenter', 'dragover'].forEach((name) => drop.addEventListener(name, (e) => {
    e.preventDefault();
    drop.classList.add('is-dragging');
  }));
  ['dragleave', 'drop'].forEach((name) => drop.addEventListener(name, (e) => {
    e.preventDefault();
    drop.classList.remove('is-dragging');
  }));
  drop.addEventListener('drop', (e) => useCoverFile(e.dataTransfer.files[0]));

  // Colar uma URL de imagem (ex.: link de pôster). Fica pronto para a futura busca por API.
  form.elements.cover_url.addEventListener('change', () => {
    const url = form.elements.cover_url.value.trim();
    if (!url) {
      // Apagou o link: se a capa atual era esse link, remove a capa.
      if (/^https?:/i.test(coverValue)) {
        coverValue = '';
        updateCoverPreview();
      }
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      toast(t('form.errors.url'), 'error');
      return;
    }
    coverValue = url;
    updateCoverPreview();
  });

  $('#cover-remove', form).addEventListener('click', () => {
    coverValue = '';
    fileInput.value = '';
    form.elements.cover_url.value = '';
    updateCoverPreview();
  });

  form.elements.title.addEventListener('input', updateCoverPreview);

  // Link de capa quebrado: mostra o pôster gerado em vez do ícone de imagem quebrada.
  drop.querySelector('img').addEventListener('error', (event) => {
    event.target.hidden = true;
    drop.classList.add('poster--empty');
  });
}

/* ------------------------------------------------------------
 * Validação
 * ------------------------------------------------------------ */

/** Pares "feito / total" que não podem ter feito > total. */
const PAIRS = [
  ['trophies_obtained', 'trophies_total', 'form.errors.trophies'],
  ['pages_read', 'pages_total', 'form.errors.pages'],
  ['volume_read', 'volume_amount', 'form.errors.volumes'],
  ['seasons_watched', 'seasons_total', 'form.errors.seasons'],
  ['episodes_watched', 'episodes_total', 'form.errors.episodes'],
];

/**
 * Valida "lidos ≤ total" e afins usando a validação nativa do
 * navegador (mensagem aparece no próprio campo, sem alert()).
 */
function validatePairs() {
  for (const [doneName, totalName, messageKey] of PAIRS) {
    const done = form.elements[doneName];
    const total = form.elements[totalName];
    if (!done || done.disabled) continue;
    const d = Number(done.value);
    const tot = Number(total.value);
    done.setCustomValidity(done.value !== '' && total.value !== '' && d > tot ? t(messageKey) : '');
  }
}

/* ------------------------------------------------------------
 * Leitura e preenchimento dos campos
 * ------------------------------------------------------------ */

/** Lê um campo numérico (vazio → null). */
function num(name) {
  const el = form.elements[name];
  if (!el || el.disabled || el.value === '') return null;
  const n = Number(el.value);
  return Number.isFinite(n) ? n : null;
}

/** Monta o objeto que será salvo no Firestore. */
function collectData() {
  const type = finalType();
  const data = {
    type,
    title: form.elements.title.value.trim(),
    rating: num('rating'),
    consumed_date: form.elements.consumed_date.value,
    cover_img: coverValue || null,
  };
  // ID da Steam (vem da busca ou da sincronização); só faz sentido para jogos.
  if (type === 'games') data.steam_appid = num('steam_appid');

  switch (type) {
    case 'movies':
    case 'animated_movies':
      // Sempre salva como horas + minutos (formato único e simples).
      data.use_hours = true;
      data.duration_hours = num('duration_hours') ?? 0;
      data.duration_minutes = num('duration_minutes') ?? 0;
      data.duration_only_minutes = null;
      break;
    case 'series':
    case 'animations': {
      const byEpisodes = form.elements.use_episodes.value === 'true';
      data.use_episodes = byEpisodes;
      data.episodes_watched = byEpisodes ? num('episodes_watched') : null;
      data.episodes_total = byEpisodes ? num('episodes_total') : null;
      data.seasons_watched = byEpisodes ? null : num('seasons_watched');
      data.seasons_total = byEpisodes ? null : num('seasons_total');
      break;
    }
    case 'games': {
      const status = form.elements.game_status.value;
      data.hours_played = num('hours_played');
      data.beaten = status === 'beaten';
      // O app antigo permitia "online" e "zerado" ao mesmo tempo; se a mídia
      // já era assim e continua zerada, mantém o online para não perder a info.
      data.online = status === 'online' || (status === 'beaten' && editing?.online === true && editing?.beaten === true);
      data.trophies_obtained = num('trophies_obtained');
      data.trophies_total = num('trophies_total');
      break;
    }
    case 'books':
      data.pages_read = num('pages_read');
      data.pages_total = num('pages_total');
      break;
    case 'mangas':
    case 'comics':
      data.volume_read = num('volume_read');
      data.volume_amount = num('volume_amount');
      break;
    default:
      break;
  }
  return data;
}

/** Coloca um valor num campo (null/undefined → vazio). */
function setValue(name, value) {
  const el = form.elements[name];
  if (el) el.value = value ?? '';
}

/** Preenche o formulário com uma mídia existente (modo edição). */
function fillForm(m) {
  // Tipo principal: filme animado abre como Filme (ou Animação, se Filmes estiver desativado).
  const primary = primaryTypeOf(m);
  const radio = form.querySelector(`input[name="type"][value="${primary}"]`);
  if (radio) radio.checked = true;
  form.elements.is_animated_movie.checked = m.type === 'animated_movies';

  setValue('title', m.title);
  setValue('rating', m.rating);
  setValue('consumed_date', m.consumed_date);

  // Filmes: qualquer formato antigo (só minutos, horas+minutos, minutos > 59)
  // é convertido em horas + minutos pela mesma regra usada no card.
  const mins = movieMinutes(m);
  setValue('duration_hours', mins ? Math.floor(mins / 60) : '');
  setValue('duration_minutes', mins ? mins % 60 : '');

  form.elements.use_episodes.value = m.use_episodes ? 'true' : 'false';
  ['seasons_watched', 'seasons_total', 'episodes_watched', 'episodes_total', 'hours_played',
    'trophies_obtained', 'trophies_total', 'pages_read', 'pages_total', 'volume_read', 'volume_amount']
    .forEach((f) => setValue(f, m[f]));
  form.elements.game_status.value = m.beaten ? 'beaten' : m.online ? 'online' : 'playing';

  setValue('steam_appid', m.steam_appid);
  coverValue = m.cover_img || '';
  form.elements.cover_url.value = /^https?:/i.test(coverValue) ? coverValue : '';
}

/* ------------------------------------------------------------
 * Preenchimento pela busca automática
 * ------------------------------------------------------------ */

/** Campos que a busca pode preencher (dados do "produto", nunca pessoais). */
const PRODUCT_FIELDS = [
  'duration_hours', 'duration_minutes', 'seasons_total', 'episodes_total',
  'pages_total', 'volume_amount', 'trophies_total',
];

/**
 * Aplica os dados vindos da API no formulário.
 * - Título, capa e totais são preenchidos; tudo continua editável
 *   (ex.: a API diz 6 temporadas, mas você corrige para 5).
 * - Campos pessoais (nota, data, horas jogadas, troféus obtidos,
 *   páginas lidas, temporadas assistidas...) ficam como estavam.
 * - Os campos preenchidos ganham um destaque até serem editados.
 * - Na EDIÇÃO, título e capa que você já tinha são mantidos (a busca só
 *   preenche se estiverem vazios), para não trocar uma capa que você
 *   escolheu só porque buscou para completar os totais.
 */
function applyDetails(details) {
  // Ajusta "filme animado" quando a fonte indica (ex.: Toy Story buscado em Filmes).
  const primary = selectedPrimaryType();
  if (primary === 'movies' || primary === 'animations') {
    if (details.suggestedType === 'animated_movies') form.elements.is_animated_movie.checked = true;
    if (details.suggestedType === 'animations' || details.suggestedType === 'series') form.elements.is_animated_movie.checked = false;
  }
  // Animes do AniList contam por episódios; séries do TMDB, por temporadas.
  if (details.trackBy === 'episodes') form.elements.use_episodes.value = 'true';
  syncFieldGroups();

  const filled = [];
  const keepTitle = editing && form.elements.title.value.trim();
  if (details.title && !keepTitle) {
    form.elements.title.value = details.title;
    filled.push(form.elements.title);
  }
  const keepCover = editing && coverValue;
  if (details.cover && safeImageSrc(details.cover) && !keepCover) {
    coverValue = details.cover;
    form.elements.cover_url.value = details.cover;
  }
  for (const name of PRODUCT_FIELDS) {
    const value = details.fields?.[name];
    const el = form.elements[name];
    if (el && value != null && value !== '') {
      el.value = value;
      filled.push(el);
    }
  }
  // Resultado de outra fonte (ou de outro jogo) não pode deixar um ID da Steam antigo.
  setValue('steam_appid', details.steam_appid || '');

  $$('.is-autofilled', form).forEach((el) => el.classList.remove('is-autofilled'));
  filled.forEach((el) => el.classList.add('is-autofilled'));
  updateCoverPreview();
}

/* ------------------------------------------------------------
 * Abrir / salvar
 * ------------------------------------------------------------ */

/**
 * Abre o formulário.
 * @param {object|null} media  mídia para editar, ou null para adicionar
 */
export function openMediaForm(media = null) {
  editing = media;
  form.reset();
  $$('input', form).forEach((input) => {
    input.setCustomValidity('');
    input.classList.remove('is-autofilled');
  });
  // Campo oculto não é limpo pelo reset() (o valor fica no atributo).
  setValue('steam_appid', '');
  renderTypePicker(media);
  coverValue = '';

  const isEdit = !!media;
  $('#media-dialog-title').textContent = t(isEdit ? 'form.editTitle' : 'form.addTitle');
  $('#media-submit-label').textContent = t(isEdit ? 'actions.save' : 'actions.add');
  $('#media-delete').hidden = !isEdit;

  if (isEdit) {
    fillForm(media);
  } else {
    form.elements.consumed_date.value = todayISO();
    // Pré-seleciona o tipo do chip ativo (ex.: estava vendo "Jogos" → já abre em Jogo).
    const { filter } = getState();
    const preset = form.querySelector(`input[name="type"][value="${filter}"]`) || form.querySelector('input[name="type"]');
    if (preset) preset.checked = true;
    form.elements.game_status.value = 'playing';
    form.elements.use_episodes.value = selectedPrimaryType() === 'animations' ? 'true' : 'false';
  }

  // O tipo não muda na edição (os campos dependem dele).
  $$('input[name="type"]', form).forEach((input) => (input.disabled = isEdit && !input.checked));
  syncFieldGroups();
  resetSearch();
  toggleSearch(getState().isOwner);
  snapshot = serialize();
  openDialog(dialog);
  form.elements.title.focus();
}

/** Calcula o próximo "id" numérico (compatibilidade com o formato antigo). */
function nextNumericId() {
  const ids = getState().medias.map((m) => Number(m.id)).filter(Number.isFinite);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

async function handleSubmit(event) {
  event.preventDefault();
  validatePairs();
  if (!form.reportValidity()) return;

  const data = collectData();
  if (!ALL_TYPES.includes(data.type)) {
    toast(t('form.errors.type'), 'error');
    return;
  }
  const submit = $('#media-submit');
  submit.disabled = true;
  submit.classList.add('is-loading');

  try {
    if (editing) {
      const saved = await updateMedia(editing._docId, data);
      // Mantém campos antigos que não passam pelo formulário (ex.: commentaries).
      upsertMedia({ ...editing, ...saved });
      toast(t('toasts.updated', { title: data.title }), 'success');
    } else {
      const created = await createMedia(data, nextNumericId());
      upsertMedia(created);
      toast(t('toasts.added', { title: data.title }), 'success');
    }
    closeDialog(dialog);
  } catch (error) {
    console.error('Erro ao salvar mídia:', error);
    toast(t('toasts.saveError'), 'error');
  } finally {
    submit.disabled = false;
    submit.classList.remove('is-loading');
  }
}

/**
 * Liga o formulário. Chamado uma vez.
 * @param {object} callbacks  onDelete(media) → Promise<boolean>
 */
export function initMediaForm({ onDelete }) {
  dialog = $('#media-dialog');
  form = $('#media-form');

  form.addEventListener('change', (event) => {
    if (['type', 'is_animated_movie', 'use_episodes'].includes(event.target.name)) syncFieldGroups();
    // Trocou o tipo: resultados antigos não servem mais.
    if (event.target.name === 'type' || event.target.name === 'is_animated_movie') resetSearch();
  });
  form.addEventListener('input', (event) => {
    if (event.target.type === 'number') event.target.setCustomValidity('');
    // Editou um campo preenchido pela busca: tira o destaque.
    event.target.classList.remove('is-autofilled');
  });
  form.addEventListener('submit', handleSubmit);

  $('#media-delete').addEventListener('click', async () => {
    if (!editing) return;
    const deleted = await onDelete(editing);
    if (deleted) closeDialog(dialog);
  });

  // Esc ou botão Cancelar com alterações não salvas: pergunta antes de descartar.
  dialog.addEventListener('cancel', async (event) => {
    // No Chrome, um segundo Esc seguido pode não ser cancelável; nesse caso
    // a janela vai fechar de qualquer jeito e não adianta perguntar.
    if (!event.cancelable || serialize() === snapshot) return;
    event.preventDefault();
    const discard = await confirmDialog({
      title: t('form.discardTitle'),
      message: t('form.discardText'),
      confirmLabel: t('actions.discard'),
      danger: true,
    });
    if (discard) closeDialog(dialog);
  });

  setupCoverInputs();

  // Busca automática: o tipo pesquisado é o tipo final do formulário.
  initMediaSearch({ getType: () => finalType() || 'movies', onPick: applyDetails });
}
