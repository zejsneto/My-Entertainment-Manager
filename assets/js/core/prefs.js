/**
 * ============================================================
 * prefs.js — Preferências salvas no navegador (localStorage)
 * ============================================================
 * As chaves são as mesmas do código antigo (activeMediaTypes,
 * language, darkMode, dashboardLayout), então quem já usava o site
 * mantém as configurações.
 *
 * Toda leitura/escrita fica dentro de try/catch: em modo anônimo ou
 * com armazenamento bloqueado, o localStorage pode lançar erro.
 */
import { PRIMARY_TYPES } from '../config/media-types.js';

const KEYS = {
  types: 'activeMediaTypes',
  lang: 'language',
  theme: 'darkMode',
  layout: 'dashboardLayout',
  chartType: 'categoryChartType',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : raw;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* armazenamento indisponível: ignora */
  }
}

/** Tipos ativos nas Configurações (padrão: todos). */
export function getActiveTypes() {
  try {
    const parsed = JSON.parse(read(KEYS.types, 'null'));
    const valid = Array.isArray(parsed) ? parsed.filter((t) => PRIMARY_TYPES.includes(t)) : [];
    return valid.length ? valid : [...PRIMARY_TYPES];
  } catch {
    return [...PRIMARY_TYPES];
  }
}

export function setActiveTypes(types) {
  write(KEYS.types, JSON.stringify(types));
}

/** Idioma salvo; na primeira visita usa o idioma do navegador. */
export function getLanguage() {
  const saved = read(KEYS.lang, null);
  if (saved === 'pt' || saved === 'en') return saved;
  return (navigator.language || 'en').toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

export function setLanguage(lang) {
  write(KEYS.lang, lang);
}

/** Tema: "light", "dark" ou "system" (segue o sistema operacional). */
export function getTheme() {
  const saved = read(KEYS.theme, 'system');
  return ['light', 'dark', 'system'].includes(saved) ? saved : 'system';
}

export function setTheme(theme) {
  write(KEYS.theme, theme);
}

/** Ordem dos widgets do dashboard (arrastar e soltar). */
export function getDashboardLayout() {
  try {
    const parsed = JSON.parse(read(KEYS.layout, 'null'));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function setDashboardLayout(ids) {
  write(KEYS.layout, JSON.stringify(ids));
}

export function clearDashboardLayout() {
  try {
    localStorage.removeItem(KEYS.layout);
  } catch {
    /* ignora */
  }
}

/** Tipo de gráfico escolhido no widget "Mídias por tipo". */
export function getCategoryChartType() {
  const saved = read(KEYS.chartType, 'bar');
  return ['bar', 'doughnut'].includes(saved) ? saved : 'bar';
}

export function setCategoryChartType(type) {
  write(KEYS.chartType, type);
}
