import { allocate, assignCourt, category, checkDuplicate, court, courtsByCity, createProject, demo, HEADERS, LOWER, makeCSV,
  MAX_GROUP_SIZE, MAX_GROUPS, MAX_ROWS, MIN_GROUP_SIZE, newPlan, parseCSV, propose, rateOf, searchKey, statusText, syncCourtCity,
  totals, uid, UPPER, validName, validateProject } from './model.mjs';
import { importXlsx } from './xlsx.mjs';

const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const formatters = Object.fromEntries([0,1,2,4].map(d => [d, new Intl.NumberFormat('pt-BR', {maximumFractionDigits:d})]));
const fmt = (value, digits = 1) => Number.isFinite(value) ? formatters[digits].format(value) : '—';
const percent = value => value === null ? '—' : fmt(value * 100, 2) + '%';
const points = value => value === null ? '—' : fmt(value * 100, 2) + ' p.p.';
const icon = name => `<span class="icon ico-${name}" aria-hidden="true"></span>`;
const button = (label, action, opt = {}) => `<button type="button" class="button ${opt.style ?? ''}" data-action="${action}"${opt.id ? ` data-id="${esc(opt.id)}"` : ''}${opt.ariaLabel ? ` aria-label="${esc(opt.ariaLabel)}"` : ''}${opt.disabled ? ' disabled' : ''}>${opt.icon ? icon(opt.icon) : ''}${esc(label)}</button>`;
const labels = {agrupamentos:'Agrupamentos', dados:'Base de varas', metodologia:'Metodologia'};
const view = $('#view');
const modal = $('#modal');
const storage = 'trt-mg.equalizacao.agrupamentos.1';
const maxFile = 8 * 1024 * 1024;
let state;
let saving = true;
let timer;
try {
  const saved = localStorage.getItem(storage);
  if (saved) state = validateProject(JSON.parse(saved));
} catch (error) {
  if (error.name === 'SecurityError') saving = false;
  else queueMicrotask(() => notify('A sessão anterior não pôde ser recuperada.'));
}
state ??= demo();

let page = route();
let search = '';
let cityRegion = '';
let movement = '';
let tablePage = 0;
let compareTo = '';
let report;
const template = '<a href="modelo-importacao-equalizacao-2025.xlsx" download class="button">' + icon('download') + 'Modelo Excel</a>';
const byName = (a, b) => a.localeCompare(b, 'pt-BR', {sensitivity:'base'});
const pageFoot = () => `<p class="page-foot">${saving ? 'Os dados e cenários ficam neste navegador. Baixe o projeto JSON para guardar uma cópia.' : 'O navegador não conseguiu salvar esta sessão. Baixe o projeto JSON para guardar uma cópia.'}</p>`;

function route() {
  const name = location.hash.slice(1);
  return Object.hasOwn(labels, name) ? name : 'agrupamentos';
}

function notify(message) {
  const node = $('#notice');
  clearTimeout(timer);
  node.textContent = message;
  node.classList.add('shown');
  timer = setTimeout(() => node.classList.remove('shown'), 5000);
}

function update(next, message) {
  state = next;
  try { localStorage.setItem(storage, JSON.stringify(state)); saving = true; }
  catch { saving = false; }
  if (modal.open) modal.close();
  render();
  if (message) notify(message);
}

const active = (data = state) => data.plans.find(plan => plan.id === data.active);
function editPlan(change, message) {
  const next = structuredClone(state);
  change(active(next), next);
  update(next, message);
}

function regionalGroups(rows) {
  const map = new Map();
  for (const row of rows) {
    const normalized = searchKey(row.region);
    if (!map.has(normalized)) map.set(normalized, {name:row.region, members:[]});
    map.get(normalized).members.push(row.id);
  }
  return [...map.values()].sort((a,b) => byName(a.name,b.name));
}

const th = (title, number = false) => `<th scope="col"${number ? ' class="num"' : ''}>${title}</th>`;
const num = (number, digits = 1) => `<td class="num">${fmt(number, digits)}</td>`;
function table(head, body, empty = 'Nenhum registro para exibir.') {
  return body ? `<div class="table-wrap" tabindex="0" role="region" aria-label="Tabela com rolagem horizontal"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>` : `<p class="empty">${empty}</p>`;
}

function scenarioBar() {
  return `<div class="scenario-bar"><div class="scenario-controls"><label for="plan">Cenário ativo</label>
    <select id="plan">${state.plans.map(plan => `<option value="${plan.id}"${plan.id === state.active ? ' selected' : ''}>${esc(plan.name)}</option>`).join('')}</select>
    ${button('Novo cenário','new-plan',{icon:'plus',style:'compact',disabled:state.plans.length >= 30})}
  </div><div class="context"><span class="pill ${state.type === 'demo' ? 'demo' : ''}">${state.type === 'demo' ? 'Base demonstrativa' : 'Base própria'}</span>
    ${active().cityLimit ? '<span class="pill">Varas agrupadas por cidade</span>' : ''}<span>Casos novos de conhecimento · 2025</span></div></div>`;
}

