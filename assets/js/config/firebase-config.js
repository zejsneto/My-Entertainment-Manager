/**
 * ============================================================
 * firebase-config.js — Configuração do projeto Firebase
 * ============================================================
 * Estes valores NÃO são segredos: todo app Firebase web precisa
 * expô-los para o navegador. A segurança real está nas Regras do
 * Firestore (leitura pública, escrita apenas para OWNER_UID).
 */

export const firebaseConfig = {
  apiKey: 'AIzaSyBWp8jvNXURi-rpfVwTfv7LjGhI_D9Werk',
  authDomain: 'my-entertainment-manager.firebaseapp.com',
  projectId: 'my-entertainment-manager',
  storageBucket: 'my-entertainment-manager.firebasestorage.app',
  messagingSenderId: '406501797296',
  appId: '1:406501797296:web:f257ad1abe6ba2e45cfa75',
  measurementId: 'G-QBBHD36LZN',
};

/**
 * UID da dona do acervo. Serve só para a INTERFACE decidir se mostra
 * os botões de editar; quem realmente bloqueia gravações de outras
 * pessoas são as Regras do Firestore, que usam este mesmo UID.
 */
export const OWNER_UID = '5z1Csjq7NlNFU1F744kqBkX6WRB3';

/** Versão do SDK modular carregado do CDN oficial do Google. */
export const FIREBASE_SDK_VERSION = '10.12.2';
