/**
 * ============================================================
 * dashboard.js — Painel de estatísticas
 * ============================================================
 * Estrutura:
 * - Chips de tipo no topo: escolhem quais tipos entram nas contas.
 * - Linha de indicadores (KPIs): total, tempo estimado, nota média,
 *   pontos e troféus.
 * - Widgets reordenáveis (arrastar e soltar com SortableJS): gráficos
 *   e listas. A ordem é salva no navegador e a grade nunca fica com
 *   buracos (ver fillRows).
 *
 * Gráficos (Chart.js), escolhidos seguindo a recomendação da Smashing
 * Magazine de usar o gráfico mais simples que responde a pergunta:
 * - Mídias por tipo: barras horizontais (ou rosca, alternável)
 * - Linha do tempo: colunas por ano
 * - Distribuição de notas: histograma de 0 a 10
 * - Status dos jogos: rosca com 3 fatias
 * - Leitura concluída: barras
 *
 * Correções em relação ao antigo:
 * - O antigo recarregava todas as mídias do Firestore uma segunda vez
 *   só para o dashboard, e essa cópia sobrescrevia a lista principal
 *   SEM o _docId (podia quebrar a edição). Agora usa o mesmo estado.
 * - Os botões de tipo de gráfico ganhavam um listener novo a cada
 *   atualização; agora há um listener só.
 */
import { $, $$, escapeHtml, prefersReducedMotion, debounce } from '../core/dom.js';
import { t, tp, getLocale } from '../core/i18n.js';
import { formatHours, formatDays, formatNumber, formatRating, formatDate, yearOf } from '../core/format.js';
import { ALL_TYPES, MEDIA_TYPES } from '../config/media-types.js';
import { getState, getEnabledMedias, findMedia } from '../core/state.js';
import { estimateHours, isUnfinished, gameStatus, isPlatinum, calculateAchievements, getProgress, progressPercent } from '../core/stats.js';
import * as prefs from '../core/prefs.js';
import { toast } from './dialogs.js';
import { typeName, typeIconHtml, posterHtml, accentStyle } from './media-view.js';

const charts = {};           // instâncias do Chart.js por id do <canvas>
let dashTypes = null;        // tipos marcados nos chips do dashboard (null = todos)
let timeMode = 'hours';      // "hours" ou "days" no KPI de tempo
let sortable = null;
let handlers = { onOpen: () => {} };

/* ------------------------------------------------------------
 * Utilidades de cor (lidas do CSS, para acompanhar o tema)
 * ------------------------------------------------------------ */

/** Lê uma variável CSS do tema atual. */
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Cor de destaque de um tipo de mídia (ex.: verde para jogos). */
function typeColor(type) {
  return cssVar(MEDIA_TYPES[type]?.color || '--primary');
}

/** Opções comuns a todos os gráficos (fonte, cores, tooltip). */
function baseOptions() {
  const text = cssVar('--text-muted');
  const grid = cssVar('--border');
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: prefersReducedMotion() ? false : { duration: 500 },
    locale: getLocale(),
    plugins: {
      legend: { display: false, labels: { color: text, boxWidth: 12, boxHeight: 12, padding: 14, font: { family: 'Inter', size: 12 } } },
      tooltip: {
        backgroundColor: cssVar('--surface-3'),
        titleColor: cssVar('--text'),
        bodyColor: cssVar('--text'),
        borderColor: grid,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        titleFont: { family: 'Inter', weight: '600' },
        bodyFont: { family: 'Inter' },
      },
    },
    scales: {
      x: { ticks: { color: text, font: { family: 'Inter', size: 12 } }, grid: { color: grid, drawTicks: false }, border: { display: false } },
      y: { ticks: { color: text, font: { family: 'Inter', size: 12 }, precision: 0 }, grid: { color: grid, drawTicks: false }, border: { display: false }, beginAtZero: true },
    },
  };
}

/** Mescla objetos de opções (profundidade simples). */
function merge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) target[key] = merge(target[key] || {}, value);
    else target[key] = value;
  }
  return target;
}

