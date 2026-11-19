/**
 * ============================================================
 * main.js — Ponto de entrada da aplicação
 * ============================================================
 * Ordem de inicialização:
 * 1. Aplica tema e idioma salvos.
 * 2. Liga todos os módulos de interface (cada um registra seus eventos
 *    UMA vez — no código antigo, filterSetup/searchSetup eram chamados
 *    duas vezes e os listeners duplicavam).
 * 3. Conecta ao Firebase (ou entra no modo demonstração).
 * 4. Carrega perfil e mídias; a tela se atualiza sozinha via subscribe().
 *
 * Fluxo de dados (sempre o mesmo):
 *   ação do usuário → setState() → render() → tela atualizada
 */

import { $, $$ } from './core/dom.js';
import { t, loadLanguage, applyTranslations } from './core/i18n.js';
import * as prefs from './core/prefs.js';
import { getState, setState, subscribe, removeMedia } from './core/state.js';
import { initBackend, onOwnerChange, loadMedias, loadProfile, deleteMedia } from './services/backend.js';
import { setupDialogs, confirmDialog, toast } from './ui/dialogs.js';
import { initLibrary, renderLibrary } from './ui/library.js';
import { initDetails, openDetails } from './ui/details.js';
import { initMediaForm, openMediaForm } from './ui/media-form.js';
import { initToolbar, renderChips, renderAppliedFilters, clearAllFilters } from './ui/toolbar.js';
import { initFilters } from './ui/filters.js';
import { initProfile, renderProfile } from './ui/profile.js';
import { initAchievements, renderAchievementsBadge } from './ui/achievements.js';
import { initSettings, applyTheme } from './ui/settings.js';
import { initDashboard, renderDashboard } from './ui/dashboard.js';

/* ------------------------------------------------------------
 * Ações compartilhadas entre módulos
 * ------------------------------------------------------------ */

/** Abre o formulário de adicionar (só para a dona logada). */
function addMedia() {
  if (getState().isOwner) openMediaForm(null);
}

/** Abre o formulário de edição (só para a dona logada). */
function editMedia(media) {
  if (getState().isOwner) openMediaForm(media);
}

/**
 * Exclui uma mídia depois de confirmar. Devolve true se excluiu.
 * O botão de confirmar é vermelho e o foco começa em "Cancelar"
 * (recomendação da Apple HIG e do WAI-ARIA para ações destrutivas).
 */
async function deleteWithConfirm(media) {
  const ok = await confirmDialog({
    title: t('confirm.deleteTitle', { title: media.title }),
    message: t('confirm.deleteText'),
    confirmLabel: t('actions.delete'),
    danger: true,
  });
  if (!ok) return false;
  try {
    await deleteMedia(media._docId);
    removeMedia(media._docId);
    toast(t('toasts.deleted', { title: media.title }), 'success');
    return true;
  } catch (error) {
    console.error('Erro ao excluir:', error);
    toast(t('toasts.saveError'), 'error');
    return false;
  }
}

/* ------------------------------------------------------------
 * Troca de tela: biblioteca ⇄ dashboard
 * ------------------------------------------------------------ */

/** Usa o "#dashboard" da URL, então o botão Voltar do navegador funciona. */
function syncViewFromHash() {
  setState({ view: location.hash === '#dashboard' ? 'dashboard' : 'library' });
}

function applyView() {
  const isDash = getState().view === 'dashboard';
  $('#library').hidden = isDash;
  $('#dashboard').hidden = !isDash;
  const btn = $('#view-toggle');
  btn.setAttribute('aria-pressed', String(isDash));
  btn.querySelector('i').className = `fa-solid ${isDash ? 'fa-table-cells-large' : 'fa-chart-pie'}`;
  btn.querySelector('.btn__label').textContent = t(isDash ? 'nav.library' : 'nav.dashboard');
  btn.setAttribute('aria-label', t(isDash ? 'nav.library' : 'nav.dashboard'));
}

/* ------------------------------------------------------------
 * Render
 * ------------------------------------------------------------ */

