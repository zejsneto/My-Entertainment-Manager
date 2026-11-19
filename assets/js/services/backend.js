/**
 * ============================================================
 * backend.js — Acesso ao Firebase (Firestore + Auth)
 * ============================================================
 * Toda conversa com o banco passa por este arquivo. O resto do app
 * não sabe se os dados vêm do Firestore ou do modo demonstração.
 *
 * Usa o SDK MODULAR do Firebase, importado direto do CDN do Google
 * (funciona no GitHub Pages sem instalar nada). O código antigo usava
 * a versão "compat" e variáveis globais (window._DB).
 *
 * MODO DEMONSTRAÇÃO
 * Se o Firebase não carregar (sem internet, CDN bloqueado) ou se a URL
 * tiver ?demo=1, o app usa data/demo-media.json e guarda alterações só
 * na memória. Isso permite testar o layout localmente sem mexer nos
 * dados reais. Um aviso aparece no topo enquanto o modo estiver ativo.
 *
 * Coleções usadas (iguais às de antes):
 * - media/{id}            → uma mídia por documento
 * - profile/mainProfile   → nome, @usuário, foto e mídia favorita
 */
import { firebaseConfig, OWNER_UID, FIREBASE_SDK_VERSION } from '../config/firebase-config.js';
import { ALL_SPECIFIC_FIELDS } from '../config/media-types.js';
import { normalizeMedia } from '../core/stats.js';

const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

let fb = null;          // funções do SDK (getDocs, addDoc...) depois de carregadas
let db = null;          // instância do Firestore
let auth = null;        // instância do Auth
let demo = false;       // true = modo demonstração
let demoProfile = { name: 'Demo', username: 'demo', photo: '', favoriteMediaId: null };
let demoUser = null;
const demoAuthListeners = new Set();

/**
 * Carrega o SDK e conecta ao projeto. Se falhar, ativa o modo demo.
 * @returns {Promise<{demo:boolean}>}
 */
export async function initBackend() {
  const forceDemo = new URLSearchParams(location.search).has('demo');
  if (!forceDemo) {
    try {
      const [appMod, storeMod, authMod] = await Promise.all([
        import(`${CDN}/firebase-app.js`),
        import(`${CDN}/firebase-firestore.js`),
        import(`${CDN}/firebase-auth.js`),
      ]);
      const app = appMod.initializeApp(firebaseConfig);
      db = storeMod.getFirestore(app);
      auth = authMod.getAuth(app);
      fb = { ...storeMod, ...authMod };
      // Mantém o login mesmo depois de fechar o navegador. Se falhar (ex.:
      // armazenamento bloqueado), segue normalmente: NÃO cai no modo demo.
      try {
        await authMod.setPersistence(auth, authMod.browserLocalPersistence);
      } catch (error) {
        console.warn('Não foi possível manter o login salvo:', error);
      }
      return { demo: false };
    } catch (error) {
      console.warn('Firebase indisponível, usando modo demonstração.', error);
    }
  }
  demo = true;
  return { demo: true };
}

/* ------------------------------------------------------------
 * Autenticação
 * ------------------------------------------------------------ */

/**
 * Avisa sempre que o login muda. O callback recebe `true` quando quem
 * está logada é a dona do acervo (UID igual ao das Regras do Firestore).
 */
export function onOwnerChange(callback) {
  if (demo) {
    demoAuthListeners.add(callback);
    callback(!!demoUser);
    return;
  }
  fb.onAuthStateChanged(auth, (user) => callback(!!user && user.uid === OWNER_UID));
}

/** Faz login com e-mail e senha. Lança erro se falhar. */
export async function login(email, password) {
  if (demo) {
    demoUser = { email };
    demoAuthListeners.forEach((fn) => fn(true));
    return;
  }
  await fb.signInWithEmailAndPassword(auth, email, password);
}

