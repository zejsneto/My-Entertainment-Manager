/**
 * ============================================================
 * format.js — Formatação de datas, durações e números
 * ============================================================
 */
import { getLocale, t } from './i18n.js';

/**
 * Converte "AAAA-MM-DD" em Date SEM problema de fuso horário.
 * (new Date("2023-03-15") interpreta como UTC e, no Brasil, pode
 * virar dia 14 — por isso montamos a data no horário local.)
 */
export function parseISODate(value) {
  if (!value || typeof value !== 'string') return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y) return null;
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Data curta no padrão do idioma: 15/03/2023 (pt) ou 03/15/2023 (en). */
export function formatDate(value) {
  const date = parseISODate(value);
  if (!date) return '—';
  return date.toLocaleDateString(getLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Data por extenso: "15 de mar. de 2023". */
export function formatDateLong(value) {
  const date = parseISODate(value);
  if (!date) return '—';
  return date.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Ano de consumo (ou null). */
export function yearOf(value) {
  return parseISODate(value)?.getFullYear() ?? null;
}

/** 95 → "1h 35min"; 40 → "40min". */
export function formatMinutes(totalMinutes) {
  const mins = Math.round(Number(totalMinutes) || 0);
  if (mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m}min`;
  return m ? `${h}h ${m}min` : `${h}h`;
}

/** Horas decimais → "12h 30min" (usado no tempo total do dashboard). */
export function formatHours(hours) {
  const safe = Number(hours) || 0;
  const h = Math.floor(safe);
  const m = Math.round((safe - h) * 60);
  // Acima de 100h os minutos não fazem diferença e só quebram a linha.
  if (h >= 100 || !m) return `${h.toLocaleString(getLocale())}h`;
  return `${h}h ${m}min`;
}

/** Horas decimais → "3,5 dias". */
export function formatDays(hours) {
  const days = (Number(hours) || 0) / 24;
  return t('dashboard.daysValue', { value: days.toLocaleString(getLocale(), { maximumFractionDigits: 1 }) });
}

/** Nota com uma casa decimal no formato do idioma ("8,5" / "8.5"). */
export function formatRating(rating) {
  if (rating == null || Number.isNaN(Number(rating))) return '—';
  return Number(rating).toLocaleString(getLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Número inteiro com separador de milhar ("10.000"). */
export function formatNumber(value) {
  return (Number(value) || 0).toLocaleString(getLocale());
}

/** Data de hoje em "AAAA-MM-DD" (valor padrão do campo de data). */
export function todayISO() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