/**
 * Redesenha a tela. Várias mudanças de estado seguidas (ex.: carregar
 * perfil e mídias) geram um único redesenho no próximo frame.
 */
let scheduled = false;
function render() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const state = getState();
    // Classe no <body> que mostra/esconde tudo que é .owner-only (CSS).
    document.body.classList.toggle('is-owner', state.isOwner);
    applyView();
    renderProfile();
    renderAchievementsBadge();
    renderChips();
    renderAppliedFilters();
    renderLibrary();
    renderDashboard();
  });
}

/** Busca perfil e mídias no banco. */
async function loadData() {
  setState({ loading: true, loadError: false });
  try {
    const [profile, medias] = await Promise.all([loadProfile().catch(() => ({})), loadMedias()]);
    setState({ medias, profile: { ...getState().profile, ...profile }, loading: false });
  } catch (error) {
    console.error('Erro ao carregar mídias:', error);
    // O erro fica no estado; library.js mostra a mensagem com "Tentar de novo".
    setState({ loading: false, loadError: true });
  }
}

/* ------------------------------------------------------------
 * Pequenos comportamentos globais
 * ------------------------------------------------------------ */

/**
 * Se uma capa não carregar (link quebrado), troca pelo pôster gerado.
 * Um listener só, na fase de captura, cobre todas as imagens.
 */
function handleBrokenCovers() {
  document.addEventListener('error', (event) => {
    const img = event.target;
    if (img.tagName === 'IMG' && img.classList.contains('poster__img')) {
      img.closest('.poster')?.classList.add('poster--empty');
      img.remove();
    }
  }, true);
}

/** Atalho: tecla "/" foca a busca (como no GitHub e no YouTube). */
function setupShortcuts() {
  document.addEventListener('keydown', (event) => {
    const typing = event.target.closest('input, textarea, select, [contenteditable]');
    if (event.key === '/' && !typing && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      if (getState().view !== 'library') {
        // Volta para a biblioteca e só foca depois que ela ficar visível.
        history.replaceState(null, '', location.pathname + location.search);
        setState({ view: 'library' });
        requestAnimationFrame(() => requestAnimationFrame(() => $('#search-input').focus()));
        return;
      }
      $('#search-input').focus();
    }
  });
}

/** Mostra a sombra da barra de ferramentas só depois de rolar. */
function setupToolbarShadow() {
  const sentinel = $('#toolbar-sentinel');
  const toolbar = $('#toolbar');
  new IntersectionObserver(([entry]) => toolbar.classList.toggle('is-stuck', !entry.isIntersecting)).observe(sentinel);
}

/* ------------------------------------------------------------
 * Inicialização
 * ------------------------------------------------------------ */

async function start() {
  applyTheme();
  await loadLanguage(prefs.getLanguage());

  setupDialogs();
  initLibrary({ onOpen: openDetails, onEdit: editMedia, onAdd: addMedia, onClearFilters: clearAllFilters, onRetry: loadData });
  initDetails({ onEdit: editMedia, onDelete: deleteWithConfirm });
  initMediaForm({ onDelete: deleteWithConfirm });
  initToolbar();
  initFilters();
  initProfile();
  initAchievements();
  initSettings();
  initDashboard({ onOpen: openDetails });
  handleBrokenCovers();
  setupShortcuts();
  setupToolbarShadow();

  $$('[data-action="add"]').forEach((btn) => btn.addEventListener('click', addMedia));
  $('#view-toggle').addEventListener('click', () => {
    location.hash = getState().view === 'dashboard' ? '' : '#dashboard';
  });
  window.addEventListener('hashchange', syncViewFromHash);

  // Qualquer mudança de estado redesenha a tela.
  subscribe((state, patch) => {
    // Idioma trocado: reaplica textos fixos do HTML.
    if ('langTick' in patch) applyTranslations();
    render();
  });
  syncViewFromHash();
  render();

  const { demo } = await initBackend();
  setState({ demoMode: demo });
  $('#demo-banner').hidden = !demo;
  onOwnerChange((isOwner) => setState({ isOwner }));
  await loadData();
}

start();
