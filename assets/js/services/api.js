/**
 * ============================================================
 * api.js — Conversa com o Worker (busca de mídias e Steam)
 * ============================================================
 * Todas as chamadas levam o token de login do Firebase no cabeçalho
 * Authorization. O Worker confere o token antes de usar as chaves.
 *
 * Também guarda em memória quais fontes estão configuradas (/health),
 * para a interface mostrar só o que funciona.
 */
import { API_URL } from '../config/api-config.js';
import { getIdToken } from './backend.js';

let healthCache = null;

/**
 * Endereço base do Worker.
 * Para testes locais, ?api=http://localhost:PORTA troca o endereço, mas
 * SÓ quando o próprio site está rodando em localhost. No site publicado
 * isso é ignorado (senão um link malicioso poderia mandar o token de
 * login para um programa qualquer rodando no seu computador).
 */
function baseUrl() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const override = local ? new URLSearchParams(location.search).get('api') : null;
  if (override && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(override)) return override;
  return API_URL.replace(/\/$/, '');
}

/** Verdadeiro se há um Worker configurado. */
export function apiEnabled() {
  return !!baseUrl();
}

/** Erro com código vindo do Worker (ex.: "steam_private"). */
export class ApiError extends Error {
  constructor(code, status, message) {
    super(message || code);
    this.code = code;
    this.status = status;
  }
}

/**
 * GET autenticado no Worker. Lança ApiError com o código do erro.
 * @param {string} path  ex.: "/search?type=movies&q=duna"
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]  para cancelar buscas antigas
 */
async function request(path, { signal, auth = true } = {}) {
  if (!apiEnabled()) throw new ApiError('api_disabled', 0);
  const headers = {};
  if (auth) {
    const token = await getIdToken();
    if (!token) throw new ApiError('missing_token', 401);
    headers.Authorization = `Bearer ${token}`;
  }
  let response;
  try {
    response = await fetch(`${baseUrl()}${path}`, { headers, signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('network_error', 0, error.message);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error || 'upstream_error', response.status, body.message);
  return body;
}

/** Quais fontes o Worker tem configuradas ({ tmdb, steam, steamSync, ... }). */
export async function getProviders() {
  if (!apiEnabled()) return {};
  if (!healthCache) {
    healthCache = request('/health', { auth: false })
      .then((body) => body.providers || {})
      .catch(() => {
        healthCache = null; // tenta de novo na próxima vez
        return {};
      });
  }
  return healthCache;
}

/** Busca por título no tipo de mídia informado. */
export function searchMedia(type, query, signal) {
  return request(`/search?type=${encodeURIComponent(type)}&q=${encodeURIComponent(query)}`, { signal });
}

/** Detalhes de um resultado (duração, temporadas, páginas, conquistas...). */
export function getMediaDetails(ref, signal) {
  return request(`/details?ref=${encodeURIComponent(ref)}`, { signal });
}

/** Biblioteca Steam da dona. */
export function getSteamLibrary() {
  return request('/steam/library');
}

/** Capas verticais e nomes em português de até 50 jogos por chamada. */
export function getSteamCovers(appids) {
  return request(`/steam/covers?appids=${appids.join(',')}`);
}

/** Conquistas (obtidas/totais) de até 40 jogos por chamada. */
export function getSteamAchievements(appids) {
  return request(`/steam/achievements?appids=${appids.join(',')}`);
}