/**
 * Cria ou recria um gráfico. Também atualiza o aria-label do <canvas>
 * com um resumo em texto, porque o conteúdo de um canvas não é lido
 * por leitores de tela.
 */
function drawChart(id, type, data, options = {}, summary = '') {
  const canvas = document.getElementById(id);
  if (!canvas || !window.Chart) return;
  charts[id]?.destroy();
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', summary);
  charts[id] = new window.Chart(canvas, { type, data, options: merge(baseOptions(), options) });
}

/** Mostra/esconde um widget inteiro. */
function toggleWidget(id, visible) {
  const el = document.querySelector(`[data-widget="${id}"]`);
  if (el) el.hidden = !visible;
}

/* ------------------------------------------------------------
 * Dados
 * ------------------------------------------------------------ */

/** Mídias consideradas no dashboard (tipos ativos + chips do dashboard). */
function dashboardMedias() {
  const enabled = getEnabledMedias();
  if (!dashTypes) return enabled;
  return enabled.filter((m) => dashTypes.includes(m.type));
}

/** Tipos (do banco) que realmente existem nos dados ativos. */
function presentTypes() {
  const present = new Set(getEnabledMedias().map((m) => m.type));
  return ALL_TYPES.filter((type) => present.has(type));
}

/* ------------------------------------------------------------
 * Partes do dashboard
 * ------------------------------------------------------------ */

/** Chips para escolher os tipos que entram nas estatísticas. */
function renderTypeChips() {
  const enabled = getEnabledMedias();
  const types = presentTypes();
  if (dashTypes) dashTypes = dashTypes.filter((type) => types.includes(type));
  $('#dash-types').innerHTML = types.map((type) => {
    const count = enabled.filter((m) => m.type === type).length;
    const on = !dashTypes || dashTypes.includes(type);
    return `
      <label class="check-chip" style="${accentStyle(type)}">
        <input type="checkbox" value="${type}" ${on ? 'checked' : ''}>
        <span>${typeIconHtml(type)}${escapeHtml(typeName(type, true))}<span class="chip__count">${count}</span></span>
      </label>`;
  }).join('');
}

/** Linha de indicadores (KPIs). */
function renderKpis(list) {
  const rated = list.filter((m) => m.rating != null);
  const avg = rated.length ? rated.reduce((sum, m) => sum + m.rating, 0) / rated.length : null;
  const hours = list.reduce((sum, m) => sum + estimateHours(m), 0);
  const games = list.filter((m) => m.type === 'games');
  const trophies = games.reduce((sum, m) => sum + (m.trophies_obtained || 0), 0);
  const platinums = games.filter(isPlatinum).length;
  const points = calculateAchievements(getEnabledMedias(), getState().activeTypes).totalPoints;

  $('#kpi-total').textContent = formatNumber(list.length);
  $('#kpi-time').textContent = timeMode === 'hours' ? formatHours(hours) : formatDays(hours);
  $('#kpi-time-toggle').textContent = t(timeMode === 'hours' ? 'dashboard.showDays' : 'dashboard.showHours');
  $('#kpi-rating').textContent = avg == null ? '—' : formatRating(avg);
  $('#kpi-rating-note').textContent = tp('dashboard.ratedCount', rated.length);
  $('#kpi-points').textContent = formatNumber(points);
  $('#kpi-trophies').textContent = formatNumber(trophies);
  $('#kpi-trophies-note').textContent = tp('dashboard.platinumCount', platinums);
  $('#kpi-trophies-card').hidden = games.length === 0;
}

