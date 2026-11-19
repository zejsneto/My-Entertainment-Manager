/**
 * ============================================================
 * media-view.js — Como cada mídia é "descrita" na tela
 * ============================================================
 * Funções que transformam os dados de uma mídia em pedaços de
 * interface (ícone, nome do tipo, linha de estatísticas, capa).
 * São usadas pelo card, pelos detalhes e pelo dashboard, para que
 * todos mostrem a mesma informação do mesmo jeito.
 */
import { MEDIA_TYPES, typeIcon } from '../config/media-types.js';
import { t, getLocale } from '../core/i18n.js';
import { escapeHtml, safeImageSrc } from '../core/dom.js';
import { formatMinutes, formatNumber } from '../core/format.js';
import { getProgress, progressPercent, movieMinutes, gameStatus, isPlatinum } from '../core/stats.js';

/** Nome do tipo no singular ("Jogo") ou plural ("Jogos"). */
export function typeName(type, plural = false) {
  return t(`${plural ? 'typesPlural' : 'types'}.${type}`);
}

/** Estilo inline que define a cor de destaque do tipo (--accent). */
export function accentStyle(type) {
  const color = MEDIA_TYPES[type]?.color || '--type-movies';
  return `--accent: var(${color});`;
}

/** Ícone <i> do tipo, já com aria-hidden (é decorativo). */
export function typeIconHtml(type, extra = '') {
  return `<i class="fa-solid ${typeIcon(type)} ${extra}" aria-hidden="true"></i>`;
}

/**
 * HTML da capa. Sem imagem válida, mostra um "pôster" gerado com o
 * ícone do tipo e as iniciais do título (em vez de uma imagem quebrada,
 * como o 'default-cover.png' inexistente do código antigo).
 */
export function coverHtml(media, { eager = false } = {}) {
  const src = safeImageSrc(media.cover_img);
  if (src) {
    // Se a imagem falhar ao carregar, o listener global em main.js
    // (handleBrokenCovers) troca pelo pôster gerado.
    return `<img class="poster__img" src="${escapeHtml(src)}" alt="" loading="${eager ? 'eager' : 'lazy'}" decoding="async">`;
  }
  return '';
}

/**
 * Pôster completo: imagem (ou fundo gerado) + ícone e iniciais.
 * O fundo gerado fica sempre por baixo e só aparece se não houver
 * imagem ou se ela quebrar.
 */
export function posterHtml(media, options = {}) {
  const img = coverHtml(media, options);
  return `
    <div class="poster ${img ? '' : 'poster--empty'}" style="${accentStyle(media.type)}">
      <div class="poster__fallback" aria-hidden="true">
        ${typeIconHtml(media.type)}
        <span>${escapeHtml(initials(media.title))}</span>
      </div>
      ${img}
    </div>`;
}

/** Iniciais para o pôster gerado ("Elden Ring" → "ER"). */
export function initials(title) {
  return String(title || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/**
 * Estatísticas curtas que aparecem embaixo do título no card.
 * Devolve uma lista de { icon, text, tone? } — no máximo 2 itens,
 * para o card não ficar poluído (o resto fica nos Detalhes).
 */
export function cardStats(m) {
  const stats = [];
  const progress = getProgress(m);
  const pct = progressPercent(progress);

  switch (m.type) {
    case 'movies':
    case 'animated_movies': {
      const mins = movieMinutes(m);
      if (mins) stats.push({ icon: 'fa-clock', text: formatMinutes(mins) });
      break;
    }
    case 'games': {
      if (m.hours_played) stats.push({ icon: 'fa-hourglass-half', text: `${formatNumber(m.hours_played)}h` });
      if (isPlatinum(m)) stats.push({ icon: 'fa-trophy', text: t('game.platinum'), tone: 'gold' });
      else {
        const status = gameStatus(m);
        const icon = status === 'beaten' ? 'fa-flag-checkered' : status === 'online' ? 'fa-globe' : 'fa-play';
        // Versão curta do status no card ("Online" em vez de "Online / sem campanha").
        stats.push({ icon, text: t(`game.statusShort.${status}`), tone: status === 'beaten' ? 'success' : undefined });
      }
      break;
    }
    default:
      if (progress) {
        stats.push({ icon: 'fa-layer-group', text: `${formatNumber(progress.done)}/${formatNumber(progress.total)} ${t(`${progress.unit}Short`)}` });
        if (pct === 100) stats.push({ icon: 'fa-check', text: t('status.done'), tone: 'success' });
        else stats.push({ icon: 'fa-chart-simple', text: `${pct}%` });
      }
  }
  return stats.slice(0, 2);
}

/** Converte a lista de cardStats em HTML. */
export function statsHtml(stats) {
  return stats
    .map((s) => `<span class="stat ${s.tone ? `stat--${s.tone}` : ''}"><i class="fa-solid ${s.icon}" aria-hidden="true"></i>${escapeHtml(s.text)}</span>`)
    .join('');
}

/**
 * Linhas completas para a janela de Detalhes: tudo o que existe
 * sobre a mídia, com rótulo. Devolve [{ label, value }].
 */
export function detailRows(m) {
  const rows = [];
  const add = (labelKey, value) => {
    if (value !== null && value !== undefined && value !== '') rows.push({ label: t(labelKey), value });
  };
  const fraction = (done, total) => (total ? `${formatNumber(done || 0)} / ${formatNumber(total)}` : null);

  switch (m.type) {
    case 'movies':
    case 'animated_movies':
      add('fields.duration', movieMinutes(m) ? formatMinutes(movieMinutes(m)) : null);
      break;
    case 'series':
    case 'animations':
      if (m.use_episodes) add('fields.episodes', fraction(m.episodes_watched, m.episodes_total));
      else add('fields.seasons', fraction(m.seasons_watched, m.seasons_total));
      break;
    case 'games':
      add('fields.hoursPlayed', m.hours_played != null ? `${m.hours_played.toLocaleString(getLocale())}h` : null);
      add('fields.status', t(`game.status.${gameStatus(m)}`));
      add('fields.trophies', fraction(m.trophies_obtained, m.trophies_total));
      break;
    case 'books':
      add('fields.pages', fraction(m.pages_read, m.pages_total));
      break;
    case 'mangas':
    case 'comics':
      add('fields.volumes', fraction(m.volume_read, m.volume_amount));
      break;
    default:
      break;
  }
  const pct = progressPercent(getProgress(m));
  if (pct != null) add('fields.progress', `${pct}%`);
  return rows;
}
