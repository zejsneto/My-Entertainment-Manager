/**
 * ============================================================
 * stats.js — Regras de negócio (funções puras, sem DOM)
 * ============================================================
 * Aqui ficam os cálculos usados pelo card, pelos filtros, pelas
 * conquistas e pelo dashboard. Como são funções puras (recebem dados
 * e devolvem um resultado), ficam fáceis de testar e de reaproveitar.
 */
import { NUMERIC_FIELDS, BOOLEAN_FIELDS } from '../config/media-types.js';

/* ------------------------------------------------------------
 * Normalização
 * ------------------------------------------------------------ */

/**
 * Deixa um documento vindo do Firestore num formato previsível:
 * - números salvos como texto ("50") viram número (50);
 * - booleanos salvos como texto ("true") viram boolean;
 * - `_docId` guarda o ID real do documento no Firestore.
 *
 * Isso corrige comparações que falhavam no código antigo, como
 * "9" < "10" ser falso quando os valores eram texto.
 */
export function normalizeMedia(docId, data) {
  const media = { ...data, _docId: docId };
  for (const field of NUMERIC_FIELDS) {
    const value = media[field];
    if (value === '' || value === undefined) media[field] = null;
    else if (value !== null) {
      const num = Number(value);
      media[field] = Number.isFinite(num) ? num : null;
    }
  }
  for (const field of BOOLEAN_FIELDS) {
    const value = media[field];
    if (value === 'true') media[field] = true;
    else if (value === 'false') media[field] = false;
  }
  media.title = String(media.title ?? '').trim();
  return media;
}

/* ------------------------------------------------------------
 * Progresso e conclusão
 * ------------------------------------------------------------ */

/** Duração de filme em minutos, aceitando os dois formatos antigos. */
export function movieMinutes(m) {
  if (m.duration_only_minutes != null && m.use_hours !== true) return m.duration_only_minutes;
  const h = m.duration_hours || 0;
  const min = m.duration_minutes || 0;
  if (h || min) return h * 60 + min;
  return m.duration_only_minutes || 0;
}

/**
 * Progresso "principal" de uma mídia, usado na barra do card.
 * Devolve { done, total, unit } ou null quando o tipo não tem progresso.
 * unit é uma chave de tradução (units.pages, units.volumes...).
 */
export function getProgress(m) {
  switch (m.type) {
    case 'series':
    case 'animations':
      if (m.use_episodes) {
        if (m.episodes_total) return { done: m.episodes_watched || 0, total: m.episodes_total, unit: 'units.episodes' };
      } else if (m.seasons_total) {
        return { done: m.seasons_watched || 0, total: m.seasons_total, unit: 'units.seasons' };
      }
      return null;
    case 'books':
      return m.pages_total ? { done: m.pages_read || 0, total: m.pages_total, unit: 'units.pages' } : null;
    case 'mangas':
    case 'comics':
      return m.volume_amount ? { done: m.volume_read || 0, total: m.volume_amount, unit: 'units.volumes' } : null;
    case 'games':
      return m.trophies_total ? { done: m.trophies_obtained || 0, total: m.trophies_total, unit: 'units.trophies' } : null;
    default:
      return null;
  }
}

/** Percentual de 0 a 100 (ou null se não houver como calcular). */
export function progressPercent(progress) {
  if (!progress || !progress.total) return null;
  return Math.max(0, Math.min(100, Math.round((progress.done / progress.total) * 100)));
}

/**
 * Percentual de conclusão usado no Filtro Avançado e na ordenação.
 * Mantém a regra antiga: tipos sem progresso contam como 100%.
 */
export function completionPercent(m) {
  if (m.type === 'games' && m.trophies_total > 0) return (m.trophies_obtained / m.trophies_total) * 100;
  if (['books', 'mangas', 'comics', 'series', 'animations'].includes(m.type)) {
    const pct = progressPercent(getProgress(m));
    return pct ?? 100;
  }
  return 100;
}

/** Jogo com todos os troféus = platina. */
export function isPlatinum(m) {
  return m.type === 'games' && m.trophies_total > 0 && m.trophies_obtained >= m.trophies_total;
}

/**
 * Status do jogo, a partir dos dois campos booleanos antigos:
 * - "beaten"  → zerado
 * - "online"  → online / sem campanha
 * - "playing" → ainda não zerado
 */
export function gameStatus(m) {
  if (m.beaten) return 'beaten';
  if (m.online) return 'online';
  return 'playing';
}

/**
 * Mídias "não concluídas" (mesma regra do dashboard antigo):
 * livros/mangás/HQs com leitura incompleta, séries com temporadas ou
 * episódios faltando e jogos não zerados ou com troféus faltando.
 */
export function isUnfinished(m) {
  switch (m.type) {
    case 'books':
      return m.pages_total > 0 && (m.pages_read || 0) < m.pages_total;
    case 'mangas':
    case 'comics':
      return m.volume_amount > 0 && (m.volume_read || 0) < m.volume_amount;
    case 'series':
    case 'animations': {
      const p = getProgress(m);
      return !!p && p.done < p.total;
    }
    case 'games': {
      const trophyGap = m.trophies_total > 0 && (m.trophies_obtained || 0) < m.trophies_total;
      if (m.online) return trophyGap;
      if (m.beaten) return trophyGap;
      return true;
    }
    default:
      return false;
  }
}

