/**
 * ==================================================================
 * My Entertainment Manager — API proxy (Cloudflare Worker)
 * ==================================================================
 * POR QUE ISTO EXISTE
 * O site fica no GitHub Pages: todo o código dele é público. Se as
 * chaves do TMDB e da Steam ficassem no site, qualquer pessoa poderia
 * copiá-las. Este Worker roda nos servidores da Cloudflare e é o único
 * lugar que conhece as chaves. O site pede "busca X" e o Worker
 * consulta as APIs, padroniza a resposta e devolve.
 *
 * SEGURANÇA
 * 1. As chaves ficam em "Secrets" da Cloudflare (nunca no código).
 * 2. Toda rota (exceto /health) exige o token de login do Firebase.
 *    O Worker confere a assinatura do token com as chaves públicas do
 *    Google e só aceita se o UID for o da dona (OWNER_UID). Ou seja:
 *    mesmo quem descobrir o endereço do Worker não consegue usá-lo.
 * 3. Só responde para os sites listados em ALLOWED_ORIGINS (CORS).
 *
 * ROTAS
 *   GET /health                         → quais APIs estão configuradas (sem login)
 *   GET /search?type=<tipo>&q=<texto>   → busca por título
 *   GET /details?ref=<ref>              → dados completos de um resultado
 *   GET /steam/library                  → jogos da sua conta Steam (nome, horas, data)
 *   GET /steam/covers?appids=1,2        → capas verticais e nomes em pt (até 50 jogos por vez)
 *   GET /steam/achievements?appids=1,2  → conquistas obtidas/totais (até 40 jogos por vez)
 *
 * VARIÁVEIS (Settings → Variables and Secrets no painel da Cloudflare)
 *   Texto:   ALLOWED_ORIGINS  ex.: https://zejsneto.github.io,http://localhost:8000
 *            FIREBASE_PROJECT_ID  ex.: my-entertainment-manager
 *            OWNER_UID        UID da dona (o mesmo das Regras do Firestore)
 *   Secrets: TMDB_TOKEN       (obrigatório para filmes/séries/animações)
 *            STEAM_KEY        (obrigatório para jogos e sincronização)
 *            STEAM_ID         (seu SteamID64, 17 dígitos; obrigatório para sincronizar)
 *            GOOGLE_BOOKS_KEY (opcional: aumenta a cota de livros)
 *            COMICVINE_KEY    (opcional: ativa a Comic Vine para HQs)
 *
 * LIMITES DO PLANO GRATUITO
 * 100 mil requisições/dia, 50 chamadas externas e ~10 ms de CPU por
 * requisição. Por isso a biblioteca, as capas e as conquistas da Steam
 * são pedidas separadamente, em lotes pequenos, pelo próprio site.
 * ==================================================================
 */

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
const STEAM_ASSETS = 'https://shared.akamai.steamstatic.com/store_item_assets/';
const TMDB_ANIMATION_GENRE = 16;
const MAX_ACHIEVEMENT_BATCH = 40;
const MAX_COVER_BATCH = 50;
const UPSTREAM_TIMEOUT_MS = 9000;
const VALID_TYPES = ['movies', 'animated_movies', 'series', 'animations', 'games', 'books', 'mangas', 'comics'];

/* ==================================================================
 * Entrada
 * ================================================================== */

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (!cors) return jsonResponse({ error: 'origin_not_allowed' }, 403, {});
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, 405, cors);

    try {
      const url = new URL(request.url);
      if (url.pathname === '/health') return jsonResponse(health(env), 200, cors);

      await requireOwner(request, env);

      switch (url.pathname) {
        case '/search':
          return jsonResponse(await search(env, url.searchParams.get('type'), url.searchParams.get('q')), 200, cors);
        case '/details':
          return jsonResponse(await details(env, url.searchParams.get('ref')), 200, cors);
        case '/steam/library':
          return jsonResponse(await steamLibrary(env), 200, cors);
        case '/steam/covers':
          return jsonResponse(await steamCovers(url.searchParams.get('appids')), 200, cors);
        case '/steam/achievements':
          return jsonResponse(await steamAchievements(env, url.searchParams.get('appids')), 200, cors);
        default:
          return jsonResponse({ error: 'not_found' }, 404, cors);
      }
    } catch (error) {
      const status = error.status || 500;
      if (status === 500) console.error(error);
      // Erros internos não expõem detalhes (só o código).
      const body = { error: error.code || 'internal_error' };
      if (status !== 500 && error.message !== error.code) body.message = error.message;
      return jsonResponse(body, status, cors);
    }
  },
};

