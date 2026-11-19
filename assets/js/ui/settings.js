/**
 * ============================================================
 * settings.js — Configurações (tipos ativos, idioma, tema, dados)
 * ============================================================
 * Preferências ficam no navegador (localStorage), como antes.
 * Para a dona logada aparecem também:
 * - "Baixar backup (JSON)": exporta TODAS as mídias, com as capas
 *   (o código antigo trocava as capas por "[BASE64 IMAGE]", então o
 *   arquivo não servia como backup de verdade);
 * - "Apagar todos os dados": só libera depois de digitar uma palavra de
 *   confirmação (ação irreversível).
 */

import { $, $$ } from '../core/dom.js';
import { t, loadLanguage, getLang } from '../core/i18n.js';
import { PRIMARY_TYPES } from '../config/media-types.js';
import { getState, setState } from '../core/state.js';
import * as prefs from '../core/prefs.js';
import { resetAllData } from '../services/backend.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { typeIconHtml, typeName } from './media-view.js';

let dialog;
let form;

/* ------------------------------------------------------------
 * Tema
 * ------------------------------------------------------------ */

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

/** Aplica o tema na tag <html data-theme="...">. */
export function applyTheme(theme = prefs.getTheme()) {
  const resolved = theme === 'system' ? (systemDark.matches ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = resolved;
  // Cor da barra do navegador no celular acompanha o tema.
  document.querySelector('meta[name="theme-color"]').content = resolved === 'dark' ? '#0E1116' : '#F5F6F8';
  window.dispatchEvent(new CustomEvent('themechange', { detail: resolved }));
}

// Se o tema for "sistema", acompanha a troca do sistema operacional em tempo real.
systemDark.addEventListener('change', () => {
  if (prefs.getTheme() === 'system') applyTheme('system');
});

/* ------------------------------------------------------------
 * Janela
 * ------------------------------------------------------------ */

/** Preenche a janela com os valores salvos. */
function fillForm() {
  const { activeTypes } = getState();
  $('#settings-types', form).innerHTML = PRIMARY_TYPES.map((type) => `
    <label class="check-chip" style="--accent: var(--type-${type})">
      <input type="checkbox" name="active-type" value="${type}" ${activeTypes.includes(type) ? 'checked' : ''}>
      <span>${typeIconHtml(type)}${typeName(type, true)}</span>
    </label>`).join('');
  form.elements.language.value = getLang();
  form.elements.theme.value = prefs.getTheme();
  $('#settings-error').hidden = true;
  $('#reset-confirm').value = '';
  $('#reset-button').disabled = true;
  $('#reset-word').textContent = t('settings.resetWord');
}

export function openSettings() {
  fillForm();
  openDialog(dialog);
}

/** Baixa um arquivo JSON com todas as mídias (backup completo). */
function downloadBackup() {
  const { medias, profile } = getState();
  const clean = medias.map(({ _docId, ...rest }) => ({ _docId, ...rest }));
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), profile, medias: clean }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), {
    href: url,
    download: `media_backup_${new Date().toISOString().slice(0, 10)}.json`,
  });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // dá tempo do download começar
}

/**
 * Apaga tudo. O botão só é liberado depois de digitar a palavra de
 * confirmação no campo da Zona de perigo (ver initSettings).
 */
async function resetData() {
  try {
    await resetAllData();
    setState({ medias: [], profile: { name: '', username: '', photo: '', favoriteMediaId: null } });
    closeDialog(dialog);
    toast(t('settings.resetDone'), 'success');
  } catch (error) {
    console.error('Erro ao apagar dados:', error);
    toast(t('toasts.saveError'), 'error');
  }
}

/** Liga os eventos. Chamado uma vez. */
export function initSettings() {
  dialog = $('#settings-dialog');
  form = $('#settings-form');

  $('#settings-button').addEventListener('click', openSettings);

  // Pré-visualiza o tema ao trocar (sem precisar salvar).
  $$('input[name="theme"]', form).forEach((radio) => radio.addEventListener('change', () => applyTheme(radio.value)));

  // Se fechar sem salvar, volta ao tema salvo.
  dialog.addEventListener('close', () => applyTheme(prefs.getTheme()));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const types = $$('input[name="active-type"]:checked', form).map((cb) => cb.value);
    if (!types.length) {
      $('#settings-error').hidden = false;
      return;
    }
    prefs.setActiveTypes(types);
    prefs.setTheme(form.elements.theme.value);
    const lang = form.elements.language.value;
    const langChanged = lang !== getLang();
    prefs.setLanguage(lang);
    if (langChanged) await loadLanguage(lang);

    // Se o chip ativo foi desativado, volta para "Tudo".
    const { filter } = getState();
    const advanced = { ...getState().advanced, types: getState().advanced.types.filter((x) => types.includes(x)) };
    setState({ activeTypes: types, filter: types.includes(filter) ? filter : 'all', advanced, langTick: Date.now() });
    closeDialog(dialog);
    toast(t('settings.saved'), 'success');
  });

  $('#backup-button').addEventListener('click', downloadBackup);
  $('#reset-button').addEventListener('click', resetData);
  // Libera o botão de apagar só quando a palavra digitada confere.
  $('#reset-confirm').addEventListener('input', (event) => {
    $('#reset-button').disabled = event.target.value.trim().toUpperCase() !== t('settings.resetWord').toUpperCase();
  });
}