function metric(label, value, description, symbol) {
  return `<article class="metric"><div class="metric-head"><span class="metric-icon ${symbol === 'chart' ? 'green' : ''}">${icon(symbol)}</span>${label}</div>
    <strong>${esc(value)}</strong><p class="metric-foot">${esc(description)}</p></article>`;
}

function movementBadge(row) {
  const label = category(rateOf(row), report.reference.rate);
  return `<span class="pill ${label === 'Alta movimentação' ? 'high' : 'low'}">${label}</span>`;
}

function goalsChart(groups) {
  const plotted = groups.filter(group => group.complete && group.relative !== null);
  if (!plotted.length) return '<p class="empty">Complete um agrupamento para visualizar sua média no gráfico.</p>';
  const ordered = [...plotted].sort((a,b) => b.relative - a.relative);
  const shown = ordered.length > 12 ? [...ordered.slice(0,6), ...ordered.slice(-6)] : ordered;
  const minimum = Math.max(0, Math.min(.90, Math.floor(Math.min(...shown.map(group => group.relative)) * 10) / 10));
  const maximum = Math.max(1.10, Math.ceil(Math.max(...shown.map(group => group.relative)) * 10) / 10);
  const pos = value => (value - minimum) / (maximum - minimum) * 100;
  return `<div class="goal-chart" style="--l:${pos(LOWER)}%;--m:${pos(1)}%;--u:${pos(UPPER)}%">
    ${shown.map(group => `<div class="goal-row" title="${esc(group.name)} · ${percent(group.relative)}">
      <span class="goal-name">${esc(group.name)}</span><span class="goal-track" aria-hidden="true"><i class="goal-point ${group.status}" style="--point:${pos(group.relative)}%"></i></span>
      <strong>${percent(group.relative)}</strong></div>`).join('')}
    <div class="goal-row goal-axis" aria-hidden="true"><span></span><div><span>${percent(minimum)}</span><span>${percent(maximum)}</span></div><span></span></div>
  </div><p class="chart-muted">A área sombreada indica a faixa de 95% a 105% para grupos com composição completa.${shown.length !== ordered.length ? ' O gráfico exibe os seis maiores e os seis menores percentuais.' : ''}</p>`;
}

function compositionNeeds(group) {
  const needs = [];
  if (!group.high) needs.push('inclua alta movimentação');
  if (!group.low) needs.push('inclua baixa movimentação');
  const missing = group.minimum - group.rows.length;
  if (missing > 0) needs.push(`adicione ${missing} ${missing === 1 ? 'vara' : 'varas'}`);
  return needs.join(' · ');
}

function groupTable(groups, editable) {
  const head = th('Agrupamento') + th('Varas alta / baixa', true) + th('Casos novos',true) + th('Juízes',true) +
    th('Média por juiz',true) + th('% da média geral',true) + th('Faixa') + (editable ? th('Ações') : '');
  return table(head, groups.map(group => {
    const regionInfo = group.regions.length ? group.regions.join(' · ') : 'Sem varas';
    const regionNote = group.regions.length > 1 ? ' · cruza subregiões' : '';
    const locationText = group.cities.length > 0 ? `${group.cities.length} ${group.cities.length === 1 ? 'cidade' : 'cidades'}` : '';
    return `<tr><td>${esc(group.name)}<small class="cell-note">${esc(regionInfo + regionNote)}${locationText ? ' · ' + locationText : ''}</small></td>
      <td class="num">${group.high} / ${group.low}</td>${num(group.cases,0)}${num(group.judges,4)}${num(group.rate,2)}
      <td class="num">${percent(group.relative)}</td><td>${group.complete
        ? `<span class="pill ${group.status}">${statusText[group.status]}</span>`
        : `<span class="pill demo">Em montagem</span><small class="cell-note">${compositionNeeds(group)}</small>`}</td>
      ${editable ? `<td><div class="actions">
        ${button('Composição','edit-group',{id:group.id,style:'compact'})}
        ${button('Remover','delete-group',{id:group.id,style:'compact danger',ariaLabel:`Remover agrupamento ${group.name}`})}
      </div></td>` : ''}</tr>`;
  }).join(''), 'Crie um agrupamento ou gere sugestões para a base carregada.');
}

function quality(groups) {
  const occupied = groups.filter(group => group.rows.length);
  const complete = occupied.filter(group => group.complete);
  const inRange = complete.filter(group => group.status === 'inside');
  const assigned = occupied.reduce((sum, group) => sum + group.rows.length, 0);
  const measurable = complete.filter(group => group.relative !== null);
  const measured = measurable.reduce((sum, group) => sum + group.rows.length, 0);
  return {
    occupied:occupied.length,
    pending:groups.length - complete.length,
    inRange:inRange.length,
    covered:inRange.reduce((sum, group) => sum + group.rows.length, 0),
    mixed:occupied.filter(group => group.regions.length > 1).length,
    unassigned:state.rows.length - assigned,
    departure:measured ? measurable.reduce((sum, group) => sum + Math.abs(group.relative - 1) * group.rows.length, 0) / measured : null
  };
}