/* ==================================================================
 * Utilidades HTTP
 * ================================================================== */

/** Cria um erro com status HTTP e um código curto que o site traduz. */
function httpError(status, code, message = code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

/**
 * CORS: só libera os sites da lista ALLOWED_ORIGINS.
 * Devolve null quando a origem não é permitida.
 */
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/**
 * Faz uma requisição externa e devolve o JSON.
 * Erros da API externa viram 502 (com o status original na mensagem).
 */
async function getJSON(url, init = {}) {
  let response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  } catch (error) {
    throw httpError(504, 'upstream_timeout', `${new URL(url).host}: ${error.message}`);
  }
  if (!response.ok) {
    throw httpError(502, 'upstream_error', `${new URL(url).host} respondeu ${response.status}`);
  }
  return response.json();
}

/** Garante https (algumas APIs devolvem imagens em http). */
function https(url) {
  return url ? String(url).replace(/^http:\/\//i, 'https://') : null;
}

/** Ano a partir de "2023-05-10" ou número. */
function yearOf(value) {
  const year = parseInt(String(value || '').slice(0, 4), 10);
  return Number.isFinite(year) && year > 1800 ? year : null;
}

/** Converte minutos em { duration_hours, duration_minutes }. */
function splitMinutes(total) {
  const mins = Math.round(Number(total) || 0);
  if (!mins) return {};
  return { duration_hours: Math.floor(mins / 60), duration_minutes: mins % 60 };
}

/* ==================================================================
 * Autenticação: token do Firebase da dona
 * ================================================================== */

let jwksCache = { keys: null, expires: 0 };

/** Busca (e guarda em memória) as chaves públicas que assinam os tokens do Firebase. */
async function getJwks(force = false) {
  if (!force && jwksCache.keys && Date.now() < jwksCache.expires) return jwksCache.keys;
  const response = await fetch(JWKS_URL, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  if (!response.ok) throw httpError(503, 'auth_keys_unavailable');
  const body = await response.json();
  const keys = Array.isArray(body.keys) ? body.keys : [];
  // Nunca guarda uma lista vazia (bloquearia todos os logins por 1 hora).
  if (!keys.length) throw httpError(503, 'auth_keys_unavailable');
  const maxAge = Number((response.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 3600);
  jwksCache = { keys, expires: Date.now() + maxAge * 1000 };
  return keys;
}

/** Decodifica base64url para bytes. */
function base64UrlToBytes(input) {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Verifica o token conforme a documentação do Firebase:
 * alg RS256, kid conhecido, assinatura válida, aud = projeto,
 * iss = securetoken.google.com/<projeto>, não expirado, sub = dona.
 */
export async function verifyFirebaseToken(token, env, now = Math.floor(Date.now() / 1000)) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts.some((p) => !/^[\w-]+$/.test(p))) throw httpError(401, 'invalid_token');
  let header;
  let payload;
  let signature;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1])));
    signature = base64UrlToBytes(parts[2]);
  } catch {
    throw httpError(401, 'invalid_token');
  }
  if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') throw httpError(401, 'invalid_token');
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw httpError(401, 'invalid_token');

  // Chave desconhecida: o Google pode ter trocado as chaves; busca de novo uma vez.
  let jwk = (await getJwks()).find((key) => key.kid === header.kid);
  if (!jwk) jwk = (await getJwks(true)).find((key) => key.kid === header.kid);
  if (!jwk) throw httpError(401, 'invalid_token', 'unknown key id');

  let valid = false;
  try {
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  } catch {
    valid = false;
  }
  if (!valid) throw httpError(401, 'invalid_token', 'bad signature');

  // Regras da documentação do Firebase (com 60 s de tolerância de relógio).
  const project = env.FIREBASE_PROJECT_ID;
  const skew = 60;
  const isTime = (v) => typeof v === 'number' && Number.isFinite(v);
  if (payload.aud !== project) throw httpError(401, 'invalid_token', 'wrong audience');
  if (payload.iss !== `https://securetoken.google.com/${project}`) throw httpError(401, 'invalid_token', 'wrong issuer');
  if (!isTime(payload.exp) || payload.exp <= now - skew) throw httpError(401, 'token_expired');
  if (!isTime(payload.iat) || payload.iat > now + skew) throw httpError(401, 'invalid_token', 'bad iat');
  if (!isTime(payload.auth_time) || payload.auth_time > now + skew) throw httpError(401, 'invalid_token', 'bad auth_time');
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) throw httpError(401, 'invalid_token', 'bad sub');
  if (payload.sub !== env.OWNER_UID) throw httpError(403, 'not_owner');
  return payload;
}

