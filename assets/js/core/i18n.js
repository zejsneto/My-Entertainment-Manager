/**
 * ============================================================
 * i18n.js — Traduções (inglês e português)
 * ============================================================
 * Como funciona:
 * - Os textos ficam em data/lang/en.json e data/lang/pt.json.
 * - No HTML, um elemento com data-i18n="chave.aninhada" recebe o texto.
 *   Também existem data-i18n-title, data-i18n-placeholder e
 *   data-i18n-aria (para aria-label de botões só com ícone).
 * - No JavaScript, use t('chave', { variavel: valor }).
 *   Ex.: t('toolbar.results', { count: 3 }) → "3 mídias".
 */

let dictionary = {};
let currentLang = 'en';

/** Busca uma chave aninhada ("a.b.c") dentro do objeto de traduções. */
function lookup(key) {
  return key.split('.').reduce((obj, part) => (obj == null ? undefined : obj[part]), dictionary);
}

/**
 * Traduz uma chave. Substitui {variaveis} pelos valores passados.
 * Se a chave não existir, devolve a própria chave (fácil de achar o erro).
 */
export function t(key, vars = {}) {
  let text = lookup(key);
  if (typeof text !== 'string') return key;
  for (const [name, value] of Object.entries(vars)) {
    // Função como substituto: evita que "$&" num título vire outra coisa.
    text = text.replaceAll(`{${name}}`, () => String(value));
  }
  return text;
}

/**
 * Plural simples: usa `chave.one` quando count === 1 e `chave.other`
 * nos demais casos. Ex.: tp('toolbar.results', 1) → "1 mídia".
 */
export function tp(key, count, vars = {}) {
  return t(`${key}.${count === 1 ? 'one' : 'other'}`, { count, ...vars });
}

/** Idioma atual ("en" ou "pt"). */
export function getLang() {
  return currentLang;
}

/** Locale para formatar datas e números ("pt-BR" / "en-US"). */
export function getLocale() {
  return currentLang === 'pt' ? 'pt-BR' : 'en-US';
}

/** Carrega o arquivo de idioma e aplica no HTML. */
export async function loadLanguage(lang) {
  currentLang = lang === 'pt' ? 'pt' : 'en';
  try {
    const response = await fetch(`./data/lang/${currentLang}.json`, { cache: 'no-cache' });
    dictionary = await response.json();
  } catch (error) {
    console.error('Não foi possível carregar as traduções:', error);
    dictionary = {};
  }
  document.documentElement.lang = currentLang === 'pt' ? 'pt-BR' : 'en';
  applyTranslations();
}

/** Percorre o documento (ou um trecho dele) e aplica os textos traduzidos. */
export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
}
