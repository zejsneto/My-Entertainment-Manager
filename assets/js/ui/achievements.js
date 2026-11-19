/**
 * ============================================================
 * achievements.js — Pontos de conquista
 * ============================================================
 * Antes era um tooltip que só abria com o mouse (não funcionava no
 * celular nem pelo teclado). Agora é um botão com o total de pontos
 * no perfil, que abre uma janela com o progresso de cada categoria.
 * A regra dos pontos (cada marco = +1000) está em core/stats.js.
 */
import { $, escapeHtml, prefersReducedMotion } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { formatNumber } from '../core/format.js';
import { getState, getEnabledMedias } from '../core/state.js';
import { calculateAchievements } from '../core/stats.js';
import { openDialog } from './dialogs.js';
import { typeIconHtml } from './media-view.js';

let dialog;

/** Calcula as conquistas com os dados e tipos ativos atuais. */
function compute() {
  return calculateAchievements(getEnabledMedias(), getState().activeTypes);
}

/** Anima um número subindo de 0 até o valor final (efeito do código antigo). */
function countUp(el, end, duration = 900) {
  if (prefersReducedMotion() || end === 0) {
    el.textContent = formatNumber(end);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - p) ** 3; // desacelera no final
    el.textContent = formatNumber(Math.round(end * eased));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Atualiza o total de pontos mostrado no botão do perfil. */
export function renderAchievementsBadge() {
  $('#points-value').textContent = formatNumber(compute().totalPoints);
}

/** Abre a janela com o detalhamento por categoria. */
export function openAchievements() {
  const { categories, totalPoints } = compute();
  const iconFor = (key) => (key === 'platinum'
    ? '<i class="fa-solid fa-trophy" aria-hidden="true"></i>'
    : typeIconHtml(key));

  $('#achievements-list').innerHTML = categories.map((c) => `
    <li class="achievement" style="--accent: var(--type-${c.key === 'platinum' ? 'games' : c.key})">
      <span class="achievement__icon">${iconFor(c.key)}</span>
      <div class="achievement__body">
        <div class="achievement__head">
          <strong>${escapeHtml(t(`achievements.labels.${c.key}`))}</strong>
          <span>${formatNumber(c.value)} / ${formatNumber(c.nextGoal)}</span>
        </div>
        <div class="meter meter--sm" role="meter" aria-valuemin="0" aria-valuemax="${c.nextGoal}" aria-valuenow="${c.value}"
          aria-label="${escapeHtml(t(`achievements.labels.${c.key}`))}"><span style="width:${c.percent}%"></span></div>
        <small>${escapeHtml(t('achievements.reached', { count: c.reached }))}</small>
      </div>
    </li>`).join('');

  openDialog(dialog);
  countUp($('#achievements-total'), totalPoints);
}

/** Liga o botão. Chamado uma vez. */
export function initAchievements() {
  dialog = $('#achievements-dialog');
  $('#points-button').addEventListener('click', openAchievements);
}