function comparePanel() {
  const options = state.plans.filter(plan => plan.id !== state.active);
  const selected = options.find(plan => plan.id === compareTo);
  const previousMinimum = selected?.minSize ?? active().minSize;
  const target = compareTo === 'regions' ? regionalGroups(state.rows) : selected?.groups;
  const other = target ? allocate(state.rows, target, report.reference.rate, previousMinimum) : null;
  let compared = '';
  if (other) {
    const {stats} = report;
    const previous = quality(other);
    const indicators = [
      ['Mínimo de varas por grupo', previousMinimum, active().minSize],
      ['Grupos na faixa', `${previous.inRange} de ${previous.occupied}`, `${stats.inRange} de ${stats.occupied}`],
      ['Varas em grupos na faixa', previous.covered, stats.covered],
      ['Grupos em montagem', previous.pending, stats.pending],
      ['Grupos que cruzam subregiões', previous.mixed, stats.mixed],
      ['Varas sem grupo', previous.unassigned, stats.unassigned],
      ['Distância média de 100%', points(previous.departure), points(stats.departure)]
    ];
    const head = th('Indicador') + th('Referência',true) + th('Cenário ativo',true);
    compared = table(head, indicators.map(([text,before,after]) => `<tr><td>${text}</td><td class="num">${before}</td><td class="num">${after}</td></tr>`).join(''))
      + `<div class="section-gap">${groupTable(other,false)}</div>`;
  }
  return `<section class="panel section-gap"><div class="panel-head"><div><h2>Comparar agrupamentos</h2><p>Compare o cenário ativo com as subregiões ou com outro cenário salvo.</p></div>
    <label class="field-stack">Referência da comparação<select id="compare"><option value="">Selecionar referência</option>
      <option value="regions"${compareTo === 'regions' ? ' selected' : ''}>Subregiões da base</option>
      ${options.map(plan => `<option value="${plan.id}"${compareTo === plan.id ? ' selected' : ''}>${esc(plan.name)}</option>`).join('')}</select></label>
    </div>${compared}</section>`;
}

function dashboard() {
  const {reference, groups, stats} = report;
  const cityLimit = active().cityLimit;
  const aboveLimit = cityLimit ? [...courtsByCity(state.rows).values()].filter(block => block.length > cityLimit) : [];
  const high = state.rows.filter(row => category(rateOf(row), reference.rate) === 'Alta movimentação').length;
  const overLimit = groups.length > MAX_GROUPS;
  const groupCount = overLimit ? `${groups.length} agrupamentos · limite de ${MAX_GROUPS}` : `${groups.length} de ${MAX_GROUPS} agrupamentos`;
  return `<section class="hero">
    <div><div class="eyebrow">Primeiro grau · Base de 2025</div><h1>Equalização por agrupamentos</h1>
    <p>Equilibre a movimentação por juiz e reduza cruzamentos entre subregiões.</p></div>
    ${button('Sugerir agrupamentos','suggest',{icon:'plus',disabled:state.rows.length < 2})}
  </section>${scenarioBar()}
  ${state.rows.length ? `<div class="cards group-metrics" aria-label="Indicadores">
    ${metric('Média geral por juiz',fmt(reference.rate,2),`${fmt(reference.cases,0)} casos · ${fmt(reference.judges,4)} juízes`,'chart')}
    ${metric('Faixa de referência',`${fmt(reference.rate * LOWER,2)} a ${fmt(reference.rate * UPPER,2)}`,'95% a 105% da média geral','bars')}
    ${metric('Grupos dentro da faixa',`${stats.inRange} de ${stats.occupied}`,`${stats.covered} ${stats.covered === 1 ? 'vara' : 'varas'} na faixa · ${stats.unassigned} sem grupo`,'grid')}
    ${metric('Alta / baixa movimentação',`${high} / ${state.rows.length-high}`,`${state.rows.length} varas na base`,'data')}
  </div>
  <section class="panel"><div class="panel-head"><div><h2>Média dos agrupamentos</h2><p>Percentual da média geral por juiz · Mínimo de ${active().minSize} varas por grupo</p></div>
    <div class="actions"><span class="pill ${overLimit ? 'above' : ''}">${groupCount}</span>${button('Criar agrupamento','new-group',{icon:'plus',style:'primary',disabled:groups.length >= MAX_GROUPS})}</div></div>
    ${overLimit ? `<p class="chart-muted">Remova agrupamentos ou gere uma nova sugestão para adequar este cenário ao limite de ${MAX_GROUPS}.</p>` : ''}
    ${goalsChart(groups)}
    ${stats.occupied || stats.pending ? `<p class="chart-muted">${stats.mixed} ${stats.mixed === 1 ? 'grupo cruza' : 'grupos cruzam'} subregiões${stats.pending ? ` · ${stats.pending} em montagem` : ''}${stats.departure === null ? '' : ' · Distância média até 100% de ' + points(stats.departure)}</p>` : ''}
    <div class="section-gap">${groupTable(groups,true)}</div>
  </section>
  ${comparePanel()}
  <section class="panel section-gap"><div class="panel-head"><div><h2>Alocação das varas</h2><p>Revise a composição de cada grupo por cidade sede, subregião e categoria.</p></div></div>
    ${cityLimit ? `<p class="chart-muted city-note">Ao alterar a alocação de uma vara, todas as varas da mesma cidade mudam juntas. O limite é de ${cityLimit} varas por grupo.</p>` : ''}
    ${aboveLimit.length ? `<p class="chart-muted city-note">O limite deixou sem grupo todas as varas de ${esc(aboveLimit.slice(0, 4).map(block => `${block[0].city} (${block.length})`).join(', '))}${aboveLimit.length > 4 ? ` e de mais ${aboveLimit.length - 4} cidades` : ''}.</p>` : ''}
    ${filters()}<div id="table-zone"></div></section>
  <section class="panel section-gap"><div class="panel-head"><div><h2>Gerenciar cenário</h2></div></div>
    <div class="actions">${button('Renomear cenário','rename-plan')}${button('Duplicar cenário','copy-plan',{disabled:state.plans.length >= 30 || overLimit})}
    ${button('Excluir cenário','delete-plan',{style:'danger',disabled:state.plans.length < 2})}</div></section>`
    : `<section class="panel"><div class="panel-head"><div><h2>Carregue a base de varas</h2><p>Informe os casos novos de conhecimento de 2025 e a quantidade de juízes.</p></div></div>
      <div class="actions">${button('Importar planilha','import',{style:'primary',icon:'upload'})}${template}
      ${button('Cadastrar vara','add-row',{icon:'plus'})}${button('Carregar demonstração','demo')}</div></section>`}
    ${pageFoot()}`;
}

