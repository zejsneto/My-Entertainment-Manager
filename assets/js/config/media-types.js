/**
 * ============================================================
 * media-types.js — "Fonte da verdade" de cada tipo de mídia
 * ============================================================
 * Tudo o que muda de um tipo para outro (ícone, cor, rótulos,
 * campos do formulário e como calcular o progresso) fica aqui.
 *
 * Antes, cada tela (card, formulário de adicionar, formulário de
 * editar, dashboard...) tinha o seu próprio `if (type === 'games')`.
 * Agora todas leem desta tabela. Para criar um tipo novo, basta
 * acrescentar uma entrada em MEDIA_TYPES e as traduções.
 *
 * Os nomes dos campos (hours_played, volume_read etc.) são os MESMOS
 * que já estão salvos no Firestore, para manter compatibilidade total
 * com os dados existentes.
 */

/**
 * Tipos "principais", que aparecem nos filtros e nas Configurações.
 * `animated_movies` não está aqui de propósito: ele é um subtipo que
 * aparece tanto em "Filmes" quanto em "Animações" (ver TYPE_GROUPS).
 */
export const PRIMARY_TYPES = ['movies', 'series', 'animations', 'games', 'books', 'mangas', 'comics'];

/** Todos os tipos que podem existir no banco, na ordem de exibição. */
export const ALL_TYPES = ['movies', 'animated_movies', 'series', 'animations', 'games', 'books', 'mangas', 'comics'];

/**
 * Quais tipos do banco entram em cada filtro principal.
 * Ex.: o filtro "Filmes" mostra filmes e filmes animados.
 */
export const TYPE_GROUPS = {
  movies: ['movies', 'animated_movies'],
  series: ['series'],
  animations: ['animations', 'animated_movies'],
  games: ['games'],
  books: ['books'],
  mangas: ['mangas'],
  comics: ['comics'],
};

/**
 * Configuração visual + textual de cada tipo.
 * - icon: classe do Font Awesome 6 (versão gratuita)
 * - color: variável CSS do acento do tipo (definida em tokens.css)
 * - verbKey: chave i18n do verbo usado na data ("Assistido em", "Jogado em"...)
 */
export const MEDIA_TYPES = {
  movies:          { icon: 'fa-film',          color: '--type-movies',     verbKey: 'verbs.watched' },
  animated_movies: { icon: 'fa-wand-magic-sparkles', color: '--type-animated', verbKey: 'verbs.watched' },
  series:          { icon: 'fa-tv',            color: '--type-series',     verbKey: 'verbs.watched' },
  animations:      { icon: 'fa-dragon',        color: '--type-animations', verbKey: 'verbs.watched' },
  games:           { icon: 'fa-gamepad',       color: '--type-games',      verbKey: 'verbs.played' },
  books:           { icon: 'fa-book',          color: '--type-books',      verbKey: 'verbs.read' },
  mangas:          { icon: 'fa-book-open',     color: '--type-mangas',     verbKey: 'verbs.read' },
  comics:          { icon: 'fa-mask',          color: '--type-comics',     verbKey: 'verbs.read' },
};

/** Ícone do tipo (com fallback para um ícone genérico). */
export function typeIcon(type) {
  return MEDIA_TYPES[type]?.icon ?? 'fa-circle-question';
}

/**
 * Campos numéricos conhecidos. Ao ler do Firestore, esses campos são
 * convertidos para número (o código antigo às vezes salvava "50" como
 * texto, o que quebrava comparações como troféus obtidos === total).
 */
export const NUMERIC_FIELDS = [
  'rating', 'hours_played', 'trophies_total', 'trophies_obtained',
  'pages_read', 'pages_total', 'volume_read', 'volume_amount',
  'seasons_watched', 'seasons_total', 'episodes_watched', 'episodes_total',
  'duration_only_minutes', 'duration_hours', 'duration_minutes',
];

/** Campos booleanos conhecidos (o banco antigo pode ter "true"/"false" como texto). */
export const BOOLEAN_FIELDS = ['online', 'beaten', 'use_episodes', 'use_hours'];

/**
 * Lista de TODOS os campos específicos. Ao salvar, campos que não
 * pertencem ao tipo são gravados como null — igual ao "template" que
 * o código antigo usava, mantendo os documentos com o mesmo formato.
 */
export const ALL_SPECIFIC_FIELDS = [
  ...NUMERIC_FIELDS.filter((f) => f !== 'rating'),
  ...BOOLEAN_FIELDS,
];