/** Mídias por tipo (barras horizontais ou rosca). */
function renderByType(list) {
  const chartType = prefs.getCategoryChartType();
  $$('[data-chart-type]').forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.chartType === chartType)));

  const types = ALL_TYPES.filter((type) => list.some((m) => m.type === type));
  const counts = types.map((type) => list.filter((m) => m.type === type).length);
  // Ordena do maior para o menor (mais fácil de ler).
  const order = types.map((_, i) => i).sort((a, b) => counts[b] - counts[a]);
  const labels = order.map((i) => typeName(types[i], true));
  const values = order.map((i) => counts[i]);
  const colors = order.map((i) => typeColor(types[i]));
  const summary = labels.map((label, i) => `${label}: ${values[i]}`).join(', ');

  if (chartType === 'doughnut') {
    drawChart('chart-by-type', 'doughnut', { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: cssVar('--surface-1'), borderWidth: 2 }] }, {
      cutout: '62%',
      plugins: { legend: { display: true, position: 'right' } },
      scales: { x: { display: false }, y: { display: false } },
    }, summary);
  } else {
    drawChart('chart-by-type', 'bar', { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 6, barThickness: 'flex', maxBarThickness: 28 }] }, {
      indexAxis: 'y',
      scales: { x: { ticks: { precision: 0 } }, y: { grid: { display: false } } },
    }, summary);
  }
}

/** Linha do tempo: quantidade consumida por ano. */
function renderTimeline(list) {
  const byYear = {};
  list.forEach((m) => {
    const year = yearOf(m.consumed_date);
    if (year) byYear[year] = (byYear[year] || 0) + 1;
  });
  const years = Object.keys(byYear).sort();
  // Preenche anos sem consumo com zero, para a linha do tempo não "pular".
  const full = [];
  for (let y = Number(years[0]); y <= Number(years[years.length - 1]); y++) full.push(String(y));
  const values = full.map((y) => byYear[y] || 0);
  drawChart('chart-timeline', 'bar', {
    labels: full,
    datasets: [{ data: values, backgroundColor: cssVar('--primary'), borderRadius: 6, maxBarThickness: 36 }],
  }, { scales: { x: { grid: { display: false } } } }, full.map((y, i) => `${y}: ${values[i]}`).join(', '));
  toggleWidget('timeline', full.length > 0);
}

/** Histograma de notas (arredondadas para o inteiro mais próximo). */
function renderRatings(list) {
  const buckets = Array(11).fill(0);
  list.forEach((m) => {
    if (m.rating == null) return;
    const r = Math.round(m.rating);
    if (r >= 0 && r <= 10) buckets[r]++;
  });
  const labels = buckets.map((_, i) => String(i));
  drawChart('chart-ratings', 'bar', {
    labels,
    datasets: [{ data: buckets, backgroundColor: cssVar('--star'), borderRadius: 4, maxBarThickness: 28 }],
  }, { scales: { x: { grid: { display: false } } } }, labels.map((l, i) => `${l}: ${buckets[i]}`).join(', '));
}

/** Status dos jogos (zerados / jogando / online). */
function renderGames(list) {
  const games = list.filter((m) => m.type === 'games');
  toggleWidget('games', games.length > 0);
  if (!games.length) return;
  const counts = { beaten: 0, playing: 0, online: 0 };
  games.forEach((m) => counts[gameStatus(m)]++);
  const keys = ['beaten', 'playing', 'online'];
  const labels = keys.map((k) => t(`game.status.${k}`));
  drawChart('chart-games', 'doughnut', {
    labels,
    datasets: [{
      data: keys.map((k) => counts[k]),
      backgroundColor: [cssVar('--type-games'), cssVar('--text-subtle'), cssVar('--type-series')],
      borderColor: cssVar('--surface-1'),
      borderWidth: 2,
    }],
  }, {
    cutout: '62%',
    plugins: { legend: { display: true, position: 'bottom' } },
    scales: { x: { display: false }, y: { display: false } },
  }, labels.map((l, i) => `${l}: ${counts[keys[i]]}`).join(', '));
}