async function requireOwner(request, env) {
  if (!env.FIREBASE_PROJECT_ID || !env.OWNER_UID) throw httpError(500, 'worker_not_configured');
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) throw httpError(401, 'missing_token');
  await verifyFirebaseToken(token, env);
}

/** O que está configurado (o site usa para mostrar/esconder recursos). */
function health(env) {
  return {
    ok: true,
    providers: {
      tmdb: !!env.TMDB_TOKEN,
      steam: !!env.STEAM_KEY,
      steamSync: !!(env.STEAM_KEY && env.STEAM_ID),
      anilist: true,
      googleBooks: true,
      comicvine: !!env.COMICVINE_KEY,
    },
  };
}

/* ==================================================================
 * Busca e detalhes (roteamento por tipo de mídia)
 * ================================================================== */

/**
 * Resultado padronizado de busca:
 * { ref, source, kind, title, subtitle, year, cover }
 * `ref` identifica o item para pedir os detalhes depois (ex.: "tmdb:movie:157336").
 */
async function search(env, type, query) {
  const q = String(query || '').trim();
  if (!VALID_TYPES.includes(type)) throw httpError(400, 'invalid_type');
  if (q.length < 2) return { results: [] };
  if (q.length > 120) throw httpError(400, 'query_too_long');

  const tasks = {
    movies: () => [tmdbSearch(env, 'movie', q)],
    animated_movies: () => [tmdbSearch(env, 'movie', q, { animationOnly: true }), anilistSearch('ANIME', q, { moviesOnly: true })],
    series: () => [tmdbSearch(env, 'tv', q)],
    animations: () => [tmdbSearch(env, 'multi', q, { animationOnly: true }), anilistSearch('ANIME', q)],
    games: () => [steamStoreSearch(env, q)],
    books: () => [googleBooksSearch(env, q)],
    mangas: () => [anilistSearch('MANGA', q)],
    comics: () => [env.COMICVINE_KEY ? comicVineSearch(env, q) : Promise.resolve([]), googleBooksSearch(env, q)],
  }[type]();

  // Se uma fonte falhar, as outras ainda respondem.
  const settled = await Promise.allSettled(tasks);
  const results = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
  const errors = settled.filter((s) => s.status === 'rejected').map((s) => s.reason?.code || 'error');
  if (!results.length && errors.length) throw httpError(errors.includes('tmdb_not_configured') ? 503 : 502, errors[0]);
  return { results: results.slice(0, 16) };
}

/**
 * Detalhes padronizados:
 * { ref, source, kind, title, cover, year, suggestedType, fields: {...}, steam_appid? }
 * `fields` usa os MESMOS nomes do banco (seasons_total, pages_total...).
 * Só traz dados "do produto"; nada pessoal (horas, lidos, assistidos).
 */
async function details(env, ref) {
  const parts = String(ref || '').split(':');
  const [source, kind, id] = parts;
  // Cada fonte tem um formato de ID; qualquer outra coisa é recusada.
  const idPattern = source === 'gbooks' ? /^[\w-]{4,40}$/ : /^\d{1,12}$/;
  if (parts.length !== 3 || !source || !idPattern.test(id || '')) throw httpError(400, 'invalid_ref');
  switch (source) {
    case 'tmdb': return tmdbDetails(env, kind, id);
    case 'steam': return steamDetails(env, id);
    case 'anilist': return anilistDetails(kind, id);
    case 'gbooks': return googleBooksDetails(env, id);
    case 'comicvine': return comicVineDetails(env, id);
    default: throw httpError(400, 'invalid_ref');
  }
}

