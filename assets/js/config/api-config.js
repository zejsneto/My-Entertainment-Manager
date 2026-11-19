/**
 * ============================================================
 * api-config.js — Endereço do Worker da API (busca e Steam)
 * ============================================================
 * Depois de publicar o Worker na Cloudflare (ver worker/LEIA-ME.md),
 * cole aqui o endereço dele, sem barra no final. Exemplo:
 *   export const API_URL = 'https://mem-api.seu-usuario.workers.dev';
 *
 * Este endereço NÃO é segredo: o Worker só atende quem estiver logada
 * como dona do acervo. As chaves do TMDB e da Steam ficam no Worker.
 *
 * Deixe vazio ('') para desligar a busca automática e a Steam: o site
 * continua funcionando normalmente, só sem esses recursos.
 */
export const API_URL = '';
