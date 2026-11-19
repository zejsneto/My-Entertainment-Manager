/**
 * ============================================================
 * state.js — Estado central da aplicação
 * ============================================================
 * Antes, a lista de mídias, o filtro atual e a ordenação estavam
 * espalhados em variáveis globais (globalMedias, currentMedias,
 * currentFilter...), e cada parte da tela filtrava do seu jeito.
 * Foi isso que causou, por exemplo, o filtro avançado "sumir" ao
 * buscar, e a lista recarregar inteira depois de editar.
 *
 * Agora existe UM objeto de estado e UMA função que calcula o que
 * deve aparecer na tela (getVisibleMedias). Quem quiser reagir a
 * mudanças chama subscribe(); quem muda chama setState().
 */
import { getActiveTypes } from './prefs.js';
import { TYPE_GROUPS } from '../config/media-types.js';
import { completionPercent, movieMinutes } from './stats.js';
import { parseISODate, yearOf } from './format.js';

/** Filtros avançados "vazios" (nenhuma restrição). */
export const EMPTY_ADVANCED = Object.freeze({
  types: [],          // tipos principais marcados (vazio = todos)
  yearFrom: null,
  yearTo: null,
  ratingMin: null,
  ratingMax: null,
  completionMin: null,
});

const state = {
  medias: [],                 // todas as mídias carregadas do banco
  loading: true,              // true enquanto o Firestore não respondeu
  loadError: false,           // true se a leitura do banco falhou
  activeTypes: getActiveTypes(), // tipos ativos nas Configurações
  filter: 'all',              // chip selecionado ("all" ou um tipo principal)
  search: '',                 // texto da busca
  sort: 'date-desc',          // ordenação escolhida
  advanced: { ...EMPTY_ADVANCED },
  view: 'library',            // "library" (cards) ou "dashboard"
  isOwner: false,             // true quando a dona está logada
  profile: { name: '', username: '', photo: '', favoriteMediaId: null },
  demoMode: false,            // true se o Firebase não carregou (dados de exemplo)
};

const listeners = new Set();

/** Leitura do estado (não altere o objeto diretamente; use setState). */
export function getState() {
  return state;
}

/** Atualiza parte do estado e avisa todos os inscritos. */
export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => fn(state, patch));
}

/** Registra uma função que roda sempre que o estado muda. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Substitui (ou insere) uma mídia na lista local, sem recarregar a página. */
export function upsertMedia(media) {
  const list = state.medias.filter((m) => m._docId !== media._docId);
  list.push(media);
  setState({ medias: list });
}

/** Remove uma mídia da lista local. */
export function removeMedia(docId) {
  setState({ medias: state.medias.filter((m) => m._docId !== docId) });
}

/** Encontra mídia pelo ID do Firestore (ou pelo id numérico antigo). */
export function findMedia(id) {
  if (id == null) return null;
  const key = String(id);
  return state.medias.find((m) => m._docId === key) || state.medias.find((m) => String(m.id) === key) || null;
}

/* ------------------------------------------------------------
 * Pipeline de filtragem
 * ------------------------------------------------------------ */

/** Tipos do banco que pertencem aos tipos principais ativos. */
export function expandTypes(primaryTypes) {
  const set = new Set();
  primaryTypes.forEach((t) => (TYPE_GROUPS[t] || [t]).forEach((x) => set.add(x)));
  return set;
}

/** Mídias permitidas pelas Configurações (tipos ativos). */
export function getEnabledMedias() {
  const allowed = expandTypes(state.activeTypes);
  return state.medias.filter((m) => allowed.has(m.type));
}

/** Quantos filtros avançados estão em uso (para o selo no botão). */
export function countAdvancedFilters(adv = state.advanced) {
  let n = 0;
  if (adv.types.length) n++;
  if (adv.yearFrom != null || adv.yearTo != null) n++;
  if (adv.ratingMin != null || adv.ratingMax != null) n++;
  if (adv.completionMin != null) n++;
  return n;
}

/** Normaliza texto para busca: minúsculas e sem acentos ("Pokémon" → "pokemon"). */
function fold(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Comparadores de cada opção de ordenação. */
const SORTERS = {
  'date-desc': (a, b) => (parseISODate(b.consumed_date) || 0) - (parseISODate(a.consumed_date) || 0),
  'date-asc': (a, b) => (parseISODate(a.consumed_date) || 0) - (parseISODate(b.consumed_date) || 0),
  'title-asc': (a, b) => a.title.localeCompare(b.title),
  'title-desc': (a, b) => b.title.localeCompare(a.title),
  'rating-desc': (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
  'rating-asc': (a, b) => (a.rating ?? 99) - (b.rating ?? 99),
  'completion-desc': (a, b) => completionPercent(b) - completionPercent(a),
  'hours-desc': (a, b) => (b.hours_played || 0) - (a.hours_played || 0),
  'duration-desc': (a, b) => movieMinutes(b) - movieMinutes(a),
};

/**
 * Calcula a lista que aparece na tela, sempre na mesma ordem:
 * Configurações → chip de tipo → filtros avançados → busca → ordenação.
 * Como tudo passa por aqui, editar com um filtro ativo mantém o filtro.
 *
 * @param {object} [overrides] valores para simular sem alterar o estado
 *   (usado na prévia "Ver N resultados" da janela de filtros).
 */
export function getVisibleMedias(overrides = {}) {
  const { filter, search, sort, advanced } = { ...state, ...overrides };
  let list = getEnabledMedias();

  // 1) Chip de tipo
  if (filter !== 'all') {
    const group = new Set(TYPE_GROUPS[filter] || [filter]);
    list = list.filter((m) => group.has(m.type));
  }

  // 2) Filtros avançados
  if (advanced.types.length) {
    const allowed = expandTypes(advanced.types);
    list = list.filter((m) => allowed.has(m.type));
  }
  if (advanced.yearFrom != null) list = list.filter((m) => (yearOf(m.consumed_date) ?? -Infinity) >= advanced.yearFrom);
  if (advanced.yearTo != null) list = list.filter((m) => (yearOf(m.consumed_date) ?? Infinity) <= advanced.yearTo);
  if (advanced.ratingMin != null) list = list.filter((m) => (m.rating ?? -1) >= advanced.ratingMin);
  if (advanced.ratingMax != null) list = list.filter((m) => (m.rating ?? 99) <= advanced.ratingMax);
  if (advanced.completionMin != null) list = list.filter((m) => completionPercent(m) >= advanced.completionMin);

  // 3) Busca (no título, sem diferenciar acentos)
  const term = fold(search.trim());
  if (term) list = list.filter((m) => fold(m.title).includes(term));

  // 4) Ordenação (título em ordem alfabética como desempate)
  const sorter = SORTERS[sort] || SORTERS['date-desc'];
  return [...list].sort((a, b) => sorter(a, b) || a.title.localeCompare(b.title));
}