/* ------------------------------------------------------------
 * Conquistas (mesma regra de pontos do código antigo)
 * ------------------------------------------------------------ */

/** Marcos de cada categoria. Cada marco atingido vale +1000 pontos. */
export const ACHIEVEMENT_THRESHOLDS = {
  movies: [10, 25, 50, 75, 100, 150, 200, 300, 500, 1000, 2000, 5000, 10000],
  series: [5, 10, 25, 50, 75, 100, 150, 200, 300, 500, 1000, 2000, 5000, 10000],
  animations: [5, 10, 25, 50, 75, 100, 150, 200, 300, 500, 1000, 2000, 5000, 10000],
  games: [10, 25, 50, 75, 100, 150, 200, 300, 500, 1000, 2000, 5000, 10000],
  platinum: [5, 10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 1000, 2000, 5000, 10000],
  books: [5, 10, 25, 50, 100, 150, 200, 300, 500, 1000, 2000, 5000, 10000],
  mangas: [5, 10, 25, 50, 100, 150, 200, 300, 500, 1000, 2000, 5000, 10000],
  comics: [5, 10, 25, 50, 100, 150, 200, 300, 500, 1000, 2000, 5000, 10000],
};

/**
 * Conta as mídias concluídas por categoria e soma os pontos.
 * `enabledTypes` = tipos ativos nas Configurações.
 * Regras preservadas do código original, inclusive:
 * - filme animado conta para Filmes e/ou Animações;
 * - série conta se tiver ao menos uma temporada assistida
 *   (assim séries ainda em exibição, como 4/5 temporadas, contam).
 */
export function calculateAchievements(medias, enabledTypes) {
  const counts = { movies: 0, series: 0, animations: 0, games: 0, platinum: 0, books: 0, mangas: 0, comics: 0 };
  const on = (type) => enabledTypes.includes(type);

  for (const m of medias) {
    switch (m.type) {
      case 'movies':
        if (on('movies')) counts.movies++;
        break;
      case 'animated_movies':
        if (on('movies')) counts.movies++;
        if (on('animations')) counts.animations++;
        break;
      case 'series':
        if (!on('series')) break;
        if (m.use_episodes ? m.episodes_watched >= m.episodes_total : (m.seasons_watched >= m.seasons_total || m.seasons_watched > 0)) {
          counts.series++;
        }
        break;
      case 'animations':
        if (!on('animations')) break;
        if (m.use_episodes ? m.episodes_watched >= m.episodes_total : m.seasons_watched >= m.seasons_total) {
          counts.animations++;
        }
        break;
      case 'games':
        if (!on('games')) break;
        if (m.beaten) counts.games++;
        if (isPlatinum(m)) counts.platinum++;
        break;
      case 'books':
        if (on('books') && m.pages_total && Math.abs((m.pages_read || 0) - m.pages_total) <= 1) counts.books++;
        break;
      case 'mangas':
      case 'comics':
        if (on(m.type) && m.volume_amount && (m.volume_read || 0) >= m.volume_amount) counts[m.type]++;
        break;
      default:
        break;
    }
  }

  // Monta a lista de categorias visíveis com o próximo marco de cada uma.
  const categories = [];
  let totalPoints = 0;
  for (const [key, thresholds] of Object.entries(ACHIEVEMENT_THRESHOLDS)) {
    const visible = key === 'platinum' ? on('games') : on(key);
    if (!visible) continue;
    const value = counts[key];
    const reached = thresholds.filter((goal) => value >= goal).length;
    totalPoints += reached * 1000;
    const nextGoal = thresholds.find((goal) => value < goal) ?? thresholds[thresholds.length - 1];
    categories.push({ key, value, nextGoal, reached, percent: Math.min(100, Math.round((value / nextGoal) * 100)) });
  }

  return { counts, categories, totalPoints };
}

/* ------------------------------------------------------------
 * Tempo estimado (mesma tabela do tooltip antigo)
 * ------------------------------------------------------------ */

/**
 * Estima horas gastas:
 * - filmes: duração informada
 * - séries: 45 min por episódio (ou 10 episódios por temporada)
 * - animações: 20 min por episódio (ou 12 episódios por temporada)
 * - jogos: horas jogadas
 * - livros: 1h a cada 25 páginas
 * - mangás/HQs: 30 min por volume
 */
export function estimateHours(m) {
  switch (m.type) {
    case 'movies':
    case 'animated_movies':
      return movieMinutes(m) / 60;
    case 'games':
      return m.hours_played || 0;
    case 'books':
      return (m.pages_read || 0) / 25;
    case 'mangas':
    case 'comics':
      return (m.volume_read || 0) * 0.5;
    case 'series': {
      const eps = m.use_episodes ? m.episodes_watched || 0 : (m.seasons_watched || 0) * 10;
      return eps * 0.75;
    }
    case 'animations': {
      const eps = m.use_episodes ? m.episodes_watched || 0 : (m.seasons_watched || 0) * 12;
      return eps * (20 / 60);
    }
    default:
      return 0;
  }
}