/** Leitura: livros, mangás e HQs concluídos x em andamento. */
function renderReading(list) {
  const types = ['books', 'mangas', 'comics'].filter((type) => list.some((m) => m.type === type));
  toggleWidget('reading', types.length > 0);
  if (!types.length) return;
  const done = types.map((type) => list.filter((m) => m.type === type && progressPercent(getProgress(m)) === 100).length);
  const doing = types.map((type) => list.filter((m) => m.type === type && progressPercent(getProgress(m)) !== 100).length);
  const labels = types.map((type) => typeName(type, true));
  drawChart('chart-reading', 'bar', {
    labels,
    datasets: [
      { label: t('status.done'), data: done, backgroundColor: types.map(typeColor), borderRadius: 4, maxBarThickness: 36 },
      { label: t('status.inProgress'), data: doing, backgroundColor: cssVar('--surface-3'), borderRadius: 4, maxBarThickness: 36 },
    ],
  }, {
    plugins: { legend: { display: true, position: 'bottom' } },
    scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true } },
  }, labels.map((l, i) => `${l}: ${done[i]} / ${done[i] + doing[i]}`).join(', '));
}

/** Linha de uma lista com mini capa (usada em "Melhores notas" e "Não concluídas"). */
function miniItem(m, extra) {
  return `
    <li>
      <button type="button" class="mini-item" data-open="${escapeHtml(m._docId)}" style="${accentStyle(m.type)}">
        <span class="mini-item__cover">${posterHtml(m)}</span>
        <span class="mini-item__text">
          <strong>${escapeHtml(m.title)}</strong>
          <small>${typeIconHtml(m.type)} ${escapeHtml(typeName(m.type))} · ${escapeHtml(formatDate(m.consumed_date))}</small>
        </span>
        <span class="mini-item__extra">${extra}</span>
      </button>
    </li>`;
}

/** Top 5 notas mais altas. */
function renderTopRated(list) {
  const top = list.filter((m) => m.rating != null)
    .sort((a, b) => b.rating - a.rating || a.title.localeCompare(b.title))
    .slice(0, 5);
  $('#top-rated-list').innerHTML = top.length
    ? top.map((m) => miniItem(m, `<span class="rating-pill"><i class="fa-solid fa-star" aria-hidden="true"></i>${formatRating(m.rating)}</span>`)).join('')
    : `<li class="muted">${escapeHtml(t('dashboard.noData'))}</li>`;
}

/** Até 6 mídias não concluídas, das mais recentes para as mais antigas. */
function renderUnfinished(list) {
  const items = list.filter(isUnfinished)
    .sort((a, b) => String(b.consumed_date || '').localeCompare(String(a.consumed_date || '')))
    .slice(0, 6);
  $('#unfinished-list').innerHTML = items.length
    ? items.map((m) => {
      const p = getProgress(m);
      const pct = progressPercent(p);
      const extra = pct != null
        ? `<span class="mini-progress"><span class="meter meter--sm"><span style="width:${pct}%"></span></span><small>${pct}%</small></span>`
        : `<small>${escapeHtml(t(`game.status.${gameStatus(m)}`))}</small>`;
      return miniItem(m, extra);
    }).join('')
    : `<li class="muted">${escapeHtml(t('dashboard.allDone'))}</li>`;
}

/* ------------------------------------------------------------
 * Render principal
 * ------------------------------------------------------------ */

/** Redesenha o dashboard inteiro (só quando ele está visível). */
export function renderDashboard() {
  if (getState().view !== 'dashboard') return;
  renderTypeChips();
  const list = dashboardMedias();
  renderKpis(list);
  renderByType(list);
  renderTimeline(list);
  renderRatings(list);
  renderGames(list);
  renderReading(list);
  renderTopRated(list);
  renderUnfinished(list);
  fillRows();
}

/* ------------------------------------------------------------
 * Layout (arrastar e soltar)
 * ------------------------------------------------------------ */

/** Aplica a ordem salva dos widgets. */
function applySavedLayout() {
  const order = prefs.getDashboardLayout();
  if (!order) return;
  const grid = $('#dash-grid');
  order.forEach((id) => {
    const el = grid.querySelector(`[data-widget="${id}"]`);
    if (el) grid.appendChild(el);
  });
}

