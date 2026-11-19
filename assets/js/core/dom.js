/**
 * ============================================================
 * dom.js — Pequenos utilitários de DOM e segurança
 * ============================================================
 */

/** Atalho para document.querySelector. */
export const $ = (selector, root = document) => root.querySelector(selector);

/** Atalho para querySelectorAll que já devolve um Array. */
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/**
 * Escapa texto antes de colocá-lo dentro de HTML montado com template
 * string. Sem isso, um título como `<img onerror=...>` executaria
 * código (XSS). O código antigo inseria títulos direto no innerHTML.
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Valida a URL de uma imagem antes de usá-la em `src`.
 * Aceita: base64 de imagem (data:image/...), http(s) e caminhos relativos.
 * Recusa qualquer outra coisa (ex.: "javascript:").
 */
export function safeImageSrc(src) {
  if (!src || typeof src !== 'string') return '';
  const s = src.trim();
  if (s.startsWith('data:image/')) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^(\.\/|\/)?assets\//i.test(s)) return s;
  return '';
}

/**
 * Debounce: só executa `fn` depois que o usuário para de chamar por
 * `wait` ms. Usado na busca para não renderizar a cada tecla.
 */
export function debounce(fn, wait = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** Verdadeiro se o usuário pediu menos animação no sistema operacional. */
export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
