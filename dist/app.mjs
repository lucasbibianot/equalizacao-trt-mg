import {goalsChart} from './goals-chart.mjs';
import { regionNames } from './municipal-regions-mg.mjs';
import { generatePdfFile } from './pdf-client.mjs';
import { runSuggestion } from './suggestion-client.mjs';
import { geographicStats, neighborhoodStats, locateCity, distanceKm, geographicRegionForCity } from './geography.mjs';
import { allocate, assignCourt, recommendedGroups, category, checkDuplicate, court, courtExportValues, courtsByCity, createProject, demo, HEADERS, LOWER, makeCSV,
  MAX_GROUP_SIZE, MAX_GROUPS, MAX_GROUP_COUNT, MAX_ROWS, MIN_GROUP_SIZE, newPlan, parseCSV, rateOf, searchKey, statusText, syncCourtCity,
  totals, uid, UPPER, validName, validateProject } from './model.mjs';
import { supabase } from './supabase.mjs';
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
const labels = {agrupamentos:'Agrupamentos', dados:'Base de varas', metodologia:'Metodologia', usuarios:'Usuários'};
const view = $('#view');
const modal = $('#modal');
const storage = 'trt-mg.equalizacao.agrupamentos.1';
const maxFile = 8 * 1024 * 1024;
let state;
let revision;
let profile;
let members = [];
let localProject;
let saving = false;
let generatingPdf = false;
let timer;
let page = 'agrupamentos';

let search = '';
let cityRegion = '';
let movement = '';
let assignmentFilter = '';
let tablePage = 0;
let compareTo = '';
let report;
const template = '<a href="modelo-importacao-equalizacao-2025.xlsx" download class="button">' + icon('download') + 'Modelo Excel</a>';
const byName = (a, b) => a.localeCompare(b, 'pt-BR', {sensitivity:'base'});
const pageFoot = () => `<p class="page-foot">Os dados e cenários são compartilhados entre os usuários cadastrados.</p>`;

function route() {
  const name = location.hash.slice(1);
  return Object.hasOwn(labels, name) && (name !== 'usuarios' || profile?.can_manage_users) ? name : 'agrupamentos';
}

function notify(message) {
  const node = $('#notice');
  clearTimeout(timer);
  node.textContent = message;
  node.classList.add('shown');
  timer = setTimeout(() => node.classList.remove('shown'), 5000);
}

async function update(next, message) {
  if (!profile?.can_edit) throw new Error('Seu perfil tem acesso somente para consulta.');
  if (saving) throw new Error('Aguarde o salvamento em andamento.');
  next = validateProject(next);
  saving = true;
  try {
    const { data, error } = await supabase.from('equalizacao_project')
      .update({ payload: next, revision: revision + 1 })
      .eq('id', true).eq('revision', revision).select('revision').maybeSingle();
    if (error) throw new Error('Não foi possível salvar. Tente novamente.');
    if (!data) throw new Error('O projeto foi atualizado por outro usuário ou seu acesso mudou. Recarregue a página antes de editar.');
    state = next;
    revision = data.revision;
    if (modal.open) modal.close();
    render();
    if (message) notify(message);
  } finally {
    saving = false;
  }
}