/** Sai da conta. */
export async function logout() {
  if (demo) {
    demoUser = null;
    demoAuthListeners.forEach((fn) => fn(false));
    return;
  }
  await fb.signOut(auth);
}

/* ------------------------------------------------------------
 * Mídias
 * ------------------------------------------------------------ */

/** Lê todas as mídias e devolve já normalizadas. */
export async function loadMedias() {
  if (demo) {
    const response = await fetch('./data/demo-media.json');
    const list = await response.json();
    return list.map((item) => normalizeMedia(`demo-${item.id}`, item));
  }
  const snapshot = await fb.getDocs(fb.collection(db, 'media'));
  return snapshot.docs.map((doc) => normalizeMedia(doc.id, doc.data()));
}

/**
 * Garante que o documento tenha todos os campos específicos
 * (os que não se aplicam ao tipo ficam null), como o "template" antigo.
 */
function withAllFields(data) {
  const full = {};
  ALL_SPECIFIC_FIELDS.forEach((f) => (full[f] = null));
  return { ...full, ...data };
}

/** Remove o campo interno _docId antes de gravar no banco. */
function stripInternal(data) {
  const { _docId, ...rest } = data;
  return rest;
}

/**
 * Cria uma mídia. `nextNumericId` mantém o campo numérico "id" que o
 * código antigo usava (útil para compatibilidade com o favorito antigo).
 * Devolve a mídia criada, já com _docId.
 */
export async function createMedia(data, nextNumericId) {
  const payload = withAllFields({ ...stripInternal(data), id: nextNumericId });
  if (demo) {
    const docId = `demo-local-${Date.now()}`;
    return normalizeMedia(docId, payload);
  }
  const ref = await fb.addDoc(fb.collection(db, 'media'), payload);
  return normalizeMedia(ref.id, payload);
}

/**
 * Atualiza uma mídia existente. Não mexe no campo "id" numérico
 * (o código antigo sobrescrevia esse campo com o ID do documento).
 */
export async function updateMedia(docId, data) {
  const { id, ...payload } = withAllFields(stripInternal(data));
  if (!demo) await fb.updateDoc(fb.doc(db, 'media', docId), payload);
  // Sem a chave "id": quem chama mescla com a mídia original e mantém o id numérico.
  return normalizeMedia(docId, payload);
}

/** Apaga uma mídia. */
export async function deleteMedia(docId) {
  if (demo) return;
  await fb.deleteDoc(fb.doc(db, 'media', docId));
}

/* ------------------------------------------------------------
 * Perfil
 * ------------------------------------------------------------ */

/** Lê o perfil (nome, @usuário, foto, favorito). */
export async function loadProfile() {
  if (demo) return { ...demoProfile };
  const snap = await fb.getDoc(fb.doc(db, 'profile', 'mainProfile'));
  return snap.exists() ? snap.data() : {};
}

/**
 * Salva campos do perfil SEM apagar os outros (merge).
 * Correção: o código antigo usava set() sem merge ao editar o perfil,
 * o que apagava a mídia favorita; e update() no favorito, que falhava
 * se o documento de perfil ainda não existisse.
 */
export async function saveProfile(patch) {
  if (demo) {
    demoProfile = { ...demoProfile, ...patch };
    return;
  }
  await fb.setDoc(fb.doc(db, 'profile', 'mainProfile'), patch, { merge: true });
}

/* ------------------------------------------------------------
 * Zona de perigo
 * ------------------------------------------------------------ */

/**
 * Apaga TODAS as mídias e o perfil. Usa lotes (writeBatch) de até 400
 * operações, que é mais rápido e seguro que centenas de deletes soltos.
 */
export async function resetAllData() {
  if (demo) return;
  const snapshot = await fb.getDocs(fb.collection(db, 'media'));
  const docs = snapshot.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = fb.writeBatch(db);
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await fb.deleteDoc(fb.doc(db, 'profile', 'mainProfile'));
}

/** Verdadeiro quando o app está em modo demonstração. */
export function isDemo() {
  return demo;
}