/* ==================================================================
 * TMDB — filmes, séries e animações (títulos em português)
 * ================================================================== */

/** Chama a API do TMDB aceitando tanto o "token v4" quanto a "chave v3". */
async function tmdb(env, path, params = {}) {
  if (!env.TMDB_TOKEN) throw httpError(503, 'tmdb_not_configured');
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  Object.entries({ language: 'pt-BR', include_adult: 'false', ...params }).forEach(([k, v]) => url.searchParams.set(k, v));
  const headers = { accept: 'application/json' };
  if (env.TMDB_TOKEN.length > 40) headers.Authorization = `Bearer ${env.TMDB_TOKEN}`;
  else url.searchParams.set('api_key', env.TMDB_TOKEN);
  return getJSON(url, { headers });
}

async function tmdbSearch(env, kind, q, { animationOnly = false } = {}) {
  const data = await tmdb(env, `/search/${kind}`, { query: q });
  return (data.results || [])
    .filter((r) => kind !== 'multi' || r.media_type === 'movie' || r.media_type === 'tv')
    .filter((r) => !animationOnly || (r.genre_ids || []).includes(TMDB_ANIMATION_GENRE))
    .slice(0, 10)
    .map((r) => {
      const mediaKind = kind === 'multi' ? r.media_type : kind;
      const title = r.title || r.name;
      const original = r.original_title || r.original_name;
      return {
        ref: `tmdb:${mediaKind}:${r.id}`,
        source: 'tmdb',
        kind: mediaKind,
        title,
        subtitle: original && original !== title ? original : null,
        year: yearOf(r.release_date || r.first_air_date),
        cover: r.poster_path ? `${TMDB_IMG}${r.poster_path}` : null,
        animated: (r.genre_ids || []).includes(TMDB_ANIMATION_GENRE),
      };
    });
}

async function tmdbDetails(env, kind, id) {
  if (kind !== 'movie' && kind !== 'tv') throw httpError(400, 'invalid_ref');
  const d = await tmdb(env, `/${kind}/${id}`);
  const animated = (d.genres || []).some((g) => g.id === TMDB_ANIMATION_GENRE);
  const base = {
    ref: `tmdb:${kind}:${id}`,
    source: 'tmdb',
    kind,
    title: d.title || d.name,
    cover: d.poster_path ? `${TMDB_IMG}${d.poster_path}` : null,
    year: yearOf(d.release_date || d.first_air_date),
  };
  if (kind === 'movie') {
    return { ...base, suggestedType: animated ? 'animated_movies' : 'movies', fields: splitMinutes(d.runtime) };
  }
  // number_of_seasons do TMDB já ignora a "temporada 0" (especiais).
  return {
    ...base,
    suggestedType: animated ? 'animations' : 'series',
    fields: { seasons_total: d.number_of_seasons ?? null, episodes_total: d.number_of_episodes ?? null },
  };
}

/* ==================================================================
 * AniList — animes e mangás (volumes, episódios)
 * ================================================================== */

const ANILIST_FIELDS = `id format status episodes duration volumes chapters
  title { romaji english } startDate { year } coverImage { extraLarge large }`;

