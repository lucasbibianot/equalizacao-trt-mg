import {LOWER, UPPER} from './model.mjs';

export function goalsChart(groups, {esc, percent}) {
  const plotted = groups.filter(group => Number.isFinite(group.relative));
  if (!plotted.length) return '<p class="empty">Aloque varas a um agrupamento para visualizar sua média no gráfico.</p>';
  const ordered = [...plotted].sort((a,b) => b.relative - a.relative);
  const shown = ordered;
  const minimum = Math.max(0, Math.min(.90, Math.floor(Math.min(...shown.map(group => group.relative)) * 10) / 10));
  const maximum = Math.max(1.10, Math.ceil(Math.max(...shown.map(group => group.relative)) * 10) / 10);
  const pos = value => (value - minimum) / (maximum - minimum) * 100;
  return `<div class="goal-chart" style="--l:${pos(LOWER)}%;--m:${pos(1)}%;--u:${pos(UPPER)}%">
    ${shown.map(group => `<div class="goal-row" title="${esc(group.name)} · ${percent(group.relative)}">
      <span class="goal-name">${esc(group.name)}${group.complete ? '' : ' · Em montagem'}</span><span class="goal-track" aria-hidden="true"><i class="goal-point ${group.complete ? group.status : 'pending'}" style="--point:${pos(group.relative)}%"></i></span>
      <strong>${percent(group.relative)}</strong></div>`).join('')}
    <div class="goal-row goal-axis" aria-hidden="true"><span></span><div><span>${percent(minimum)}</span><span>${percent(maximum)}</span></div><span></span></div>
  </div><p class="chart-muted">A área sombreada indica a faixa de 95% a 105% da média geral. Todos os grupos com varas são exibidos; grupos em montagem mostram sua média atual, sem indicar composição completa.</p>`;
}