function filters() {
  const regions = regionalGroups(state.rows);
  return `<div class="filters"><input id="search" type="search" aria-label="Buscar vara, cidade ou subregião" placeholder="Buscar vara, cidade ou subregião" value="${esc(search)}">
    <select id="region" aria-label="Filtrar subregião"><option value="">Todas as subregiões</option>
    ${regions.map(region => `<option value="${esc(searchKey(region.name))}"${cityRegion === searchKey(region.name) ? ' selected' : ''}>${esc(region.name)}</option>`).join('')}</select>
    <select id="movement" aria-label="Filtrar movimentação"><option value="">Toda movimentação</option>
      ${['Alta movimentação','Baixa movimentação'].map(value => `<option${movement === value ? ' selected' : ''}>${value}</option>`).join('')}
    </select></div>`;
}

function rowTable() {
  const managing = page === 'agrupamentos';
  const query = searchKey(search);
  const visible = state.rows.filter(row =>
    [row.name,row.city,row.region].some(value => searchKey(value).includes(query)) &&
    (!cityRegion || cityRegion === searchKey(row.region)) &&
    (!movement || movement === category(rateOf(row),report.reference.rate)))
    .sort((a,b) => byName(a.region,b.region) || byName(a.city,b.city) || byName(a.name,b.name));
  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  tablePage = Math.min(tablePage, pages - 1);
  const start = tablePage * pageSize;
  const end = Math.min(start + pageSize, visible.length);
  const pager = visible.length ? `<div class="pager"><span>Exibindo ${start+1}–${end} de ${fmt(visible.length,0)}</span>${pages > 1 ?
    `<div class="actions">${button('Anterior','prev',{disabled:!tablePage})}${button('Próxima','next',{disabled:tablePage >= pages-1})}</div>` : ''}</div>` : '';
  const places = active().groups;
  const head = th('Vara') + th('Cidade sede') + th('Subregião') + th('Casos novos 2025',true) + th('Juízes',true) +
    th('Média por juiz',true) + th('Categoria') + th(managing ? 'Agrupamento' : 'Ações');
  const body = visible.slice(start,end).map(row => {
    const current = report.assignment.get(row.id);
    const assign = places.length ? `<select class="group-select" data-court="${row.id}" aria-label="${esc('Agrupamento de ' + row.name)}">
      <option value="">Sem grupo</option>${places.map(g => `<option value="${g.id}"${current?.id === g.id ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</select>` : 'Sem grupo';
    return `<tr><td>${esc(row.name)}</td><td>${esc(row.city)}</td><td>${esc(row.region)}</td>${num(row.cases,0)}${num(row.judges,4)}
      ${num(rateOf(row),2)}<td>${movementBadge(row)}</td><td>${managing ? assign : button('Editar','edit-row',{id:row.id,style:'compact'})}</td></tr>`;
  }).join('');
  return table(head, body, state.rows.length ? 'Nenhuma vara corresponde aos filtros.' : 'A base está vazia.') + pager;
}

function dataPage() {
  return `<div class="page-head"><div><h1>Base de varas</h1><p>Casos novos em conhecimento e capacidade de 2025.</p></div>
    ${button('Cadastrar vara','add-row',{style:'primary',icon:'plus',disabled:state.rows.length >= MAX_ROWS})}</div>
    <section class="panel"><div class="panel-head"><div><h2>Registros da base</h2><p>${fmt(state.rows.length,0)} varas · ${fmt(regionalGroups(state.rows).length,0)} subregiões</p></div>
      <div class="actions">${template}${button('Importar planilha','import',{icon:'upload'})}</div></div>
      ${filters()}<div id="table-zone"></div></section>
    <section class="panel section-gap"><div class="panel-head"><div><h2>Arquivo do projeto</h2><p>Guarde ou reabra a base e seus cenários de agrupamento.</p></div></div>
      <div class="actions">${button('Baixar projeto JSON','backup',{icon:'download'})}${button('Abrir projeto JSON','restore',{icon:'upload'})}
        ${button('Começar com base vazia','empty')}${button('Carregar demonstração','demo')}</div></section>${pageFoot()}`;
}

function methodologyPage() {
  return `<div class="page-head"><div><h1>Metodologia</h1><p>Referência de carga, classificação e critérios territoriais.</p></div>${template}</div>
    <div class="grid-two">
      <section class="panel method"><h2>Média geral e média do grupo</h2>
        <span class="formula">Média por juiz = soma dos casos novos ÷ soma dos juízes</span>
        <p>A média geral considera todas as varas da base carregada. Para cada grupo, a fórmula usa apenas as varas alocadas. A média de uma vara é calculada com os valores de sua própria linha.</p>
        <h3>Faixa de 95% a 105%</h3><p>O grupo está na faixa quando sua média é maior ou igual a 95% e menor ou igual a 105% da média geral. Os limites são aplicados antes do arredondamento visual.</p></section>
      <section class="panel method"><h2>Duas categorias de movimentação</h2>
        <p>Alta movimentação inclui varas com casos por juiz iguais ou superiores à média geral. Baixa movimentação inclui as varas abaixo dela. A categoria usa os valores da base, com a mesma referência em todos os cenários.</p>
        <h3>Composição</h3><p>Cada agrupamento precisa de pelo menos uma vara de alta e uma de baixa movimentação. Informe o mínimo de varas ao gerar sugestões. Os grupos montados manualmente ficam em montagem até cumprir os dois critérios.</p></section>
      <section class="panel method"><h2>Distribuição geográfica</h2>
        <p>A busca avalia combinações com até ${MAX_GROUPS} grupos e o máximo de varas por grupo que você informar. Só aceita cruzamentos quando eles aumentam o número de varas em grupos dentro da faixa, em relação à melhor sugestão encontrada com uma subregião por grupo.</p>
        <h3>Como a busca decide</h3><p>Com a mesma cobertura na faixa, as sugestões priorizam menos subregiões por grupo, menos varas fora da subregião predominante e a alocação de mais varas. Em seguida, buscam aproximar as médias de 100%. O desvio médio é ponderado pelo número de varas de cada grupo.</p>
        <h3>Varas da mesma cidade</h3><p>Com a opção marcada, cada cidade sede é tratada como um bloco na sugestão e nas alterações manuais do cenário. Se a cidade tiver mais varas que o limite por grupo, todas ficam sem grupo. Com uma única subregião por grupo, o mesmo vale para cidades cadastradas em mais de uma subregião.</p>
        <h3>Revisão dos grupos</h3><p>A busca testa alternativas e ajustes de composição. As varas sem grupo e os cruzamentos ficam sinalizados para revisão. Você também pode gerar sugestões com uma única subregião por grupo.</p></section>
      <section class="panel method"><h2>Base de importação</h2>
        <p>Informe uma linha por vara com nome, cidade sede, subregião, casos novos de conhecimento de 2025 e quantidade de juízes. Use a mesma base de capacidade para todas as varas. A quantidade deve ser positiva e aceita frações.</p>
        <h3>Coluna Média por juiz</h3><p>O Excel calcula a coluna a partir dos casos novos e da quantidade de juízes. O simulador recalcula o valor na importação. São aceitos arquivos XLSX e CSV UTF-8.</p></section>
    </div>${pageFoot()}`;
}

function render() {
  const reference = totals(state.rows);
  const groups = allocate(state.rows, active().groups, reference.rate, active().minSize);
  const assignment = new Map(groups.flatMap(group => group.members.map(id => [id, group])));
  report = {reference, groups, assignment, stats:quality(groups)};
  $('#crumb').textContent = labels[page];
  $('.export-button').disabled = !state.rows.length;
  for (const link of document.querySelectorAll('.navigation a')) {
    if (link.dataset.page === page) link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  }
  view.innerHTML = {agrupamentos:dashboard,dados:dataPage,metodologia:methodologyPage}[page]();
  renderTable();
}
function renderTable() {
  const zone = $('#table-zone');
  if (zone) zone.innerHTML = rowTable();
}

function openForm(title, intro, body, submitLabel, submit, extra = '') {
  $('#dialog-title').textContent = title;
  $('#dialog-body').innerHTML = `${intro ? `<p class="dialog-help">${intro}</p>` : ''}
    <form id="dialog-form"><div class="form-grid">${body}</div><p class="inline-error" role="alert" hidden></p>
    <div class="form-actions">${extra}${button('Cancelar','close')}<button class="button primary" type="submit">${esc(submitLabel)}</button></div></form>`;
  const form = $('#dialog-form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const error = $('.inline-error',form);
    const control = $('button[type=submit]',form);
    error.hidden = true;
    control.disabled = true;
    try { await submit(Object.fromEntries(new FormData(form)), form); }
    catch (issue) { error.textContent = issue.message; error.hidden = false; }
    finally { control.disabled = false; }
  });
  if (!modal.open) modal.showModal();
  $('input, select, textarea, button[type=submit]',form)?.focus();
}

const input = (label, name, value = '', options = '') =>
  `<label>${label}<input name="${name}" value="${esc(value)}" ${options}></label>`;

function rowForm(id) {
  const row = state.rows.find(item => item.id === id);
  const choose = (field, name) => `<datalist id="${name}">${[...new Set(state.rows.map(item => item[field]))]
    .sort(byName).map(value => `<option value="${esc(value)}"></option>`).join('')}</datalist>`;
  openForm(row ? 'Editar vara' : 'Cadastrar vara', 'Informe os casos novos de conhecimento de 2025 e a quantidade de juízes.',
    input('Vara','name',row?.name,'maxlength="140" required') + input('Cidade sede','city',row?.city,'maxlength="140" required list="cities"') +
    input('Subregião','region',row?.region,'maxlength="140" required list="regions"') +
    input('Qtde casos novos 2025','cases',row?.cases,'inputmode="numeric" required') +
    input('Qtde juízes','judges',row?.judges?.toString().replace('.', ','),'inputmode="decimal" required') + choose('city','cities') + choose('region','regions'),
    'Salvar vara', data => {
      const item = court({...data,id});
      checkDuplicate(item,state.rows);
      const rows = row ? state.rows.map(other => other.id === id ? item : other) : [...state.rows,item];
      const plans = structuredClone(state.plans);
      for (const plan of plans) {
        try { syncCourtCity(plan, rows, row, item); }
        catch (error) { throw new Error(`Cenário “${plan.name}”. ${error.message}`); }
      }
      update({...state,rows,plans}, 'Vara salva na base.');
    }, row ? button('Excluir vara','delete-row',{id,style:'danger push'}) : '');
}

function removeRow(id) {
  const row = state.rows.find(item => item.id === id);
  openForm('Excluir vara', `Remover “${esc(row.name)}” da base e de todos os agrupamentos em que aparece.`, '',
    'Excluir vara', () => {
      const next = structuredClone(state);
      next.rows = next.rows.filter(item => item.id !== id);
      for (const plan of next.plans) for (const group of plan.groups) group.members = group.members.filter(member => member !== id);
      update(next,'Vara removida.');
    });
}

function groupForm(id) {
  const group = report.groups.find(item => item.id === id);
  if (!group && report.groups.length >= MAX_GROUPS) return;
  const body = input('Nome do agrupamento','name',group?.name,'required maxlength="140"') +
    (group?.rows.length ? `<ul class="member-list full">${group.rows.map(row =>
      `<li><strong>${esc(row.name)}</strong> <span>${esc(row.city)} · ${esc(row.region)} · ${fmt(rateOf(row),2)} por juiz</span></li>`).join('')}</ul>` : '');
  openForm(group ? 'Composição do agrupamento' : 'Criar agrupamento',
    'Use a tabela Alocação das varas para incluir, mover ou retirar varas do grupo.',
    body, 'Salvar agrupamento', ({name}) => {
      editPlan(plan => {
        name = validName(name,'Nome do agrupamento');
        if (plan.groups.some(item => item.id !== id && searchKey(item.name) === searchKey(name))) throw new Error('Já existe um agrupamento com esse nome neste cenário.');
        if (group) plan.groups.find(item => item.id === id).name = name;
        else plan.groups.push({id:uid(),name,members:[]});
      }, 'Agrupamento salvo.');
    }, group ? button('Remover agrupamento','delete-group',{id,style:'danger push'}) : '');
}
function removeGroup(id) {
  const group = active().groups.find(item => item.id === id);
  const effects = group.members.length ? ' As varas ficarão sem grupo neste cenário e poderão ser alocadas novamente.' : '';
  openForm('Remover agrupamento', `O agrupamento “${esc(group.name)}” será removido do cenário ativo.${effects}`, '',
    'Remover agrupamento', () => {
      editPlan(plan => {
        plan.groups = plan.groups.filter(item => item.id !== id);
      }, 'Agrupamento removido.');
      $('[data-action="new-group"]')?.focus({preventScroll:true});
    });
  $('#dialog-form [data-action="close"]')?.focus();
}

function suggest() {
  const intro = `Cada grupo precisa reunir varas de alta e de baixa movimentação. A busca sugere até ${MAX_GROUPS} grupos e prioriza médias na faixa de 95% a 105% da média geral.` +
    (active().groups.length ? ' Ao gerar, você substitui a composição do cenário ativo.' : '');
  const minimumField = input('Mínimo de varas por agrupamento','minimum',active().minSize,
    `type="number" min="${MIN_GROUP_SIZE}" max="${MAX_GROUP_SIZE}" required`);
  const maximumField = input('Máximo de varas por grupo','maximum',active().maxSize,
    `type="number" min="${MIN_GROUP_SIZE}" max="${MAX_GROUP_SIZE}" required`);
  const territoryField = `<label class="full">Cruzamento entre subregiões<select name="territory">
    <option value="improve">Quando colocar mais varas na faixa</option>
    <option value="single">Uma única subregião por grupo</option>
  </select></label>`;
  const cityField = `<label class="full checkbox-field"><input type="checkbox" name="keepCityTogether"
    aria-describedby="city-help"${active().cityLimit ? ' checked' : ''}> Manter juntas as varas da mesma cidade</label>
    <p class="form-note full" id="city-help">Cada cidade inteira fica no mesmo agrupamento ou sem grupo.</p>`;
  openForm('Sugerir agrupamentos', intro, minimumField + maximumField + territoryField + cityField,
    'Gerar sugestões', ({minimum,maximum,territory,keepCityTogether}) => {
      const allowMix = territory === 'improve';
      const limit = Number(maximum);
      const lower = Number(minimum);
      const lockCity = keepCityTogether === 'on';
      const groups = propose(state.rows,report.reference.rate,limit,{allowMix,keepCityTogether:lockCity,minimum:lower});
      const message = groups.length ? `${groups.length} ${groups.length === 1 ? 'agrupamento sugerido' : 'agrupamentos sugeridos'}.`
        : 'Todas as varas ficaram sem grupo com o mínimo, a composição e os critérios geográficos escolhidos.';
      editPlan(plan => {
        plan.groups = groups;
        plan.cityLimit = lockCity ? limit : null;
        plan.minSize = lower;
        plan.maxSize = limit;
      }, message);
    });
}

function planForm(mode) {
  const current = active();
  const rename = mode === 'rename';
  const copy = mode === 'copy';
  if (copy && current.groups.length > MAX_GROUPS) return;
  const label = rename ? 'Renomear cenário' : copy ? 'Duplicar cenário' : 'Novo cenário';
  const name = rename ? current.name : copy ? current.name.slice(0,130) + ' (cópia)' : '';
  openForm(label, copy ? 'O novo cenário começa com a composição do cenário ativo.' :
    rename ? '' : 'O cenário usa a mesma base de varas e começa sem agrupamentos.', input('Nome do cenário','name',name,'required maxlength="140"'),
    'Salvar cenário', data => {
      const next = structuredClone(state);
      const name = validName(data.name,'Nome do cenário');
      if (next.plans.some(plan => (!rename || plan.id !== current.id) && searchKey(plan.name) === searchKey(name))) throw new Error('Já existe um cenário com esse nome.');
      if (rename) active(next).name = name;
      else {
        const plan = newPlan(name);
        if (copy) {
          plan.groups = structuredClone(current.groups);
          plan.cityLimit = current.cityLimit;
          plan.minSize = current.minSize;
          plan.maxSize = current.maxSize;
        }
        next.plans.push(plan);
        next.active = plan.id;
      }
      update(next,'Cenário salvo.');
    });
}
function removePlan() {
  if (state.plans.length < 2) return;
  openForm('Excluir cenário', `Remover “${esc(active().name)}” e seus agrupamentos.`, '',
    'Excluir cenário', () => {
      const plans = state.plans.filter(plan => plan.id !== state.active);
      update({...state,plans,active:plans[0].id},'Cenário removido.');
    });
}

function resetTransient() {
  search = '';
  cityRegion = '';
  movement = '';
  tablePage = 0;
  compareTo = '';
}

async function fileBytes(file) {
  if (!file?.size) throw new Error('Escolha um arquivo com conteúdo.');
  if (file.size > maxFile) throw new Error('O arquivo excede 8 MB.');
  return file.arrayBuffer();
}
function decodeText(bytes) {
  try { return new TextDecoder('utf-8',{fatal:true}).decode(bytes); }
  catch { throw new Error('Salve o arquivo de texto com codificação UTF-8.'); }
}
function importForm() {
  openForm('Importar base de varas',
    'Escolha o Excel (.xlsx) ou um CSV UTF-8. A importação substitui a base e os cenários atuais.',
    `<label class="full">Arquivo de importação<input name="file" type="file" accept=".xlsx,.csv,.tsv,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
    <label class="full">Ou cole um CSV com cabeçalho<textarea name="paste" placeholder="${HEADERS.join(';')}"></textarea></label>`,
    'Importar base', async ({file,paste},form) => {
      const text = paste.trim();
      if (file?.size && text) throw new Error('Escolha uma única origem para a importação.');
      if (text.length > maxFile) throw new Error('Os dados colados excedem 8 MB.');
      let rows;
      if (text) rows = parseCSV(text);
      else {
        const bytes = await fileBytes(file);
        rows = /\.xlsx$/i.test(file.name) ? await importXlsx(bytes) : parseCSV(decodeText(bytes));
      }
      if (!form.isConnected || !modal.open) return;
      resetTransient();
      update(createProject(rows), `${rows.length} ${rows.length === 1 ? 'vara importada' : 'varas importadas'}.`);
      location.hash = 'dados';
    }, '<div class="push">' + template + '</div>');
}

function restoreForm() {
  openForm('Abrir projeto JSON', 'O arquivo substitui a base e os cenários da sessão.',
    '<label class="full">Arquivo do projeto<input name="file" type="file" accept=".json,application/json" required></label>',
    'Abrir projeto', async ({file},form) => {
      const source = decodeText(await fileBytes(file));
      let data;
      try { data = JSON.parse(source); }
      catch { throw new Error('O arquivo JSON é inválido.'); }
      if (!form.isConnected || !modal.open) return;
      const next = validateProject(data);
      resetTransient();
      update(next,'Projeto restaurado.');
    });
}
function replaceForm(usingDemo) {
  openForm(usingDemo ? 'Carregar demonstração' : 'Começar com base vazia',
    usingDemo ? 'Substitua a sessão atual por uma base com dados e nomes fictícios.' : 'Remova a base e os cenários da sessão atual.',
    '', usingDemo ? 'Carregar demonstração' : 'Criar base vazia', () => {
      resetTransient();
      update(usingDemo ? demo() : createProject(),usingDemo ? 'Demonstração carregada.' : 'Base vazia criada.');
    },button('Baixar projeto atual','backup',{style:'push'}));
}

function download(name, body, type) {
  const url = URL.createObjectURL(new Blob([body],{type}));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
function exportResults() {
  const headline = [...HEADERS,'Categoria','Cenário','Agrupamento','Média do grupo','% da média geral','Faixa do grupo','Média geral','Origem da base','Composição do grupo'];
  const rows = state.rows.map(row => {
    const group = report.assignment.get(row.id);
    const rate = rateOf(row);
    return [row.name,row.city,row.region,row.cases,row.judges,rate,category(rate,report.reference.rate),active().name,
      group?.name ?? 'Sem grupo',group?.rate,group?.relative == null ? '' : group.relative * 100,group ? statusText[group.status] : '',
      report.reference.rate,state.type === 'demo' ? 'Demonstrativa' : 'Própria',group ? group.complete ? 'Completa' : 'Em montagem' : ''];
  });
  download('agrupamentos-equalizacao-2025.csv',makeCSV([headline,...rows]),'text/csv;charset=utf-8');
  notify('Resultados exportados.');
}

const actions = {
  import: importForm, restore: restoreForm, export: exportResults, suggest,
  backup: () => download('projeto-agrupamentos.json',JSON.stringify(state,null,2),'application/json'),
  empty: () => replaceForm(false), demo: () => replaceForm(true), close: () => modal.close(),
  'add-row': () => rowForm(), 'edit-row':rowForm, 'delete-row':removeRow,
  'new-plan': () => planForm('new'), 'copy-plan': () => planForm('copy'), 'rename-plan': () => planForm('rename'),
  'delete-plan':removePlan, 'new-group':() => groupForm(), 'edit-group':groupForm, 'delete-group':removeGroup,
  prev: () => { tablePage--; renderTable(); $('.pager button:not([disabled])')?.focus(); },
  next: () => { tablePage++; renderTable(); $('.pager button:not([disabled])')?.focus(); }
};

document.addEventListener('click', event => {
  const control = event.target.closest('[data-action]');
  if (!control || control.disabled) return;
  try { actions[control.dataset.action]?.(control.dataset.id); }
  catch (error) { notify(error.message); }
});
document.addEventListener('input', event => {
  if (event.target.id !== 'search') return;
  search = event.target.value;
  tablePage = 0;
  renderTable();
});
document.addEventListener('change', event => {
  const {id,value,dataset} = event.target;
  if (id === 'plan') {
    if (compareTo === value) compareTo = '';
    update({...state,active:value});
    $('#plan')?.focus();
  } else if (id === 'compare') {
    compareTo = value;
    render();
    $('#compare')?.focus();
  } else if (id === 'region' || id === 'movement') {
    if (id === 'region') cityRegion = value;
    else movement = value;
    tablePage = 0;
    renderTable();
  } else if (dataset.court) {
    const courtId = dataset.court;
    const subject = active().cityLimit ? 'Cidade' : 'Vara';
    try {
      editPlan(plan => assignCourt(plan, state.rows, courtId, value),
        `${subject} ${value ? 'alocada ao agrupamento.' : 'retirada do agrupamento.'}`);
    } catch (error) {
      event.target.value = report.assignment.get(courtId)?.id ?? '';
      notify(error.message);
    }
    $(`[data-court="${courtId}"]`)?.focus();
  }
});
window.addEventListener('hashchange', () => {
  const next = route();
  if (next === page) return;
  page = next;
  search = cityRegion = movement = '';
  tablePage = 0;
  render();
  $('#main').focus({preventScroll:true});
  window.scrollTo(0,0);
});

render();