async function anilist(query, variables) {
  const data = await getJSON('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (data.errors?.length) throw httpError(502, 'upstream_error', data.errors[0].message);
  return data.data;
}

function anilistTitle(m) {
  return m.title?.english || m.title?.romaji || '';
}

async function anilistSearch(type, q, { moviesOnly = false } = {}) {
  const data = await anilist(
    `query ($q: String, $type: MediaType) { Page(perPage: 10) { media(search: $q, type: $type, isAdult: false, sort: SEARCH_MATCH) { ${ANILIST_FIELDS} } } }`,
    { q, type },
  );
  return (data.Page?.media || [])
    .filter((m) => !moviesOnly || m.format === 'MOVIE')
    .slice(0, 8)
    .map((m) => ({
      ref: `anilist:${type.toLowerCase()}:${m.id}`,
      source: 'anilist',
      kind: type === 'MANGA' ? 'manga' : m.format === 'MOVIE' ? 'movie' : 'anime',
      title: anilistTitle(m),
      subtitle: m.title?.romaji && m.title.romaji !== anilistTitle(m) ? m.title.romaji : null,
      year: m.startDate?.year ?? null,
      cover: m.coverImage?.extraLarge || m.coverImage?.large || null,
      animated: true,
    }));
}

async function anilistDetails(kind, id) {
  if (kind !== 'anime' && kind !== 'manga') throw httpError(400, 'invalid_ref');
  const data = await anilist(`query ($id: Int) { Media(id: $id) { ${ANILIST_FIELDS} } }`, { id: Number(id) });
  const m = data.Media;
  if (!m) throw httpError(404, 'not_found');
  const base = {
    ref: `anilist:${kind}:${id}`,
    source: 'anilist',
    title: anilistTitle(m),
    cover: m.coverImage?.extraLarge || m.coverImage?.large || null,
    year: m.startDate?.year ?? null,
    ongoing: m.status === 'RELEASING',
  };
  if (kind === 'manga') {
    // Mangá em andamento costuma vir sem total de volumes (fica para você preencher).
    return { ...base, kind: 'manga', suggestedType: 'mangas', fields: { volume_amount: m.volumes ?? null } };
  }
  if (m.format === 'MOVIE') {
    return { ...base, kind: 'movie', suggestedType: 'animated_movies', fields: splitMinutes(m.duration) };
  }
  return { ...base, kind: 'anime', suggestedType: 'animations', fields: { episodes_total: m.episodes ?? null }, trackBy: 'episodes' };
}

/* ==================================================================
 * Google Books — livros (e HQs encadernadas)
 * ================================================================== */

/** Capa do Google Books em https, sem a "dobra" de página e no maior tamanho disponível. */
function googleCover(links = {}) {
  const url = links.extraLarge || links.large || links.medium || links.small || links.thumbnail || links.smallThumbnail;
  return url ? https(url).replace('&edge=curl', '') : null;
}

function mapGoogleBook(item) {
  const v = item.volumeInfo || {};
  return {
    ref: `gbooks:book:${item.id}`,
    source: 'gbooks',
    kind: 'book',
    title: [v.title, v.subtitle].filter(Boolean).join(': '),
    subtitle: (v.authors || []).join(', ') || v.publisher || null,
    year: yearOf(v.publishedDate),
    cover: googleCover(v.imageLinks),
  };
}

async function googleBooksSearch(env, q) {
  const query = async (lang) => {
    const url = new URL('https://www.googleapis.com/books/v1/volumes');
    url.searchParams.set('q', q);
    url.searchParams.set('maxResults', '10');
    url.searchParams.set('printType', 'books');
    if (lang) url.searchParams.set('langRestrict', lang);
    if (env.GOOGLE_BOOKS_KEY) url.searchParams.set('key', env.GOOGLE_BOOKS_KEY);
    const data = await getJSON(url);
    return (data.items || []).map(mapGoogleBook);
  };
  // Primeiro edições em português; se vier pouco, completa sem filtro de idioma.
  let results = await query('pt');
  if (results.length < 4) {
    const seen = new Set(results.map((r) => r.ref));
    results = results.concat((await query(null)).filter((r) => !seen.has(r.ref)));
  }
  return results.slice(0, 10);
}

async function googleBooksDetails(env, id) {
  const url = new URL(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}`);
  if (env.GOOGLE_BOOKS_KEY) url.searchParams.set('key', env.GOOGLE_BOOKS_KEY);
  const item = await getJSON(url);
  const v = item.volumeInfo || {};
  return {
    ...mapGoogleBook(item),
    suggestedType: 'books',
    fields: { pages_total: v.pageCount || v.printedPageCount || null },
  };
}

/* ==================================================================
 * Comic Vine — HQs (opcional; precisa de COMICVINE_KEY)
 * ================================================================== */

function comicVine(env, path, params = {}) {
  if (!env.COMICVINE_KEY) throw httpError(503, 'comicvine_not_configured');
  const url = new URL(`https://comicvine.gamespot.com/api${path}`);
  Object.entries({ api_key: env.COMICVINE_KEY, format: 'json', ...params }).forEach(([k, v]) => url.searchParams.set(k, v));
  // A Comic Vine recusa requisições sem User-Agent próprio.
  return getJSON(url, { headers: { 'User-Agent': 'MyEntertainmentManager/1.0', accept: 'application/json' } });
}

function mapComicVine(v) {
  return {
    ref: `comicvine:volume:${v.id}`,
    source: 'comicvine',
    kind: 'comic',
    title: v.name,
    subtitle: v.publisher?.name || null,
    year: yearOf(v.start_year),
    cover: https(v.image?.original_url || v.image?.medium_url),
  };
}

async function comicVineSearch(env, q) {
  const data = await comicVine(env, '/search/', {
    query: q, resources: 'volume', limit: '10',
    field_list: 'id,name,start_year,count_of_issues,image,publisher',
  });
  return (data.results || []).map(mapComicVine);
}

async function comicVineDetails(env, id) {
  const data = await comicVine(env, `/volume/4050-${id}/`, { field_list: 'id,name,start_year,count_of_issues,image,publisher' });
  const v = data.results || {};
  // Na Comic Vine, uma "volume" é a série; count_of_issues = número de edições.
  return { ...mapComicVine(v), suggestedType: 'comics', fields: { volume_amount: v.count_of_issues ?? null } };
}

/* ==================================================================
 * Steam — loja, conquistas e biblioteca
 * ================================================================== */

function requireSteam(env, needsId = false) {
  if (!env.STEAM_KEY) throw httpError(503, 'steam_not_configured');
  if (needsId && !/^\d{17}$/.test(String(env.STEAM_ID || ''))) throw httpError(503, 'steam_id_not_configured');
}

/** URL antiga (sem hash) da capa vertical; funciona para jogos mais antigos. */
function legacySteamCover(appid) {
  return `${STEAM_ASSETS}steam/apps/${appid}/library_600x900_2x.jpg`;
}

/**
 * Busca nome localizado e capa vertical de vários jogos de uma vez.
 * Jogos novos guardam a arte em caminhos com hash; este endpoint
 * (IStoreBrowseService/GetItems) informa o caminho certo.
 * Lotes de 50 jogos por chamada.
 */
async function steamStoreItems(appids) {
  const out = new Map();
  for (let i = 0; i < appids.length; i += 50) {
    const chunk = appids.slice(i, i + 50);
    const input = {
      ids: chunk.map((appid) => ({ appid: Number(appid) })),
      context: { language: 'brazilian', country_code: 'BR', steam_realm: 1 },
      data_request: { include_assets: true },
    };
    try {
      const data = await getJSON(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`);
      for (const item of data.response?.store_items || []) {
        const a = item.assets || {};
        const file = a.library_capsule_2x || a.library_capsule;
        out.set(Number(item.appid), {
          name: item.name || null,
          cover: a.asset_url_format && file ? `${STEAM_ASSETS}${a.asset_url_format.replace('${FILENAME}', file)}` : null,
        });
      }
    } catch {
      /* sem capas deste lote: usa a URL antiga */
    }
  }
  return out;
}

async function steamStoreSearch(env, q) {
  const url = new URL('https://store.steampowered.com/api/storesearch/');
  url.searchParams.set('term', q);
  url.searchParams.set('l', 'brazilian');
  url.searchParams.set('cc', 'BR');
  const data = await getJSON(url);
  const apps = (data.items || []).filter((i) => i.type === 'app').slice(0, 10);
  const store = await steamStoreItems(apps.map((a) => a.id));
  return apps.map((a) => ({
    ref: `steam:app:${a.id}`,
    source: 'steam',
    kind: 'game',
    title: store.get(a.id)?.name || a.name,
    subtitle: null,
    year: null,
    cover: store.get(a.id)?.cover || legacySteamCover(a.id),
  }));
}

/** Detalhes de um jogo: nome, capa e TOTAL de conquistas (o "total de troféus"). */
async function steamDetails(env, appid) {
  requireSteam(env);
  if (!/^\d{1,12}$/.test(appid)) throw httpError(400, 'invalid_ref');
  const [schema, store] = await Promise.all([
    getJSON(`https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${env.STEAM_KEY}&appid=${appid}&l=brazilian`).catch(() => ({})),
    steamStoreItems([appid]),
  ]);
  const info = store.get(Number(appid)) || {};
  const total = schema.game?.availableGameStats?.achievements?.length || 0;
  return {
    ref: `steam:app:${appid}`,
    source: 'steam',
    kind: 'game',
    title: info.name || schema.game?.gameName || '',
    cover: info.cover || legacySteamCover(appid),
    suggestedType: 'games',
    steam_appid: Number(appid),
    fields: { trophies_total: total || null },
  };
}

/**
 * Biblioteca da conta (GetOwnedGames). Exige que "Detalhes de jogos"
 * esteja público no perfil Steam. Inclui jogos gratuitos já jogados.
 */
async function steamLibrary(env) {
  requireSteam(env, true);
  const url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/');
  url.searchParams.set('key', env.STEAM_KEY);
  url.searchParams.set('steamid', env.STEAM_ID);
  url.searchParams.set('include_appinfo', '1');
  url.searchParams.set('include_played_free_games', '1');
  const data = await getJSON(url);
  const games = data.response?.games;
  if (!Array.isArray(games)) throw httpError(403, 'steam_private', 'Perfil ou detalhes de jogos privados');

  // Só a lista (rápido e leve). Capas e nomes em português vêm depois,
  // em lotes, pela rota /steam/covers — assim nenhuma chamada passa do
  // limite de CPU do plano gratuito, mesmo com milhares de jogos.
  return {
    games: games
      .map((g) => ({
        appid: g.appid,
        name: g.name,
        cover: legacySteamCover(g.appid),
        hours: Math.round(((g.playtime_forever || 0) / 60) * 10) / 10,
        lastPlayed: g.rtime_last_played ? new Date(g.rtime_last_played * 1000).toISOString().slice(0, 10) : null,
        // A Steam só envia este campo quando é true.
        hasStats: g.has_community_visible_stats === true,
      }))
      .sort((a, b) => b.hours - a.hours),
  };
}

/** Capas verticais e nomes localizados de até 50 jogos (uma chamada externa). */
async function steamCovers(appidsParam) {
  const appids = String(appidsParam || '').split(',').map((s) => s.trim()).filter((s) => /^\d{1,12}$/.test(s));
  if (!appids.length) throw httpError(400, 'invalid_appids');
  if (appids.length > MAX_COVER_BATCH) throw httpError(400, 'too_many_appids');
  const store = await steamStoreItems(appids);
  const covers = {};
  appids.forEach((appid) => {
    const info = store.get(Number(appid)) || {};
    covers[appid] = { name: info.name || null, cover: info.cover || legacySteamCover(appid) };
  });
  return { covers };
}

/**
 * Conquistas obtidas/totais de até 40 jogos (limite do plano gratuito).
 * Jogos sem conquistas voltam com total 0.
 */
async function steamAchievements(env, appidsParam) {
  requireSteam(env, true);
  const appids = String(appidsParam || '').split(',').map((s) => s.trim()).filter((s) => /^\d{1,12}$/.test(s));
  if (!appids.length) throw httpError(400, 'invalid_appids');
  if (appids.length > MAX_ACHIEVEMENT_BATCH) throw httpError(400, 'too_many_appids');

  // Aqui não usamos getJSON: a Steam responde 400 para jogo SEM conquistas,
  // e isso é diferente de uma falha (limite, tempo esgotado, perfil privado).
  const settled = await Promise.allSettled(appids.map(async (appid) => {
    const response = await fetch(
      `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${env.STEAM_KEY}&steamid=${env.STEAM_ID}&appid=${appid}`,
      { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) },
    );
    const body = await response.json().catch(() => ({}));
    const stats = body.playerstats || {};
    if (response.ok && Array.isArray(stats.achievements)) {
      return { total: stats.achievements.length, obtained: stats.achievements.filter((a) => a.achieved === 1).length };
    }
    if (/no stats/i.test(String(stats.error || ''))) return { total: 0, obtained: 0 };
    return { error: true };
  }));
  const result = {};
  appids.forEach((appid, i) => {
    result[appid] = settled[i].status === 'fulfilled' ? settled[i].value : { error: true };
  });
  return { achievements: result };
}