const active = (data = state) => data.plans.find(plan => plan.id === data.active);
const groupLimit = (plan = active()) => plan.maxGroups ?? MAX_GROUPS;
function editPlan(change, message) {
  const next = structuredClone(state);
  change(active(next), next);
  return update(next, message);
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
    ${active().geography === 'distance' ? `<span class="pill">Proximidade: ${fmt(active().proximityLimitKm ?? active().distanceLimitKm)} km · mín. ${active().minNearbyCities ?? 1} vizinha(s) · teto: ${fmt(active().distanceLimitKm)} km</span>` : ''}
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
    th('Média por juiz',true) + th('% da média geral',true) + th('Faixa') + '<th class="distance-cell">Distância média / máxima</th>' + (editable ? th('Ações') : '');
  return table(head, groups.map(group => {
    const geo = geographicStats(group.rows);
    const network = editable && active().geography === 'distance' ? neighborhoodStats(group.rows,active().proximityLimitKm ?? active().distanceLimitKm) : null;
    const neighborNote = network && geo.cities > 1 ? ` · mínimo observado: ${network.minimumNearby ?? '—'} vizinha(s) por cidade · ${network.connected ? 'conectado' : 'desconectado'}` : '';
    const geoNote = geo.missing.length ? 'Coordenadas ausentes: ' + geo.missing.join(', ') : geo.cities === 1 ? 'Uma única cidade' : `${geo.pairs} ${geo.pairs === 1 ? 'par' : 'pares'} de cidades`;
    const regionInfo = group.regions.length ? group.regions.join(' · ') : 'Sem varas';
    const regionNote = group.regions.length > 1 ? ' · cruza subregiões' : '';
    const locationText = group.cities.length > 0 ? `${group.cities.length} ${group.cities.length === 1 ? 'cidade' : 'cidades'}` : '';
    return `<tr><td>${esc(group.name)}<small class="cell-note">${esc(regionInfo + regionNote)}${locationText ? ' · ' + locationText : ''}</small></td>
      <td class="num">${group.high} / ${group.low}</td>${num(group.cases,0)}${num(group.judges,4)}${num(group.rate,2)}
      <td class="num">${percent(group.relative)}</td><td>${group.complete
        ? `<span class="pill ${group.status}">${statusText[group.status]}</span>`
        : `<span class="pill demo">Em montagem</span><small class="cell-note">${compositionNeeds(group)}</small>`}</td>
      <td class="num distance-cell"><span class="distance-values">${geo.mean === null ? '—' : fmt(geo.mean) + ' km'} / ${geo.maximum === null ? '—' : fmt(geo.maximum) + ' km'}</span><small class="cell-note">${esc(geoNote + neighborNote)}${group.manualGeography ? ' · Ajuste manual: regras geográficas dispensadas' : ''}${group.manualSize ? ' · Ajuste manual: máximo de varas dispensado' : ''}</small></td>
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

function regionalDistances() {
  const regions = new Map();
  for (const row of state.rows) {
    const id = searchKey(row.region);
    if (!regions.has(id)) regions.set(id, {name:row.region, rows:[]});
    regions.get(id).rows.push(row);
  }
  const body = [...regions.values()].sort((a,b) => byName(a.name,b.name)).map(region => {
    const stats = geographicStats(region.rows);
    const note = stats.missing.length ? `Parcial: sem coordenadas para ${stats.missing.join(', ')}`
      : stats.cities === 1 ? 'Uma única cidade: sem pares para calcular a média' : `${stats.pairs} ${stats.pairs === 1 ? 'par' : 'pares'} de cidades`;
    return `<tr><td>${esc(region.name)}<small class="cell-note">${esc(note)}</small></td>${num(stats.cities,0)}${num(stats.located,0)}
      <td class="num">${stats.mean === null ? '—' : fmt(stats.mean) + ' km'}</td><td class="num">${stats.maximum === null ? '—' : fmt(stats.maximum) + ' km'}</td></tr>`;
  }).join('');
  const missing = [...courtsByCity(state.rows).values()].filter(block => !locateCity(block[0].city)).map(block => block[0].city);
  const isolated = active().geography === 'distance' ? [...courtsByCity(state.rows).values()].filter(block => {
    const city = locateCity(block[0].city);
    return city && !state.rows.some(row => searchKey(row.city) !== searchKey(block[0].city) && locateCity(row.city) && distanceKm(city,locateCity(row.city)) <= (active().proximityLimitKm ?? active().distanceLimitKm) + 1e-9);
  }).map(block => block[0].city) : [];
  return `<section class="panel section-gap"><div class="panel-head"><div><h2>Distâncias entre cidades por sub-região</h2>
    <p>Referência para escolher o limiar: média simples de todos os pares de cidades distintas, sem ponderação pelo número de varas.</p></div></div>
    ${table(th('Sub-região') + th('Cidades',true) + th('Com coordenadas',true) + th('Distância média',true) + th('Distância máxima',true),body)}
    <p class="chart-muted">Distâncias em linha reta entre sedes municipais, em km. A distância máxima indica o limiar necessário para reunir toda a sub-região, sujeito aos demais critérios. Não representa trajeto rodoviário.</p>
    ${missing.length ? `<p class="chart-muted">Sem coordenadas: ${esc(missing.join(', '))}. Essas cidades ficam sem agrupamento na sugestão por distância. Confira os nomes cadastrados. Médias parciais consideram somente os pares conhecidos.</p>` : ''}
    ${isolated.length ? `<p class="chart-muted">Sem outra cidade dentro de ${fmt(active().proximityLimitKm ?? active().distanceLimitKm)} km: ${esc(isolated.join(', '))}. As varas da própria cidade ainda podem formar um grupo se atenderem aos demais critérios.</p>` : ''}
    </section>`;
}

function dashboard() {
  const {reference, groups, stats} = report;
  const cityLimit = active().cityLimit;
  const aboveLimit = cityLimit ? [...courtsByCity(state.rows).values()].filter(block => block.length > cityLimit) : [];
  const high = state.rows.filter(row => category(rateOf(row), reference.rate) === 'Alta movimentação').length;
  const maxGroups = groupLimit();
  const overLimit = groups.length > maxGroups;
  const groupCount = overLimit ? `${groups.length} agrupamentos · limite de ${maxGroups}` : `${groups.length} de ${maxGroups} agrupamentos`;
  return `<section class="hero">
    <div><div class="eyebrow">Primeiro grau · Base de 2025</div><h1>Equalização por agrupamentos</h1>
    <p>Explore agrupamentos por sub-região ou proximidade geográfica para equilibrar a movimentação por juiz.</p></div>
    ${button('Sugerir agrupamentos','suggest',{icon:'plus',disabled:state.rows.length < 2})}
  </section>${scenarioBar()}
  ${state.rows.length ? `<div class="cards group-metrics" aria-label="Indicadores">
    ${metric('Média geral por juiz',fmt(reference.rate,2),`${fmt(reference.cases,0)} casos · ${fmt(reference.judges,4)} juízes`,'chart')}
    ${metric('Faixa de referência',`${fmt(reference.rate * LOWER,2)} a ${fmt(reference.rate * UPPER,2)}`,'95% a 105% da média geral','bars')}
    ${metric('Grupos dentro da faixa',`${stats.inRange} de ${stats.occupied}`,`${stats.covered} ${stats.covered === 1 ? 'vara' : 'varas'} na faixa · ${stats.unassigned} sem grupo`,'grid')}
    ${metric('Alta / baixa movimentação',`${high} / ${state.rows.length-high}`,`${state.rows.length} varas na base`,'data')}
  </div>
  ${stats.unassigned ? `<p class="panel section-gap" role="status">${stats.unassigned} ${stats.unassigned === 1 ? 'vara está sem agrupamento' : 'varas estão sem agrupamento'} neste cenário. A sugestão pode ser parcial para respeitar os critérios escolhidos. Use o filtro “Sem agrupamento” na lista de varas para revisar.</p>` : ''}
  <section class="panel"><div class="panel-head"><div><h2>Média dos agrupamentos</h2><p>Percentual da média geral por juiz · Mínimo de ${active().minSize} varas por grupo</p></div>
    <div class="actions"><span class="pill ${overLimit ? 'above' : ''}">${groupCount}</span>${button('Criar agrupamento','new-group',{icon:'plus',style:'primary',disabled:groups.length >= maxGroups})}</div></div>
    ${overLimit ? `<p class="chart-muted">Remova agrupamentos ou gere uma nova sugestão para adequar este cenário ao limite de ${maxGroups}.</p>` : ''}
    ${goalsChart(groups,{esc,percent})}
    ${stats.occupied || stats.pending ? `<p class="chart-muted">${stats.mixed} ${stats.mixed === 1 ? 'grupo cruza' : 'grupos cruzam'} subregiões${stats.pending ? ` · ${stats.pending} em montagem` : ''}${stats.departure === null ? '' : ' · Distância média até 100% de ' + points(stats.departure)}</p>` : ''}
    <div class="section-gap">${groupTable(groups,true)}</div>
  </section>
  ${regionalDistances()}
  ${comparePanel()}
  <section class="panel section-gap"><div class="panel-head"><div><h2>Alocação das varas</h2><p>Revise a composição de cada grupo por cidade sede, subregião e categoria.</p></div></div>
    ${cityLimit ? `<p class="chart-muted city-note">Ao alterar a alocação de uma vara, todas as varas da mesma cidade mudam juntas. O limite de ${cityLimit} varas vale para a sugestão automática; ajustes manuais podem ultrapassá-lo.</p>` : ''}
    ${aboveLimit.length ? `<p class="chart-muted city-note">O tamanho da cidade excede o limite de varas por grupo em ${esc(aboveLimit.slice(0, 4).map(block => `${block[0].city} (${block.length})`).join(', '))}${aboveLimit.length > 4 ? ` e de mais ${aboveLimit.length - 4} cidades` : ''}.</p>` : ''}
    <p class="chart-muted">Vínculos manuais não são bloqueados pelas regras geográficas. Opções ordenadas pela média atual: menores para varas de alta movimentação e maiores para as de baixa. Grupos vazios ficam ao final. A escolha é sua; a composição de alta e baixa continua indicada no grupo.</p>${filters()}<div id="table-zone"></div></section>
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
  return `<div class="filters"><input id="search" type="search" aria-label="Buscar vara, cidade ou região" placeholder="Buscar vara, cidade ou região" value="${esc(search)}">
    <select id="region" aria-label="Filtrar subregião"><option value="">Todas as subregiões</option>
    ${regions.map(region => `<option value="${esc(searchKey(region.name))}"${cityRegion === searchKey(region.name) ? ' selected' : ''}>${esc(region.name)}</option>`).join('')}</select>
    <select id="movement" aria-label="Filtrar movimentação"><option value="">Toda movimentação</option>
      ${['Alta movimentação','Baixa movimentação'].map(value => `<option${movement === value ? ' selected' : ''}>${value}</option>`).join('')}
    </select>${page === 'agrupamentos' ? `<select id="assignment-filter" aria-label="Filtrar por agrupamento">
      <option value="">Todas as varas</option>
      <option value="unassigned"${assignmentFilter === 'unassigned' ? ' selected' : ''}>Sem agrupamento</option>
    </select>` : ''}</div>`;
}

function rowTable() {
  const managing = page === 'agrupamentos';
  const query = searchKey(search);
  const visible = state.rows.filter(row =>
    [row.name,row.city,row.region,row.geographicRegion].some(value => searchKey(value).includes(query)) &&
    (!cityRegion || cityRegion === searchKey(row.region)) &&
    (!movement || movement === category(rateOf(row),report.reference.rate)) &&
    (!managing || assignmentFilter !== 'unassigned' || !report.assignment.has(row.id)))
    .sort((a,b) => byName(a.region,b.region) || byName(a.city,b.city) || byName(a.name,b.name));
  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  tablePage = Math.min(tablePage, pages - 1);
  const start = tablePage * pageSize;
  const end = Math.min(start + pageSize, visible.length);
  const pager = visible.length ? `<div class="pager"><span>Exibindo ${start+1}–${end} de ${fmt(visible.length,0)}</span>${pages > 1 ?
    `<div class="actions">${button('Anterior','prev',{disabled:!tablePage})}${button('Próxima','next',{disabled:tablePage >= pages-1})}</div>` : ''}</div>` : '';
  const places = active().groups;
  const head = th('Vara') + th('Cidade sede') + th('Região geográfica') + th('Subregião') + th('Casos novos 2025',true) + th('Juízes',true) +
    th('Média por juiz',true) + th('Categoria') + th(managing ? 'Agrupamento' : 'Ações');
  const body = visible.slice(start,end).map(row => {
    const current = report.assignment.get(row.id);
    const assign = places.length ? `<select class="group-select" data-court="${row.id}" aria-label="${esc('Agrupamento de ' + row.name)}">
      <option value="">Sem grupo</option>${recommendedGroups(active(),state.rows,row.id).map(g => `<option value="${g.id}"${current?.id === g.id ? ' selected' : ''}>${esc(g.name)} · ${g.rate === null ? 'Sem varas' : 'Média '+fmt(g.rate,2)}${g.manualGeography ? ' · Ajuste manual' : ''}</option>`).join('')}</select>` : 'Sem grupo';
    return `<tr><td>${esc(row.name)}</td><td>${esc(row.city)}</td><td>${esc(row.geographicRegion || 'Não identificada')}</td><td>${esc(row.region)}</td>${num(row.cases,0)}${num(row.judges,4)}
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
        <p>A busca avalia combinações com o máximo de grupos e de varas por grupo que você informar. O número de grupos aceita de 1 a ${MAX_GROUP_COUNT}, com ${MAX_GROUPS} como padrão, e é salvo em cada cenário. No modo por sub-região, a alocação de todas as varas é obrigatória. Com cruzamentos permitidos, a busca pode combinar sub-regiões para obter uma composição completa, mesmo que alguns grupos fiquem fora da faixa ideal.</p>
        <h3>Como a busca decide</h3><p>Com a mesma cobertura na faixa, as sugestões priorizam menos subregiões por grupo, menos varas fora da subregião predominante e a alocação de mais varas. Em seguida, buscam aproximar as médias de 100%. O desvio médio é ponderado pelo número de varas de cada grupo.</p>
        <h3>Varas da mesma cidade</h3><p>Com a opção marcada, cada cidade sede é tratada como um bloco na sugestão e nas alterações manuais do cenário. Se a cidade tiver mais varas que o limite por grupo, a sugestão será bloqueada até o ajuste do limite. Com uma única subregião por grupo, cidades cadastradas em mais de uma subregião também impedem uma sugestão completa com a regra de cidade ativa.</p>
        <h3>Proximidade geográfica</h3><p>Combine três parâmetros: distância de proximidade, mínimo de cidades vizinhas e distância máxima interna. Cada cidade precisa ter o mínimo informado de outras cidades próximas dentro do grupo, sem contar as varas da própria cidade. A rede de proximidade precisa ser conectada e nenhum par de cidades pode ultrapassar a distância máxima interna. Uma única cidade é dispensada da exigência de vizinhas. Todos os grupos sugeridos precisam reunir alta e baixa movimentação e respeitar os limites de tamanho.</p>
        <p>A busca compara uniões por proximidade e por equilíbrio de carga. Pode passar por composições intermediárias sem o mínimo de vizinhas para construir grupos válidos maiores; essas composições intermediárias não são aplicadas. Entre as alternativas, prioriza mais varas alocadas, depois a cobertura na faixa e a compactação. Quando há mais grupos que o máximo informado, prioriza também a quantidade de varas alocadas. A sugestão pode ser parcial e não garante o ótimo global. Os parâmetros ficam salvos no cenário, são preservados na duplicação e são conferidos na importação JSON e nas alterações manuais.</p>
        <p>As distâncias são calculadas em linha reta pela fórmula de Haversine, com coordenadas das sedes de 853 municípios de Minas Gerais do <a href="https://github.com/kelvins/municipios-brasileiros" target="_blank" rel="noopener">repositório Municípios Brasileiros</a> (consulta em 23/11/2026). Nomes são comparados sem diferença de acentos ou maiúsculas; cidades não reconhecidas ficam sem agrupamento e são sinalizadas, sem coordenadas estimadas. A base demonstrativa contém cidades fictícias e não serve para testar distâncias reais.</p>
        <h3>Nomes dos grupos por proximidade</h3><p>Novas sugestões recebem o nome da mesorregião geográfica do IBGE e de uma cidade central do grupo, definida pela menor soma das distâncias às demais cidades distintas. Grupos entre duas regiões mostram ambos os nomes; com mais regiões, o nome sinaliza as demais. A referência usa o recorte histórico de mesorregiões, consultado na <a href="https://servicodados.ibge.gov.br/api/v1/localidades/estados/31/municipios" target="_blank" rel="noopener">API de Localidades do IBGE</a> em 23/11/2026. É apenas uma identificação: não restringe as composições e não usa a sub-região judicial como região do estado. Nomes já salvos ou editados não são alterados automaticamente.</p>
        <h3>Revisão dos grupos</h3><p>A busca testa alternativas e ajustes de composição. Em ambos os modos, aplica os grupos encontrados e informa quantas varas ficaram sem agrupamento, inclusive quando nenhuma cidade puder ser agrupada. Isso não comprova inviabilidade matemática. Você também pode gerar sugestões com uma única subregião por grupo.</p></section>
      <section class="panel method"><h2>Base de importação</h2>
        <p>Informe uma linha por vara com nome, cidade sede, subregião, casos novos de conhecimento de 2025 e quantidade de juízes. A coluna opcional Região geográfica registra a região do estado (mesorregião histórica do IBGE), distinta da sub-região judicial. Para municípios identificados, o valor é preenchido automaticamente e divergências na importação são sinalizadas. Planilhas antigas sem a coluna continuam aceitas. Use a mesma base de capacidade para todas as varas. A quantidade deve ser positiva e aceita frações.</p>
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
  const pdfButton=$('[data-action="export-pdf"]');
  pdfButton.disabled=generatingPdf || !state.rows.length;
  pdfButton.textContent=generatingPdf?'Gerando PDF…':'Gerar PDF';
  $('[data-action="import"]').hidden = !profile.can_edit;
  $('[data-action="migrate-local"]').hidden = !profile.can_edit || !localProject || revision !== 0;
  for (const link of document.querySelectorAll('.navigation a')) {
    if (link.dataset.page === page) link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  }
  view.innerHTML = {agrupamentos:dashboard,dados:dataPage,metodologia:methodologyPage,usuarios:usersPage}[page]();
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
    input('Região geográfica (IBGE)','geographicRegion',row?.geographicRegion ?? geographicRegionForCity(row?.city ?? ''),'maxlength="140" list="geographic-regions"') +
    `<datalist id="geographic-regions">${regionNames.map(name => `<option value="${esc(name)}"></option>`).join('')}</datalist>
    <p class="form-note full">Região do estado, distinta da sub-região judicial. Preenchida automaticamente para municípios identificados. Para cidade não localizada, informe a região manualmente, se conhecida.</p>` +
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
      return update({...state,rows,plans}, 'Vara salva na base.');
    }, row ? button('Excluir vara','delete-row',{id,style:'danger push'}) : '');
  const cityInput=$('#dialog-form [name="city"]');
  const regionInput=$('#dialog-form [name="geographicRegion"]');
  let lastOfficial=geographicRegionForCity(cityInput.value);
  const refreshRegion=()=>{
    const official=geographicRegionForCity(cityInput.value);
    if(official) regionInput.value=official;
    else if(lastOfficial) regionInput.value='';
    regionInput.readOnly=Boolean(official);
    regionInput.placeholder=official?'':'Região não identificada automaticamente';
    lastOfficial=official;
  };
  cityInput.addEventListener('input',refreshRegion);
  refreshRegion();
}


function removeRow(id) {
  const row = state.rows.find(item => item.id === id);
  openForm('Excluir vara', `Remover “${esc(row.name)}” da base e de todos os agrupamentos em que aparece.`, '',
    'Excluir vara', () => {
      const next = structuredClone(state);
      next.rows = next.rows.filter(item => item.id !== id);
      for (const plan of next.plans) for (const group of plan.groups) group.members = group.members.filter(member => member !== id);
      return update(next,'Vara removida.');
    });
}

function groupForm(id) {
  const group = report.groups.find(item => item.id === id);
  if (!group && report.groups.length >= groupLimit()) return;
  const body = input('Nome do agrupamento','name',group?.name,'required maxlength="140"') +
    (group?.rows.length ? `<ul class="member-list full">${group.rows.map(row =>
      `<li><strong>${esc(row.name)}</strong> <span>${esc(row.city)} · ${esc(row.region)} · ${fmt(rateOf(row),2)} por juiz</span></li>`).join('')}</ul>` : '');
  openForm(group ? 'Composição do agrupamento' : 'Criar agrupamento',
    'Use a tabela Alocação das varas para incluir, mover ou retirar varas do grupo.',
    body, 'Salvar agrupamento', ({name}) => {
      return editPlan(plan => {
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
      return editPlan(plan => {
        plan.groups = plan.groups.filter(item => item.id !== id);
      }, 'Agrupamento removido.');
    });
  $('#dialog-form [data-action="close"]')?.focus();
}

function suggest() {
  const intro = `Em ambos os critérios geográficos, a sugestão pode deixar varas sem agrupamento, que serão informadas no resultado. Cada grupo precisa reunir varas de alta e de baixa movimentação. O máximo de grupos é ajustável (padrão: ${MAX_GROUPS}). A busca prioriza médias na faixa de 95% a 105% da média geral.` +
    (active().groups.length ? ' Ao gerar, você substitui a composição do cenário ativo.' : '');
  const minimumField = input('Mínimo de varas por agrupamento','minimum',active().minSize,
    `type="number" min="${MIN_GROUP_SIZE}" max="${MAX_GROUP_SIZE}" required`);
  const maximumField = input('Máximo de varas por grupo','maximum',active().maxSize,
    `type="number" min="${MIN_GROUP_SIZE}" max="${MAX_GROUP_SIZE}" required`);
  const groupCountField = input('Máximo de agrupamentos','maxGroups',groupLimit(),
    `type="number" min="1" max="${MAX_GROUP_COUNT}" step="1" required`);
  const territoryField = `<label class="full">Cruzamento entre subregiões<select name="territory">
    <option value="improve">Quando colocar mais varas na faixa</option>
    <option value="single">Uma única subregião por grupo</option>
  </select></label>`;
  const geographyField = `<label class="full">Critério geográfico<select name="geography">
    <option value="regions"${active().geography !== 'distance' ? ' selected' : ''}>Sub-regiões atuais</option>
    <option value="distance"${active().geography === 'distance' ? ' selected' : ''}>Proximidade geográfica</option>
    </select></label>` + input('Distância de proximidade (km)','proximityLimitKm',active().proximityLimitKm ?? active().distanceLimitKm ?? 100,
      'type="number" min="0.1" max="2000" step="0.1" required') +
    input('Mínimo de cidades vizinhas próximas','minNearbyCities',active().minNearbyCities ?? 1,
      'type="number" min="1" max="59" step="1" required') +
    input('Distância máxima entre quaisquer duas cidades (km)','distanceLimitKm',active().distanceLimitKm ?? 250,
      'type="number" min="0.1" max="2000" step="0.1" required') +
    `<p class="form-note full" id="distance-help">Distâncias em linha reta. Cada cidade precisa do mínimo de vizinhas distintas dentro da proximidade informada; o grupo deve ficar conectado. Nenhum par pode ultrapassar a distância máxima interna. Grupos de uma única cidade são dispensados da regra de vizinhas. As varas da mesma cidade ficam juntas. A busca compara proximidade e equilíbrio de carga, mantendo os critérios de tamanho, alta e baixa movimentação; as varas que não couberem nos grupos ficam sem agrupamento e serão sinalizadas.</p>`;
  const cityField = `<label class="full checkbox-field"><input type="checkbox" name="keepCityTogether"
    aria-describedby="city-help"${active().cityLimit ? ' checked' : ''}> Manter juntas as varas da mesma cidade</label>
    <p class="form-note full" id="city-help">Cada cidade inteira fica no mesmo agrupamento. A cidade também pode ficar inteira sem agrupamento em ambos os modos.</p>`;
  openForm('Sugerir agrupamentos', intro, minimumField + maximumField + groupCountField + geographyField + territoryField + cityField,
    'Gerar sugestões', async ({minimum,maximum,territory,keepCityTogether,geography,distanceLimitKm,maxGroups,proximityLimitKm,minNearbyCities},form) => {
      const allowMix = territory === 'improve';
      const limit = Number(maximum);
      const lower = Number(minimum);
      const lockCity = geography === 'distance' || keepCityTogether === 'on';
      const controller = new AbortController();
      const cancelSearch = () => controller.abort();
      modal.addEventListener('close',cancelSearch,{once:true});
      const control = $('button[type=submit]',form);
      const originalLabel = control.textContent;
      const fields = [...form.querySelectorAll('input:not(:disabled), select:not(:disabled)')];
      fields.forEach(field => { field.disabled = true; });
      control.textContent = 'Calculando… (até 20 segundos)';
      form.setAttribute('aria-busy','true');
      let groups;
      try {
        groups = await runSuggestion({rows:state.rows,reference:report.reference.rate,maximum:limit,
          options:{allowMix,keepCityTogether:lockCity,minimum:lower,geography,distanceLimitKm:Number(distanceLimitKm),maxGroups:Number(maxGroups),proximityLimitKm:Number(proximityLimitKm),minNearbyCities:Number(minNearbyCities)}},
          {signal:controller.signal});
      } finally {
        modal.removeEventListener('close',cancelSearch);
        fields.forEach(field => { field.disabled = false; });
        control.textContent = originalLabel;
        form.removeAttribute('aria-busy');
      }
      if (controller.signal.aborted) throw new Error('Busca cancelada.');
      const assigned = new Set(groups.flatMap(group => group.members)).size;
      const remaining = state.rows.length - assigned;
      const message = `${groups.length} ${groups.length === 1 ? 'agrupamento sugerido' : 'agrupamentos sugeridos'} · ${assigned} de ${state.rows.length} varas alocadas.` +
        (remaining ? ` Atenção: ${remaining} ${remaining === 1 ? 'vara ficou sem agrupamento' : 'varas ficaram sem agrupamento'}. Use o filtro “Sem agrupamento” para revisar.` : ' Todas as varas foram alocadas.');
      return editPlan(plan => {
        plan.groups = groups;
        plan.cityLimit = lockCity ? limit : null;
        plan.minSize = lower;
        plan.maxSize = limit;
        plan.maxGroups = Number(maxGroups);
        plan.geography = geography;
        plan.distanceLimitKm = geography === 'distance' ? Number(distanceLimitKm) : null;
        plan.proximityLimitKm = geography === 'distance' ? Number(proximityLimitKm) : null;
        plan.minNearbyCities = geography === 'distance' ? Number(minNearbyCities) : 1;
      }, message);
    });
  const geographySelect = $('#dialog-form [name="geography"]');
  const refreshGeography = () => {
    const distance = geographySelect.value === 'distance';
    for (const name of ['distanceLimitKm','proximityLimitKm','minNearbyCities']) {
      const field = $(`#dialog-form [name="${name}"]`);
      field.disabled = !distance;
      field.closest('label').hidden = !distance;
    }
    $('#distance-help').hidden = !distance;
    const territory = $('#dialog-form [name="territory"]');
    territory.disabled = distance;
    territory.closest('label').hidden = distance;
    const city = $('#dialog-form [name="keepCityTogether"]');
    city.disabled = distance;
    if (distance) city.checked = true;
  };
  geographySelect.addEventListener('change', refreshGeography);
  refreshGeography();
}

function planForm(mode) {
  const current = active();
  const rename = mode === 'rename';
  const copy = mode === 'copy';
  if (copy && current.groups.length > groupLimit(current)) return;
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
          plan.maxGroups = groupLimit(current);
          plan.geography = current.geography;
          plan.distanceLimitKm = current.distanceLimitKm;
          plan.proximityLimitKm = current.proximityLimitKm;
          plan.minNearbyCities = current.minNearbyCities;
        }
        next.plans.push(plan);
        next.active = plan.id;
      }
      return update(next,'Cenário salvo.');
    });
}
function removePlan() {
  if (state.plans.length < 2) return;
  openForm('Excluir cenário', `Remover “${esc(active().name)}” e seus agrupamentos.`, '',
    'Excluir cenário', () => {
      const plans = state.plans.filter(plan => plan.id !== state.active);
      return update({...state,plans,active:plans[0].id},'Cenário removido.');
    });
}

