/**
 * ============================================================
 * dialogs.js — Janelas modais, confirmação e avisos (toasts)
 * ============================================================
 * Usa o elemento nativo <dialog> com showModal(). O próprio navegador
 * já cuida de:
 * - prender o foco dentro da janela (antes era feito na mão, com bug);
 * - fechar com a tecla Esc;
 * - devolver o foco ao botão que abriu a janela;
 * - deixar o resto da página inerte para leitores de tela.
 *
 * Também substitui alert() e confirm(), que travavam a página e não
 * seguiam o visual do site.
 */
import { $ } from '../core/dom.js';
import { t } from '../core/i18n.js';

/** Abre um <dialog> como modal e ativa o "clique fora para fechar". */
export function openDialog(dialog) {
  if (!dialog || dialog.open) return;
  dialog.showModal();
  document.documentElement.classList.add('has-modal');
}

/** Fecha um <dialog> (com animação de saída quando permitida). */
export function closeDialog(dialog, returnValue = '') {
  if (!dialog?.open) return;
  dialog.close(returnValue);
}

/**
 * Liga os comportamentos comuns a TODOS os <dialog class="modal">:
 * - botões com [data-close] fecham a janela;
 * - clicar no fundo escurecido (fora do conteúdo) fecha, MAS só nas
 *   janelas marcadas com data-dismissible (detalhes, filtros...).
 *   O formulário de mídia não fecha assim: pesquisa da Nielsen Norman
 *   mostra que toques acidentais fora da janela fazem perder o que foi
 *   digitado;
 * - ao fechar, remove a classe que trava a rolagem da página.
 * Chamado uma vez na inicialização.
 */
export function setupDialogs() {
  document.querySelectorAll('dialog.modal').forEach((dialog) => {
    // Guarda onde o clique COMEÇOU: arrastar uma seleção de texto de dentro
    // de um campo até o fundo não deve fechar a janela.
    let pressedOnBackdrop = false;
    dialog.addEventListener('pointerdown', (event) => {
      pressedOnBackdrop = event.target === dialog;
    });
    dialog.addEventListener('click', (event) => {
      if (event.target.closest('[data-close]')) {
        // Dispara o evento "cancel" para que a janela possa impedir o
        // fechamento (ex.: formulário com alterações não salvas).
        const cancelEvent = new Event('cancel', { cancelable: true });
        if (dialog.dispatchEvent(cancelEvent)) closeDialog(dialog);
        return;
      }
      // O <dialog> ocupa só a caixa; o clique no ::backdrop chega com
      // target === dialog e coordenadas fora do retângulo do conteúdo.
      if (event.target === dialog && pressedOnBackdrop && dialog.hasAttribute('data-dismissible')) {
        const rect = dialog.getBoundingClientRect();
        const inside = event.clientX >= rect.left && event.clientX <= rect.right
          && event.clientY >= rect.top && event.clientY <= rect.bottom;
        if (!inside) closeDialog(dialog);
      }
    });
    dialog.addEventListener('close', () => {
      if (!document.querySelector('dialog.modal[open]')) {
        document.documentElement.classList.remove('has-modal');
      }
    });
  });
}

/**
 * Pergunta de confirmação no visual do site. Devolve uma Promise
 * que resolve true (confirmou) ou false (cancelou/fechou).
 *
 * @param {object} options
 * @param {string} options.title    título da janela
 * @param {string} options.message  texto explicativo
 * @param {string} [options.confirmLabel]  texto do botão de confirmar
 * @param {boolean} [options.danger] botão vermelho para ações destrutivas
 */
export function confirmDialog({ title, message, confirmLabel, danger = false }) {
  const dialog = $('#confirm-dialog');
  $('#confirm-title', dialog).textContent = title;
  $('#confirm-message', dialog).textContent = message;
  const ok = $('#confirm-ok', dialog);
  ok.textContent = confirmLabel || t('actions.confirm');
  ok.classList.toggle('btn--danger', danger);
  ok.classList.toggle('btn--primary', !danger);

  return new Promise((resolve) => {
    const onClose = () => {
      dialog.removeEventListener('close', onClose);
      resolve(dialog.returnValue === 'confirm');
    };
    dialog.returnValue = '';
    dialog.addEventListener('close', onClose);
    openDialog(dialog);
    // Foco no "Cancelar" por padrão: evita confirmar sem querer com Enter.
    $('#confirm-cancel', dialog).focus();
  });
}

/* ------------------------------------------------------------
 * Toasts (avisos rápidos no canto da tela)
 * ------------------------------------------------------------ */

const TOAST_ICONS = {
  success: 'fa-circle-check',
  error: 'fa-circle-exclamation',
  info: 'fa-circle-info',
};

/**
 * Mostra um aviso que some sozinho. A região tem aria-live="polite",
 * então leitores de tela também anunciam a mensagem.
 */
export function toast(message, type = 'info', duration = 3500) {
  const region = $('#toast-region');
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `<i class="fa-solid ${TOAST_ICONS[type] || TOAST_ICONS.info}" aria-hidden="true"></i><span></span>`;
  el.querySelector('span').textContent = message;
  region.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));
  setTimeout(() => {
    el.classList.remove('is-visible');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400); // garantia caso não haja transição
  }, duration);
}
