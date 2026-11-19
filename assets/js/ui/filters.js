/**
 * ============================================================
 * filters.js — Janela de Filtros Avançados
 * ============================================================
 * No celular aparece como "bottom sheet" (sobe de baixo); no
 * computador, como janela central. O botão principal mostra quantos
 * resultados o filtro vai trazer ANTES de aplicar ("Ver 12 resultados").
 *
 * Correção: no código antigo, aplicar o filtro avançado desenhava a
 * lista uma vez e depois qualquer busca, ordenação ou edição apagava
 * o filtro. Agora ele faz parte do estado e convive com os demais.
 * A ordenação, que ficava duplicada aqui, passou para a barra.
 */

import { $, $$ } from '../core/dom.js';
import { t, tp } from '../core/i18n.js';
import { PRIMARY_TYPES } from '../config/media-types.js';
import { getState, setState, getVisibleMedias, EMPTY_ADVANCED } from '../core/state.js';
import { openDialog, closeDialog } from './dialogs.js';
import { typeIconHtml, typeName } from './media-view.js';

let dialog;
let form;

/** Lê o formulário e devolve o objeto de filtros avançados. */
function readForm() {
  const num = (name) => {
    const value = form.elements[name].value;
    return value === '' ? null : Number(value);
  };
  return {
    types: $$('input[name="adv-type"]:checked', form).map((cb) => cb.value),
    yearFrom: num('year_from'),
    yearTo: num('year_to'),
    ratingMin: num('rating_min'),
    ratingMax: num('rating_max'),
    completionMin: num('completion_min'),
  };
}

/** Preenche o formulário com os filtros atuais. */
function fillForm(adv) {
  const { activeTypes } = getState();
  $('#adv-types', form).innerHTML = PRIMARY_TYPES.filter((type) => activeTypes.includes(type)).map((type) => `
    <label class="check-chip" style="--accent: var(--type-${type})">
      <input type="checkbox" name="adv-type" value="${type}" ${adv.types.includes(type) ? 'checked' : ''}>
      <span>${typeIconHtml(type)}${typeName(type, true)}</span>
    </label>`).join('');
  const set = (name, value) => (form.elements[name].value = value ?? '');
  set('year_from', adv.yearFrom);
  set('year_to', adv.yearTo);
  set('rating_min', adv.ratingMin);
  set('rating_max', adv.ratingMax);
  set('completion_min', adv.completionMin);
}

/**
 * Atualiza o texto "Ver N resultados" calculando a lista como ficaria
 * com os filtros do formulário (sem aplicar de verdade).
 */
function updatePreviewCount() {
  const count = getVisibleMedias({ advanced: readForm() }).length;
  $('#adv-apply-label', form).textContent = tp('filters.showResults', count);
}

/** Abre a janela já preenchida com os filtros em uso. */
export function openFilters() {
  fillForm(getState().advanced);
  updatePreviewCount();
  openDialog(dialog);
}

/** Liga os eventos. Chamado uma vez. */
export function initFilters() {
  dialog = $('#filters-dialog');
  form = $('#filters-form');

  form.addEventListener('input', updatePreviewCount);
  form.addEventListener('change', updatePreviewCount);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const adv = readForm();
    // Se "de" for maior que "até", inverte automaticamente.
    if (adv.yearFrom != null && adv.yearTo != null && adv.yearFrom > adv.yearTo) [adv.yearFrom, adv.yearTo] = [adv.yearTo, adv.yearFrom];
    if (adv.ratingMin != null && adv.ratingMax != null && adv.ratingMin > adv.ratingMax) [adv.ratingMin, adv.ratingMax] = [adv.ratingMax, adv.ratingMin];
    setState({ advanced: adv });
    closeDialog(dialog);
  });

  $('#adv-clear', form).addEventListener('click', () => {
    fillForm({ ...EMPTY_ADVANCED });
    updatePreviewCount();
  });

  $('#filters-button').addEventListener('click', openFilters);
  // Rótulo inicial (antes de qualquer interação)
  $('#adv-apply-label', form).textContent = t('filters.apply');
}