function resetTransient() {
  search = '';
  cityRegion = '';
  movement = '';
  assignmentFilter = '';
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
      await update(createProject(rows), `${rows.length} ${rows.length === 1 ? 'vara importada' : 'varas importadas'}.`);
      location.hash = 'dados';
    }, '<div class="push">' + template + '</div>');
}

function restoreForm() {
  openForm('Abrir projeto JSON', 'O arquivo substitui a base e os cenários compartilhados.',
    '<label class="full">Arquivo do projeto<input name="file" type="file" accept=".json,application/json" required></label>',
    'Abrir projeto', async ({file},form) => {
      const source = decodeText(await fileBytes(file));
      let data;
      try { data = JSON.parse(source); }
      catch { throw new Error('O arquivo JSON é inválido.'); }
      if (!form.isConnected || !modal.open) return;
      const next = validateProject(data);
      resetTransient();
      return update(next,'Projeto restaurado.');
    });
}
function replaceForm(usingDemo) {
  openForm(usingDemo ? 'Carregar demonstração' : 'Começar com base vazia',
    usingDemo ? 'Substitua o projeto compartilhado por uma base com dados e nomes fictícios.' : 'Remova a base e os cenários compartilhados atual.',
    '', usingDemo ? 'Carregar demonstração' : 'Criar base vazia', () => {
      resetTransient();
      return update(usingDemo ? demo() : createProject(),usingDemo ? 'Demonstração carregada.' : 'Base vazia criada.');
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
async function exportPdf() {
  if(generatingPdf || !state.rows.length) return;
  const project=structuredClone(state), projectRevision=revision;
  generatingPdf=true;
  const control=$('[data-action="export-pdf"]');
  control.disabled=true;control.textContent='Gerando PDF…';
  notify('Preparando relatório completo da base e do cenário ativo…');
  try {
    const buffer=await generatePdfFile(project,projectRevision);
    download('relatorio-equalizacao-2025.pdf',buffer,'application/pdf');
    notify('PDF gerado com a base completa e o cenário ativo.');
  } finally {
    generatingPdf=false;
    control.disabled=!state.rows.length;control.textContent='Gerar PDF';
  }
}

function exportResults() {
  const headline = [...HEADERS,'Categoria','Cenário','Agrupamento','Média do grupo','% da média geral','Faixa do grupo','Média geral','Origem da base','Composição do grupo','Critério geográfico','Limiar (km)','Distância média (km)','Distância máxima (km)','Distância de proximidade (km)','Mínimo de cidades vizinhas','Ajuste geográfico manual'];
  const rows = state.rows.map(row => {
    const group = report.assignment.get(row.id);
    const rate = rateOf(row);
    return [...courtExportValues(row),category(rate,report.reference.rate),active().name,
      group?.name ?? 'Sem grupo',group?.rate,group?.relative == null ? '' : group.relative * 100,group ? statusText[group.status] : '',
      report.reference.rate,state.type === 'demo' ? 'Demonstrativa' : 'Própria',group ? group.complete ? 'Completa' : 'Em montagem' : '',
      active().geography === 'distance' ? 'Proximidade geográfica' : 'Sub-regiões', active().distanceLimitKm ?? '',
      group ? geographicStats(group.rows).mean : '', group ? geographicStats(group.rows).maximum : '',
      active().geography === 'distance' ? active().proximityLimitKm ?? active().distanceLimitKm : '',
      active().geography === 'distance' ? active().minNearbyCities ?? 1 : '', group?.manualGeography ? 'Sim' : 'Não'];
  });
  download('agrupamentos-equalizacao-2025.csv',makeCSV([headline,...rows]),'text/csv;charset=utf-8');
  notify('Resultados exportados.');
}

const actions = {
  login, logout, 'add-user': addUser,
  'migrate-local': () => openForm('Publicar projeto deste navegador',
    'A base de varas e os cenários locais ficarão disponíveis para os usuários cadastrados.',
    '', 'Publicar projeto', () => update(localProject, 'Projeto publicado na base compartilhada.')),
  import: importForm, restore: restoreForm, export: exportResults, 'export-pdf':exportPdf, suggest,
  backup: () => download('projeto-agrupamentos.json',JSON.stringify(state,null,2),'application/json'),
  empty: () => replaceForm(false), demo: () => replaceForm(true), close: () => modal.close(),
  'add-row': () => rowForm(), 'edit-row':rowForm, 'delete-row':removeRow,
  'new-plan': () => planForm('new'), 'copy-plan': () => planForm('copy'), 'rename-plan': () => planForm('rename'),
  'delete-plan':removePlan, 'new-group':() => groupForm(), 'edit-group':groupForm, 'delete-group':removeGroup,
  prev: () => { tablePage--; renderTable(); $('.pager button:not([disabled])')?.focus(); },
  next: () => { tablePage++; renderTable(); $('.pager button:not([disabled])')?.focus(); }
};

document.addEventListener('click', async event => {
  const control = event.target.closest('[data-action]');
  if (!control || control.disabled) return;
  try { await actions[control.dataset.action]?.(control.dataset.id); }
  catch (error) { notify(error.message); }
});
document.addEventListener('input', event => {
  if (event.target.id !== 'search') return;
  search = event.target.value;
  tablePage = 0;
  renderTable();
});
document.addEventListener('change', async event => {
  const {id,value,dataset} = event.target;
  if (id === 'plan') {
    if (compareTo === value) compareTo = '';
    try { await update({...state,active:value}); }
    catch (error) { event.target.value = state.active; notify(error.message); }
    $('#plan')?.focus();
  } else if (id === 'compare') {
    compareTo = value;
    render();
    $('#compare')?.focus();
  } else if (id === 'region' || id === 'movement' || id === 'assignment-filter') {
    if (id === 'region') cityRegion = value;
    else if (id === 'movement') movement = value;
    else assignmentFilter = value;
    tablePage = 0;
    renderTable();
  } else if (dataset.court) {
    const courtId = dataset.court;
    const subject = active().cityLimit ? 'Cidade' : 'Vara';
    try {
      await editPlan(plan => assignCourt(plan, state.rows, courtId, value),
        `${subject} ${value ? 'alocada ao agrupamento.' : 'retirada do agrupamento.'}`);
    } catch (error) {
      event.target.value = report.assignment.get(courtId)?.id ?? '';
      notify(error.message);
    }
    $(`[data-court="${courtId}"]`)?.focus();
  }
});
window.addEventListener('hashchange', async () => {
  if (!profile) return;
  const next = route();
  if (next === page) return;
  page = next;
  search = cityRegion = movement = assignmentFilter = '';
  tablePage = 0;
  render();
  if (page === 'usuarios') {
    try { await loadMembers(); }
    catch (error) { notify(error.message); }
  }
  $('#main').focus({preventScroll:true});
  window.scrollTo(0,0);
});

initialize().catch(() => {
  showGate('Não foi possível verificar o acesso. Recarregue a página para tentar novamente.');
});

function showGate(message, signedIn = false) {
  $('.shell').hidden = true;
  $('#gate').hidden = false;
  $('#login-status').textContent = message;
  $('#gate [data-action="login"]').hidden = signedIn;
  $('#gate [data-action="logout"]').hidden = !signedIn;
}

async function initialize() {
  const callback = new URLSearchParams(location.search);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    showGate(callback.has('error') ? 'O login com Google não foi concluído. Tente novamente.' :
      'Entre com a conta Google institucional cadastrada.');
    return;
  }

  const { data: member, error: memberError } = await supabase.from('equalizacao_members')
    .select('email, equalizacao_roles(label, can_edit, can_manage_users)')
    .eq('email', session.user.email.toLowerCase()).maybeSingle();
  if (memberError) {
    showGate('Não foi possível verificar seu cadastro. Recarregue a página para tentar novamente.', true);
    return;
  }
  if (!member?.equalizacao_roles) {
    showGate('Esta conta Google não está autorizada. Solicite o cadastro do seu e-mail institucional.', true);
    return;
  }

  const { data: project, error } = await supabase.from('equalizacao_project')
    .select('payload, revision').eq('id', true).single();
  if (error) {
    showGate('Não foi possível carregar o projeto compartilhado. Recarregue a página.', true);
    return;
  }

  state = project.payload ? validateProject(project.payload) : demo();
  revision = project.revision;
  profile = member.equalizacao_roles;
  try {
    const previous = localStorage.getItem(storage);
    if (previous) localProject = validateProject(JSON.parse(previous));
  } catch {}
  $('[data-page="usuarios"]').hidden = !profile.can_manage_users;
  page = route();
  if (page === 'usuarios') await loadMembers();
  render();
  $('#gate').hidden = true;
  $('.shell').hidden = false;
}

async function login() {
  const redirectTo = new URL(location.pathname, location.origin).href;
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, scopes: 'openid', queryParams: { prompt: 'select_account' } } });
  if (error) showGate('Não foi possível iniciar o login com Google.');
}

