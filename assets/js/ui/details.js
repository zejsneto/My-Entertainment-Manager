/**
 * ============================================================
 * details.js — Janela de detalhes de uma mídia
 * ============================================================
 * Ao clicar num card, abre esta janela com a capa grande e TODAS as
 * informações (o card mostra só o essencial). Para a dona logada,
 * aparecem os botões Editar e Excluir.
 */
import { $, escapeHtml } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { formatDateLong, formatRating } from '../core/format.js';
import { getProgress, progressPercent } from '../core/stats.js';
import { MEDIA_TYPES } from '../config/media-types.js';
import { openDialog, closeDialog } from './dialogs.js';
import { posterHtml, typeName, typeIconHtml, detailRows, accentStyle } from './media-view.js';

let dialog;
let current = null;
let handlers = { onEdit: () => {}, onDelete: () => {} };

/** Preenche e abre a janela para a mídia informada. */
export function openDetails(media) {
  current = media;
  const pct = progressPercent(getProgress(media));
  const verb = t(MEDIA_TYPES[media.type]?.verbKey || 'verbs.watched');

  $('#details-body', dialog).innerHTML = `
    <div class="details" style="${accentStyle(media.type)}">
      <div class="details__poster">${posterHtml(media, { eager: true })}</div>
      <div class="details__info">
        <span class="tag tag--accent">${typeIconHtml(media.type)}${escapeHtml(typeName(media.type))}</span>
        <h2 class="details__title" id="details-title">${escapeHtml(media.title)}</h2>
        <div class="details__headline">
          ${media.rating != null ? `
          <span class="details__rating" aria-label="${escapeHtml(t('fields.rating'))}: ${formatRating(media.rating)} / 10">
            <i class="fa-solid fa-star" aria-hidden="true"></i>
            <strong>${formatRating(media.rating)}</strong><small>/10</small>
          </span>` : ''}
          <span class="details__date">
            <i class="fa-regular fa-calendar" aria-hidden="true"></i>
            ${escapeHtml(verb)} ${escapeHtml(formatDateLong(media.consumed_date))}
          </span>
        </div>
        ${pct != null ? `
        <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${escapeHtml(t('fields.progress'))}">
          <span style="width:${pct}%"></span>
        </div>` : ''}
        <dl class="details__list">
          ${detailRows(media).map((row) => `
            <div><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`).join('')}
        </dl>
      </div>
    </div>`;

  openDialog(dialog);
}

/** Liga os botões da janela. Chamado uma vez. */
export function initDetails(callbacks) {
  dialog = $('#details-dialog');
  handlers = { ...handlers, ...callbacks };

  $('#details-edit', dialog).addEventListener('click', () => {
    const media = current;
    closeDialog(dialog);
    if (!media) return;
    // Ao fechar o formulário, o foco volta para o card (e não para um botão
    // dentro de uma janela já fechada).
    document.querySelector(`.card[data-id="${CSS.escape(media._docId)}"] .card__open`)?.focus();
    handlers.onEdit(media);
  });

  $('#details-delete', dialog).addEventListener('click', async () => {
    if (!current) return;
    const deleted = await handlers.onDelete(current);
    if (deleted) closeDialog(dialog);
  });
}
