/**
 * ============================================================
 * library.js — Grade de cards (a "biblioteca")
 * ============================================================
 * Responsável por desenhar os cards verticais, o estado de
 * carregamento (skeleton) e o estado vazio.
 *
 * CORREÇÃO DO BUG DE EDITAR COM FILTRO:
 * O código antigo adicionava, dentro do loop de cada card, um
 * listener em TODOS os botões de editar já existentes — e passava só
 * o ID (texto) para uma função que esperava o objeto da mídia. A cada
 * filtro os listeners se acumulavam e brigavam com o listener global.
 *
 * Agora existe UM único listener no contêiner da grade ("delegação de
 * eventos"). Não importa quantas vezes a grade é redesenhada: o clique
 * sempre encontra o card certo pelo data-id.
 */
import { $, escapeHtml } from '../core/dom.js';
import { t, tp } from '../core/i18n.js';
import { formatDate, formatRating } from '../core/format.js';
import { getProgress, progressPercent, isPlatinum } from '../core/stats.js';
import { getState, getVisibleMedias, findMedia, countAdvancedFilters } from '../core/state.js';
import { posterHtml, cardStats, statsHtml, typeName, typeIconHtml, accentStyle } from './media-view.js';

let grid;
let handlers = { onOpen: () => {}, onEdit: () => {}, onAdd: () => {}, onClearFilters: () => {}, onRetry: () => {} };

/** Monta o HTML de um card. */
function cardHtml(m, index) {
  const progress = getProgress(m);
  const pct = progressPercent(progress);
  const title = escapeHtml(m.title);

  // Barra de progresso no rodapé da capa (só para tipos com progresso).
  const progressBar = pct == null ? '' : `
    <div class="card__progress" role="img" aria-label="${escapeHtml(t('fields.progress'))}: ${pct}%">
      <span style="width:${pct}%"></span>
    </div>`;

  // Selo de platina para jogos com todos os troféus.
  const platinum = isPlatinum(m)
    ? `<span class="card__badge card__badge--gold" title="${escapeHtml(t('game.platinum'))}"><i class="fa-solid fa-trophy" aria-hidden="true"></i></span>`
    : '';

  return `
  <li class="card" style="${accentStyle(m.type)}" data-id="${escapeHtml(m._docId)}">
    <article class="card__inner">
      <div class="card__media">
        ${posterHtml(m, { eager: index < 6 })}
        <span class="card__type" title="${escapeHtml(typeName(m.type))}">
          ${typeIconHtml(m.type)}<span class="sr-only">${escapeHtml(typeName(m.type))}</span>
        </span>
        ${platinum}
        ${m.rating != null ? `<span class="card__rating"><i class="fa-solid fa-star" aria-hidden="true"></i>${formatRating(m.rating)}<span class="sr-only"> / 10</span></span>` : ''}
        ${progressBar}
      </div>
      <div class="card__body">
        <h3 class="card__title">
          <button type="button" class="card__open" data-action="open" title="${title}">${title}</button>
        </h3>
        <p class="card__date">
          <i class="fa-regular fa-calendar" aria-hidden="true"></i>
          <time datetime="${escapeHtml(m.consumed_date || '')}" title="${escapeHtml(formatDate(m.consumed_date))}">${escapeHtml(formatDate(m.consumed_date))}</time>
        </p>
        <p class="card__stats">${statsHtml(cardStats(m))}</p>
      </div>
      <button type="button" class="card__edit owner-only" data-action="edit"
        aria-label="${escapeHtml(t('actions.editItem', { title: m.title }))}">
        <i class="fa-solid fa-pen" aria-hidden="true"></i>
      </button>
    </article>
  </li>`;
}

/** Cards "fantasma" enquanto os dados carregam (evita tela em branco). */
function skeletonHtml(count = 12) {
  return Array.from({ length: count }, () => `
    <li class="card card--skeleton" aria-hidden="true">
      <div class="card__inner">
        <div class="card__media"><div class="poster skeleton"></div></div>
        <div class="card__body">
          <span class="skeleton skeleton--line"></span>
          <span class="skeleton skeleton--line skeleton--short"></span>
        </div>
      </div>
    </li>`).join('');
}

/**
 * Estado vazio: explica o motivo e oferece a próxima ação
 * (limpar filtros ou adicionar a primeira mídia).
 */
function emptyHtml() {
  const state = getState();
  const filtered = state.search || state.filter !== 'all' || countAdvancedFilters() > 0;
  const action = filtered
    ? `<button type="button" class="btn btn--secondary" data-action="clear-filters"><i class="fa-solid fa-filter-circle-xmark" aria-hidden="true"></i><span>${escapeHtml(t('empty.clear'))}</span></button>`
    : `<button type="button" class="btn btn--primary owner-only" data-action="add"><i class="fa-solid fa-plus" aria-hidden="true"></i><span>${escapeHtml(t('actions.add'))}</span></button>`;
  return `
    <li class="empty">
      <div class="empty__icon" aria-hidden="true"><i class="fa-solid ${filtered ? 'fa-magnifying-glass' : 'fa-photo-film'}"></i></div>
      <h2 class="empty__title">${escapeHtml(t(filtered ? 'empty.filteredTitle' : 'empty.title'))}</h2>
      <p class="empty__text">${escapeHtml(t(filtered ? 'empty.filteredText' : 'empty.text'))}</p>
      ${action}
    </li>`;
}

/** Redesenha a grade inteira com base no estado atual. */
export function renderLibrary() {
  const state = getState();
  grid.setAttribute('aria-busy', String(state.loading));

  if (state.loading) {
    grid.innerHTML = skeletonHtml();
    $('#results-count').textContent = '';
    return;
  }

  // Erro ao carregar fica no estado: qualquer redesenho continua mostrando o erro.
  if (state.loadError) {
    grid.innerHTML = `
      <li class="empty">
        <div class="empty__icon" aria-hidden="true"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <h2 class="empty__title">${escapeHtml(t('empty.errorTitle'))}</h2>
        <p class="empty__text">${escapeHtml(t('empty.errorText'))}</p>
        <button type="button" class="btn btn--primary" data-action="retry"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i><span>${escapeHtml(t('actions.retry'))}</span></button>
      </li>`;
    $('#results-count').textContent = '';
    return;
  }

  const list = getVisibleMedias();
  grid.innerHTML = list.length ? list.map(cardHtml).join('') : emptyHtml();
  $('#results-count').textContent = tp('toolbar.results', list.length);
}

/**
 * Liga a grade aos callbacks do app. Chamado uma única vez.
 * @param {object} callbacks  onOpen(media), onEdit(media), onAdd(), onClearFilters(), onRetry()
 */
export function initLibrary(callbacks) {
  grid = $('#media-grid');
  handlers = { ...handlers, ...callbacks };

  grid.addEventListener('click', (event) => {
    const actionEl = event.target.closest('[data-action]');
    const card = event.target.closest('.card[data-id]');

    if (actionEl?.dataset.action === 'clear-filters') return handlers.onClearFilters();
    if (actionEl?.dataset.action === 'add') return handlers.onAdd();
    if (actionEl?.dataset.action === 'retry') return handlers.onRetry();
    if (!card) return;

    const media = findMedia(card.dataset.id);
    if (!media) return;
    if (actionEl?.dataset.action === 'edit') handlers.onEdit(media);
    else handlers.onOpen(media); // clicar em qualquer parte do card abre os detalhes
  });
}
