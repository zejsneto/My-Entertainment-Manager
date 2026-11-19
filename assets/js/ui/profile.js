/**
 * ============================================================
 * profile.js — Perfil no topo, login e edição de perfil
 * ============================================================
 * - O cabeçalho mostra foto, nome e @usuário (lidos de profile/mainProfile).
 * - Clicar na foto abre a janela "Conta":
 *     deslogada → formulário de login;
 *     logada    → editar nome, @usuário e foto + botão Sair.
 * - Compartilhar usa a API nativa do celular (navigator.share) e, se
 *   não existir, copia o link para a área de transferência (o código
 *   antigo só mostrava um alert de "não suportado").
 */
import { $, safeImageSrc } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { fileToResizedDataURL, AVATAR_SIZE } from '../core/image.js';
import { getState, setState } from '../core/state.js';
import { login, logout, saveProfile } from '../services/backend.js';
import { openDialog, closeDialog, toast } from './dialogs.js';

const DEFAULT_AVATAR = './assets/profile/profile.png';
let dialog;
let newPhoto = null; // foto escolhida e ainda não salva

/** Atualiza foto, nome e @usuário no cabeçalho. */
export function renderProfile() {
  const { profile } = getState();
  const name = profile.name || t('profile.defaultName');
  const username = String(profile.username || 'user').replace(/^@+/, '');
  $('#profile-name').textContent = name;
  $('#profile-username').textContent = `@${username}`;
  const src = safeImageSrc(profile.photo) || DEFAULT_AVATAR;
  $$avatar().forEach((img) => {
    img.src = src;
    img.alt = '';
  });
}

/** Todas as imagens de avatar da página (cabeçalho + janela). */
function $$avatar() {
  return Array.from(document.querySelectorAll('.js-avatar'));
}

/** Mostra a parte certa da janela (login ou edição). */
function syncAccountView() {
  const { isOwner, profile } = getState();
  $('#login-form').hidden = isOwner;
  $('#profile-form').hidden = !isOwner;
  $('#account-title').textContent = t(isOwner ? 'account.editTitle' : 'account.loginTitle');
  if (isOwner) {
    $('#profile-form').elements.name.value = profile.name || '';
    $('#profile-form').elements.username.value = String(profile.username || '').replace(/^@+/, '');
  }
}

/** Abre a janela de conta. */
export function openAccount() {
  newPhoto = null;
  $('#login-form').reset();
  $('#login-error').hidden = true;
  syncAccountView();
  renderProfile();
  openDialog(dialog);
  const first = getState().isOwner ? $('#profile-form').elements.name : $('#login-form').elements.email;
  first.focus();
}

/** Compartilha o link do perfil. */
async function shareProfile() {
  const data = { title: t('share.title'), text: t('share.text'), url: location.href.split('?')[0] };
  try {
    if (navigator.share) {
      await navigator.share(data);
      return;
    }
    await navigator.clipboard.writeText(data.url);
    toast(t('share.copied'), 'success');
  } catch (error) {
    // Usuário cancelou o compartilhamento: não é erro.
    if (error?.name !== 'AbortError') toast(t('share.error'), 'error');
  }
}

/** Liga os eventos. Chamado uma vez. */
export function initProfile() {
  dialog = $('#account-dialog');

  $('#profile-trigger').addEventListener('click', openAccount);
  $('#share-button').addEventListener('click', shareProfile);

  // Login
  $('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.classList.add('is-loading');
    try {
      await login(form.elements.email.value.trim(), form.elements.password.value);
      // onOwnerChange (em main.js) atualiza isOwner; aqui só fechamos.
      closeDialog(dialog);
      toast(t('account.welcome'), 'success');
    } catch (error) {
      console.error('Erro no login:', error);
      $('#login-error').hidden = false;
    } finally {
      button.disabled = false;
      button.classList.remove('is-loading');
    }
  });

  // Escolher nova foto: redimensiona para 256×256 e mostra a prévia.
  $('#profile-photo').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      newPhoto = await fileToResizedDataURL(file, AVATAR_SIZE, 0.85);
      $('#account-avatar').src = newPhoto;
    } catch {
      toast(t('form.errors.image'), 'error');
    }
  });

  // Salvar perfil (merge: não apaga a mídia favorita)
  $('#profile-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    if (!form.reportValidity()) return;
    const patch = {
      name: form.elements.name.value.trim(),
      username: form.elements.username.value.trim().replace(/^@/, ''),
    };
    if (newPhoto) patch.photo = newPhoto;
    try {
      await saveProfile(patch);
      setState({ profile: { ...getState().profile, ...patch } });
      closeDialog(dialog);
      toast(t('account.saved'), 'success');
    } catch (error) {
      console.error('Erro ao salvar perfil:', error);
      toast(t('toasts.saveError'), 'error');
    }
  });

  // Sair
  $('#logout-button').addEventListener('click', async () => {
    await logout();
    closeDialog(dialog);
    toast(t('account.loggedOut'), 'info');
  });
}