function setupSortable() {
  if (!window.Sortable || sortable) return;
  sortable = window.Sortable.create($('#dash-grid'), {
    animation: prefersReducedMotion() ? 0 : 180,
    handle: '.widget__handle',
    ghostClass: 'is-ghost',
    // Salva a ordem automaticamente ao soltar (antes precisava clicar em "Salvar").
    onEnd: () => {
      prefs.setDashboardLayout($$('#dash-grid [data-widget]').map((el) => el.dataset.widget));
      fillRows(); // nova ordem → recalcula para não sobrar espaço
    },
  });
}

/* ------------------------------------------------------------
 * Grade sem buracos
 * ------------------------------------------------------------ */

/**
 * Ajusta a largura (span) dos widgets para que TODA linha da grade
 * fique completa, sem espaço sobrando — mesmo depois de reordenar
 * arrastando ou quando um widget some (ex.: sem jogos, some "Status dos jogos").
 *
 * Como funciona: percorre os widgets visíveis na ordem atual, simulando
 * a montagem das linhas. Se o próximo widget não cabe no que sobrou da
 * linha, o widget anterior "estica" para ocupar a sobra. No fim, o
 * último widget estica até o fim da última linha.
 */
function fillRows() {
  const grid = $('#dash-grid');
  if (!grid || grid.offsetParent === null) return;
  const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
  const widgets = $$('[data-widget]', grid).filter((el) => !el.hidden);

  let used = 0;        // colunas já ocupadas na linha atual
  let last = null;     // último widget colocado na linha atual
  let lastSpan = 0;
  for (const el of widgets) {
    let span = Math.min(el.classList.contains('widget--wide') ? 2 : 1, cols);
    if (used + span > cols) {
      // Não cabe: o anterior estica até o fim da linha e começa outra.
      if (last) last.style.gridColumn = `span ${lastSpan + (cols - used)}`;
      used = 0;
    }
    el.style.gridColumn = `span ${span}`;
    used += span;
    last = el;
    lastSpan = span;
    if (used === cols) used = 0;
  }
  // Última linha incompleta: o último widget preenche o resto.
  if (last && used > 0) last.style.gridColumn = `span ${lastSpan + (cols - used)}`;
}

/* ------------------------------------------------------------
 * Inicialização
 * ------------------------------------------------------------ */

export function initDashboard(callbacks) {
  handlers = { ...handlers, ...callbacks };
  applySavedLayout();

  // Chips de tipo do dashboard
  $('#dash-types').addEventListener('change', () => {
    const checked = $$('#dash-types input:checked').map((cb) => cb.value);
    dashTypes = checked.length === presentTypes().length ? null : checked;
    renderDashboard();
  });

  // Alternar horas/dias
  $('#kpi-time-toggle').addEventListener('click', () => {
    timeMode = timeMode === 'hours' ? 'days' : 'hours';
    renderKpis(dashboardMedias());
  });

  // Alternar barras/rosca (um listener só)
  $$('[data-chart-type]').forEach((btn) => btn.addEventListener('click', () => {
    prefs.setCategoryChartType(btn.dataset.chartType);
    renderByType(dashboardMedias());
  }));

  // Clicar numa mídia das listas abre os detalhes
  $('#dashboard').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-open]');
    if (!btn) return;
    const media = findMedia(btn.dataset.open);
    if (media) handlers.onOpen(media);
  });

  // Restaurar layout padrão
  $('#reset-layout').addEventListener('click', () => {
    prefs.clearDashboardLayout();
    const grid = $('#dash-grid');
    $$('[data-widget]', grid)
      .sort((a, b) => Number(a.dataset.order) - Number(b.dataset.order))
      .forEach((el) => grid.appendChild(el));
    fillRows();
    toast(t('dashboard.layoutReset'), 'info');
  });

  // Recalcula as larguras ao redimensionar a janela (muda o nº de colunas).
  window.addEventListener('resize', debounce(fillRows, 150));

  // Trocar de tema recria os gráficos com as novas cores.
  window.addEventListener('themechange', renderDashboard);
  setupSortable();
}

/** Chamado quando a tela do dashboard é mostrada. */
export function showDashboard() {
  renderDashboard();
}

