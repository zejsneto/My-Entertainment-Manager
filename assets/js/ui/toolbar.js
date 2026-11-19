/**
 * ============================================================
 * toolbar.js — Chips de tipo, busca, ordenação e filtros aplicados
 * ============================================================
 * A barra fica "grudada" no topo ao rolar (position: sticky).
 * - Chips: um por tipo ativo nas Configurações, com contagem.
 * - Busca: filtra pelo título enquanto digita (com debounce).
 * - Ordenação: um único <select> (antes havia um para PC e outro
 *   para celular, sincronizados na mão).
 * - Filtros aplicados: "pílulas" removíveis logo abaixo da barra,
 *   como recomenda o Baymard Institute (o usuário vê e desfaz cada
 *   filtro sem abrir a janela de novo).
 */
import { $, escapeHtml, debounce } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { formatRating } from '../core/format.js';
import { PRIMARY_TYPES, TYPE_GROUPS } from '../config/media-types.js';
import { getState, setState, getEnabledMedias, countAdvancedFilters, EMPTY_ADVANCED } from '../core/state.js';
import { typeIconHtml, typeName } from './media-view.js';

/** Desenha os chips de tipo (com contagem de itens de cada um). */
export function renderChips() {
  const { activeTypes, filter } = getState();
  const enabled = getEnabledMedias();
  const countFor = (type) => {
    const group = new Set(TYPE_GROUPS[type] || [type]);
    return enabled.filter((m) => group.has(m.type)).length;
  };

  const types = PRIMARY_TYPES.filter((type) => activeTypes.includes(type));
  const chip = (value, icon, label, count) => `
    <button type="button" class="chip ${filter === value ? 'is-active' : ''}" data-filter="${value}"
      aria-pressed="${filter === value}" style="--accent: var(--type-${value === 'all' ? 'all' : value})">
      ${icon}<span>${escapeHtml(label)}</span><span class="chip__count">${count}</span>
    </button>`;

  // "Tudo" só aparece quando há 2 ou mais tipos ativos (regra do código antigo).
  const allChip = types.length >= 2
    ? chip('all', '<i class="fa-solid fa-layer-group" aria-hidden="true"></i>', t('toolbar.all'), enabled.length)
    : '';

  $('#type-chips').innerHTML = allChip + types.map((type) => chip(type, typeIconHtml(type), typeName(type, true), countFor(type))).join('');
}

/**
 * Pílulas dos filtros aplicados (busca + filtros avançados),
 * cada uma com um "x" para remover só aquele filtro.
 */
export function renderAppliedFilters() {
  const { advanced, search } = getState();
  const pills = [];
  const pill = (key, label) => pills.push(`
    <button type="button" class="pill" data-remove="${key}">
      <span>${escapeHtml(label)}</span><i class="fa-solid fa-xmark" aria-hidden="true"></i>
      <span class="sr-only">${escapeHtml(t('filters.remove'))}</span>
    </button>`);

  if (search.trim()) pill('search', `“${search.trim()}”`);
  if (advanced.types.length) pill('types', advanced.types.map((type) => typeName(type, true)).join(', '));
  if (advanced.yearFrom != null || advanced.yearTo != null) {
    pill('year', `${t('filters.year')}: ${advanced.yearFrom ?? '…'}–${advanced.yearTo ?? '…'}`);
  }
  if (advanced.ratingMin != null || advanced.ratingMax != null) {
    pill('rating', `${t('fields.rating')}: ${advanced.ratingMin != null ? formatRating(advanced.ratingMin) : '0'}–${advanced.ratingMax != null ? formatRating(advanced.ratingMax) : '10'}`);
  }
  if (advanced.completionMin != null) pill('completion', `${t('fields.progress')} ≥ ${advanced.completionMin}%`);

  const bar = $('#applied-filters');
  bar.hidden = pills.length === 0;
  bar.innerHTML = pills.join('') + (pills.length > 1
    ? `<button type="button" class="link-button" data-remove="all">${escapeHtml(t('filters.clearAll'))}</button>`
    : '');

  // Selo com o número de filtros avançados no botão "Filtros".
  const badge = $('#filters-badge');
  const n = countAdvancedFilters();
  badge.textContent = n;
  badge.hidden = n === 0;
}

/** Limpa busca, chip e filtros avançados. */
export function clearAllFilters() {
  $('#search-input').value = '';
  setState({ search: '', filter: 'all', advanced: { ...EMPTY_ADVANCED } });
}

/** Liga os eventos da barra. Chamado uma vez. */
export function initToolbar() {
  // Chips (delegação: um listener para todos)
  $('#type-chips').addEventListener('click', (event) => {
    const chip = event.target.closest('.chip[data-filter]');
    if (!chip) return;
    setState({ filter: chip.dataset.filter });
  });

  // Busca com debounce de 150 ms
  const searchInput = $('#search-input');
  const applySearch = debounce(() => setState({ search: searchInput.value }), 150);
  searchInput.addEventListener('input', () => {
    $('#search-clear').hidden = !searchInput.value;
    applySearch();
  });
  $('#search-clear').addEventListener('click', () => {
    searchInput.value = '';
    $('#search-clear').hidden = true;
    setState({ search: '' });
    searchInput.focus();
  });

  // Ordenação
  const sortSelect = $('#sort-select');
  sortSelect.value = getState().sort;
  sortSelect.addEventListener('change', () => setState({ sort: sortSelect.value }));

  // Remover filtros aplicados
  $('#applied-filters').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-remove]');
    if (!btn) return;
    const key = btn.dataset.remove;
    const advanced = { ...getState().advanced };
    if (key === 'all') return clearAllFilters();
    if (key === 'search') {
      searchInput.value = '';
      $('#search-clear').hidden = true;
      return setState({ search: '' });
    }
    if (key === 'types') advanced.types = [];
    if (key === 'year') Object.assign(advanced, { yearFrom: null, yearTo: null });
    if (key === 'rating') Object.assign(advanced, { ratingMin: null, ratingMax: null });
    if (key === 'completion') advanced.completionMin = null;
    setState({ advanced });
  });
}