async function logout() {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) {
    if (profile) notify('Não foi possível encerrar a sessão. Tente novamente.');
    else showGate('Não foi possível encerrar a sessão. Tente novamente.', true);
    return;
  }
  location.replace(location.pathname);
}

async function loadMembers() {
  const { data, error } = await supabase.from('equalizacao_members')
    .select('email, equalizacao_roles(label)').order('email');
  if (error) throw new Error('Não foi possível consultar os usuários cadastrados.');
  members = data;
  if (page === 'usuarios') render();
}

function usersPage() {
  const body = members.map(member => `<tr><td>${esc(member.email)}</td><td>${esc(member.equalizacao_roles.label)}</td></tr>`).join('');
  return `<section class="panel"><h1>Usuários</h1>
    <p>Cadastre o e-mail Google institucional para liberar o acesso ao projeto.</p>
    ${button('Adicionar usuário','add-user',{style:'primary'})}
    ${table(th('E-mail') + th('Perfil'), body, 'Nenhum usuário cadastrado.')}
  </section>`;
}

function addUser() {
  openForm('Adicionar usuário', 'O usuário receberá o perfil Padrão.',
    input('E-mail institucional','email','','type="email" maxlength="254" required'),
    'Cadastrar', async ({email}) => {
      const { error } = await supabase.from('equalizacao_members').insert({ email: email.trim().toLowerCase() });
      if (error?.code === '23505') throw new Error('Este e-mail já está cadastrado.');
      if (error?.code === '42501') throw new Error('Use um e-mail do domínio autorizado.');
      if (error) throw new Error('Não foi possível cadastrar o usuário. Tente novamente.');
      modal.close();
      notify('Usuário cadastrado.');
      try { await loadMembers(); }
      catch (error) { notify(error.message); }
    });
}
