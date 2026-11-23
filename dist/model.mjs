import { completeGroups } from './complete-grouping.mjs';
import { optimizeGroups } from './grouping.mjs';
import { proximityGroups, geographicGroupPrefix, validDistance, validNeighborhood, checkDistance } from './geography.mjs';

export const uid = () => crypto.randomUUID();
export const key = value => value.trim().normalize('NFC').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
export function validName(value, label) {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 140) throw new Error(`${label} deve ter entre 1 e 140 caracteres.`);
  return name;
}

const splitLines = (str, separator) => {
  const result = [];
  let row = [], cell = '', quoted = false, afterQuote = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (quoted) {
      if (char === '"' && str[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; afterQuote = true; }
      else cell += char;
    } else if (char === separator || char === '\r' || char === '\n') {
      row.push(cell);
      cell = '';
      afterQuote = false;
      if (char !== separator) {
        if (char === '\r' && str[i + 1] === '\n') i++;
        result.push(row);
        row = [];
      }
    } else if (char === '"' && !cell.trim() && !afterQuote) {
      cell = '';
      quoted = true;
    } else if (char === '"' || (afterQuote && char.trim())) {
      throw new Error('O arquivo contém aspas em posição inválida.');
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error('O arquivo contém um campo com aspas que não foram fechadas.');
  row.push(cell);
  result.push(row);
  return result.filter(values => values.some(value => value.trim()));
};

export function makeCSV(rows) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    let cell = typeof value === 'number' ? String(Number(value.toFixed(8))).replace('.', ',') : String(value ?? '');
    if (typeof value === 'string' && /^\s*[=+\-@]/.test(cell)) cell = "'" + cell;
    return '"' + cell.replaceAll('"', '""') + '"';
  }).join(';')).join('\r\n') + '\r\n';
}

export const HEADERS = ['Vara', 'Cidade sede', 'Subregião', 'Qtde casos novos 2025', 'Qtde juízes', 'Média por juiz'];
export const MAX_ROWS = 5000;
export const MIN_GROUP_SIZE = 2;
export const MAX_GROUP_SIZE = 60;
export const MAX_GROUPS = 9;
export const MAX_GROUP_COUNT = 100;
export function validMaxGroups(value) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_GROUP_COUNT)
    throw new Error(`O máximo de grupos deve ser um inteiro entre 1 e ${MAX_GROUP_COUNT}.`);
  return value;
}
export const LOWER = .95;
export const UPPER = 1.05;
const epsilon = 1e-9;
export const searchKey = value => key(String(value ?? '')).normalize('NFD').replace(/\p{Diacritic}/gu, '');
const headerKey = value => searchKey(value).replace(/[^a-z0-9]/g, '');
const aliases = [
  ['vara', 'unidade', 'varadotrabalho'], ['cidadesede', 'cidade', 'municipiosede', 'municipio'],
  ['subregiao', 'subregional'], ['qtdecasosnovos2025', 'casosnovos2025', 'quantidadecasosnovos2025', 'casosnovosconhecimento2025'],
  ['qtdejuizes', 'juizes', 'quantidadejuizes', 'qtdejuizesfixos'], ['mediaporjuiz', 'casosnovosporjuiz']
];

export function court(data) {
  const count = typeof data.cases === 'number' ? data.cases : Number(String(data.cases ?? '').trim() || NaN);
  const capacity = typeof data.judges === 'number' ? data.judges : /^\d+(?:[.,]\d{1,4})?$/.test(String(data.judges ?? '').trim())
    ? Number(String(data.judges).trim().replace(',', '.')) : NaN;
  if (!Number.isSafeInteger(count) || count < 0 || count > 1_000_000_000)
    throw new Error('Informe os casos novos como número inteiro entre 0 e 1 bilhão.');
  const units = Math.round(capacity * 10000);
  if (!Number.isFinite(capacity) || units <= 0 || units > 10_000_000 || Math.abs(units / 10000 - capacity) > epsilon)
    throw new Error('Informe uma quantidade positiva de juízes, até 1.000 e com até quatro casas decimais.');
  return {
    id: data.id ?? uid(), name: validName(data.name, 'Vara'), city: validName(data.city, 'Cidade sede'),
    region: validName(data.region, 'Subregião'), cases: count, judges: units / 10000
  };
}

export function checkDuplicate(item, rows) {
  if (rows.some(row => row.id !== item.id && searchKey(row.name) === searchKey(item.name))) {
    throw new Error(`A vara “${item.name}” já consta na base. Use identificações distintas quando houver mais de uma vara na cidade.`);
  }
}

export function parseRecords(records) {
  const [header, ...entries] = records;
  const columns = (header ?? []).map(headerKey);
  const positions = aliases.map(labels => columns.findIndex(name => labels.includes(name)));
  if (positions.slice(0, 5).some(index => index < 0)) {
    throw new Error('Confira os cabeçalhos de Vara, Cidade sede, Subregião, Qtde casos novos 2025 e Qtde juízes na primeira linha.');
  }
  const seen = new Set();
  const rows = [];
  for (const [i, entry] of entries.entries()) {
    const [name, city, region, cases, judges] = positions.slice(0, 5).map(index => entry[index] ?? '');
    if ([name, city, region, cases, judges].every(value => String(value ?? '').trim() === '')) continue;
    if (rows.length >= MAX_ROWS) throw new Error('A base aceita até 5.000 varas.');
    try {
      const row = court({name, city, region, cases, judges});
      const label = searchKey(row.name);
      if (seen.has(label)) throw new Error(`A vara “${row.name}” aparece mais de uma vez.`);
      seen.add(label);
      rows.push(row);
    } catch (error) { throw new Error(`Linha ${entry.line ?? i + 2}. ${error.message}`); }
  }
  if (!rows.length) throw new Error('A planilha não contém varas preenchidas.');
  return rows;
}

export function parseCSV(value) {
  const text = value.replace(/^\uFEFF/, '').trim();
  const first = text.split(/\r?\n/, 1)[0];
  const separator = first.includes(';') ? ';' : first.includes('\t') ? '\t' : ',';
  return parseRecords(splitLines(text, separator));
}

export function totals(rows) {
  let cases = 0;
  let units = 0;
  for (const row of rows) {
    cases += row.cases;
    units += Math.round(row.judges * 10000);
  }
  return {cases, judges: units / 10000, rate: units ? cases / (units / 10000) : null};
}

export const category = (rate, reference) => reference === null ? null
  : rate >= reference - epsilon ? 'Alta movimentação' : 'Baixa movimentação';
export const rateOf = row => row.cases / row.judges;
export const relativeRate = (rate, reference) => rate === null || !reference ? null : rate / reference;
export function rangeStatus(rate, reference) {
  if (rate === null || reference === null) return 'empty';
  if (rate < reference * LOWER - epsilon) return 'below';
  if (rate > reference * UPPER + epsilon) return 'above';
  return 'inside';
}
export const statusText = {inside:'Na faixa', below:'Abaixo de 95%', above:'Acima de 105%', empty:'Sem varas'};

export function allocate(rows, groups, reference, minimum = MIN_GROUP_SIZE) {
  const courtById = new Map(rows.map(row => [row.id, row]));
  return groups.map(group => {
    const members = group.members.map(id => courtById.get(id)).filter(Boolean);
    const stats = totals(members);
    const regions = [...new Map(members.map(row => [searchKey(row.region), row.region])).values()];
    const cities = [...new Map(members.map(row => [searchKey(row.city), row.city])).values()];
    const high = members.filter(row => category(rateOf(row), reference) === 'Alta movimentação').length;
    const low = members.length - high;
    const complete = members.length >= minimum && high > 0 && low > 0;
    return {...group, ...stats, rows: members, regions, cities, high, low, complete, minimum,
      relative: relativeRate(stats.rate, reference), status: rangeStatus(stats.rate, reference)};
  });
}

export function courtsByCity(rows) {
  const cities = new Map();
  for (const row of rows) {
    const city = searchKey(row.city);
    if (!cities.has(city)) cities.set(city, []);
    cities.get(city).push(row);
  }
  return cities;
}

const isGroupSize = maximum => Number.isInteger(maximum) && maximum >= MIN_GROUP_SIZE && maximum <= MAX_GROUP_SIZE;

export function propose(rows, reference, maximum, { allowMix = true, keepCityTogether = false, minimum = MIN_GROUP_SIZE, geography = 'regions', distanceLimitKm = 100, maxGroups = MAX_GROUPS, proximityLimitKm = distanceLimitKm, minNearbyCities = 1 } = {}) {
  validMaxGroups(maxGroups);
  if (!isGroupSize(maximum)) {
    throw new Error(`Escolha de ${MIN_GROUP_SIZE} a ${MAX_GROUP_SIZE} varas por grupo.`);
  }
  if (!isGroupSize(minimum) || minimum > maximum)
    throw new Error(`O mínimo por agrupamento deve ser um inteiro entre ${MIN_GROUP_SIZE} e ${maximum}.`);
  if (reference === null || rows.length < minimum) {
    if (geography === 'distance') return [];
    throw new Error('A base não tem varas suficientes para formar um agrupamento completo.');
  }
  if (!['regions','distance'].includes(geography)) throw new Error('Critério geográfico inválido.');
  if (geography === 'distance') validNeighborhood(distanceLimitKm,proximityLimitKm,minNearbyCities);
  const blocks = (keepCityTogether || geography === 'distance') ? [...courtsByCity(rows).values()] : rows.map(row => [row]);
  const oversized = blocks.filter(block => block.length > maximum);
  if (geography === 'regions' && oversized.length) throw new Error(`Não é possível alocar todas as varas: ${oversized.map(block => block[0].city + ' (' + block.length + ' varas)').join(', ')} excede o máximo de ${maximum} varas por grupo. Aumente o máximo por grupo.`);
  if (geography === 'regions' && rows.length > maximum * maxGroups) throw new Error(`Não é possível alocar as ${rows.length} varas em até ${maxGroups} grupos de ${maximum}. Aumente o máximo de grupos ou de varas por grupo.`);
  const items = blocks.filter(block => block.length <= maximum).map((block, order) => {
    const {cases, judges, rate} = totals(block);
    const high = block.filter(row => category(rateOf(row), reference) === 'Alta movimentação').length;
    const regionCounts = new Map();
    for (const row of block) {
      const region = searchKey(row.region);
      regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
    }
    return {
      rows:block, order, size:block.length, high, low:block.length - high, cases, capacity:Math.round(judges * 10000),
      balance:cases - judges * reference, rate, regionCounts,
      region:regionCounts.size === 1 ? regionCounts.keys().next().value : null, city:searchKey(block[0].city)
    };
  });
  if (!items.some(item => item.high) || !items.some(item => item.low)) {
    if (geography === 'distance') return [];
    throw new Error('Não é possível formar grupos de alta e baixa movimentação: a base não contém ambas as categorias.');
  }
  const band = {lower:reference * LOWER, target:reference, upper:reference * UPPER, minimum};
  const initial = geography === 'distance' ? proximityGroups(items, maximum, maxGroups, band, distanceLimitKm, proximityLimitKm, minNearbyCities)
    : optimizeGroups(items, maximum, maxGroups, band, allowMix);
  if (geography === 'regions' && !allowMix && items.some(item => item.region === null))
    throw new Error('Uma cidade possui varas em sub-regiões distintas. Permita cruzamentos entre sub-regiões ou reveja a regra de manter a cidade inteira.');
  const compatible = (a,b) => allowMix || (a.region !== null && a.region === b.region && b.regionCounts.size === 1);
  const groups = geography === 'distance' ? initial : completeGroups(items,initial,maximum,maxGroups,band,compatible);
  const names = new Map();
  return groups.map(group => {
    const pure = group[0].region !== null && group.every(item => item.region === group[0].region);
    const prefix = geography === 'distance' ? geographicGroupPrefix(group.flatMap(item => item.rows)) : pure ? group[0].rows[0].region.slice(0, 130) : 'Entre subregiões';
    const normalized = searchKey(prefix);
    const index = (names.get(normalized) ?? 0) + 1;
    names.set(normalized, index);
    return {id:uid(), name:`${prefix} ${index}`, members:group.flatMap(item => item.rows.map(row => row.id))};
  });
}

export function assignCourt(plan, rows, courtId, groupId) {
  const current = rows.find(row => row.id === courtId);
  const target = plan.groups.find(group => group.id === groupId);
  if (!current || (groupId && !target)) throw new Error('Selecione uma vara e um agrupamento válidos.');
  const ids = new Set(plan.cityLimit
    ? rows.filter(row => searchKey(row.city) === searchKey(current.city)).map(row => row.id)
    : [courtId]);
  const available = target?.members.filter(member => !ids.has(member));
  if (target && plan.cityLimit && available.length + ids.size > plan.cityLimit) {
    throw new Error(`As varas de ${current.city} ultrapassariam o limite de ${plan.cityLimit} no grupo “${target.name}”.`);
  }
  if (target && plan.geography === 'distance') {
    const included = new Set([...available, ...ids]);
    checkDistance(rows.filter(row => included.has(row.id)), plan.distanceLimitKm,plan.proximityLimitKm ?? plan.distanceLimitKm,plan.minNearbyCities ?? 1);
  }
  for (const group of plan.groups) {
    group.members = group === target ? [...available, ...ids] : group.members.filter(member => !ids.has(member));
  }
}

export function syncCourtCity(plan, rows, previous, item) {
  if (!plan.cityLimit) return;
  const city = searchKey(item.city);
  if (previous && searchKey(previous.city) === city) return;
  const peer = rows.find(row => row.id !== item.id && searchKey(row.city) === city);
  const anchor = peer ?? previous;
  const target = anchor && plan.groups.find(group => group.members.includes(anchor.id));
  assignCourt(plan, rows, item.id, target?.id);
}

export function newPlan(name) { return {id:uid(), name, groups:[], cityLimit:null, minSize:MIN_GROUP_SIZE, maxSize:MAX_GROUP_SIZE, maxGroups:MAX_GROUPS, geography:'regions', distanceLimitKm:null, proximityLimitKm:null, minNearbyCities:1}; }
export function createProject(rows = [], type = 'own') {
  const plan = newPlan('Proposta 1');
  return {version:1, type, rows, plans:[plan], active:plan.id};
}

export function demo() {
  const sample = [
    ['1ª Vara de Alto Verde', 'Alto Verde', 'Central', 1240, 2],
    ['2ª Vara de Alto Verde', 'Alto Verde', 'Central', 380, 1],
    ['Vara de Bela Vista', 'Bela Vista', 'Central', 700, 1],
    ['Vara de Vale Claro', 'Vale Claro', 'Central', 540, 1.5],
    ['1ª Vara de Rio Novo', 'Rio Novo', 'Norte', 1270, 2],
    ['2ª Vara de Rio Novo', 'Rio Novo', 'Norte', 710, 2],
    ['Vara de Lago Sereno', 'Lago Sereno', 'Norte', 430, 1],
    ['Vara de Santa Marina', 'Santa Marina', 'Norte', 580, 1],
    ['Vara de Campo Azul', 'Campo Azul', 'Sul', 603, 1],
    ['Vara de Monte Claro', 'Monte Claro', 'Sul', 385, 1],
    ['Vara de São Miguel do Vale', 'São Miguel do Vale', 'Sul', 1160, 2],
    ['Vara de Estrela Nova', 'Estrela Nova', 'Sul', 820, 2]
  ];
  const rows = sample.map(([name, city, region, cases, judges]) => court({name,city,region,cases,judges}));
  const project = createProject(rows, 'demo');
  project.plans[0].groups = propose(rows, totals(rows).rate, 4);
  return project;
}

export function validateProject(data) {
  if (data?.version !== 1 || !Array.isArray(data.rows) || data.rows.length > MAX_ROWS ||
      !Array.isArray(data.plans) || !data.plans.length || data.plans.length > 30 || !['own','demo'].includes(data.type))
    throw new Error('O arquivo não contém um projeto de agrupamentos válido.');
  const validId = value => typeof value === 'string' && /^[a-zA-Z\d-]{1,64}$/.test(value);
  const rows = [];
  const ids = new Set();
  for (const item of data.rows) {
    if (!validId(item.id) || ids.has(item.id)) throw new Error('Identificador de vara inválido ou duplicado.');
    const row = court(item);
    checkDuplicate(row, rows);
    ids.add(row.id);
    rows.push(row);
  }
  const planIds = new Set();
  const cities = courtsByCity(rows);
  const plans = data.plans.map(plan => {
    if (!validId(plan.id) || planIds.has(plan.id) || !Array.isArray(plan.groups) || plan.groups.length > 2500)
      throw new Error('Cenário inválido no arquivo.');
    planIds.add(plan.id);
    const cityLimit = plan.cityLimit ?? null;
    if (cityLimit !== null && !isGroupSize(cityLimit)) throw new Error('Limite de varas por grupo inválido no cenário.');
    const maxGroups = validMaxGroups(plan.maxGroups === undefined ? MAX_GROUPS : plan.maxGroups);
    const maxSize = plan.maxSize ?? cityLimit ?? MAX_GROUP_SIZE;
    const minSize = plan.minSize ?? MIN_GROUP_SIZE;
    if (!isGroupSize(maxSize) || (cityLimit && cityLimit !== maxSize)) throw new Error('Máximo de varas por agrupamento inválido no cenário.');
    if (!isGroupSize(minSize) || minSize > maxSize) throw new Error('Mínimo de varas por agrupamento inválido no cenário.');
    const geography = plan.geography ?? 'regions';
    if (!['regions','distance'].includes(geography)) throw new Error('Critério geográfico inválido no cenário.');
    const distanceLimitKm = geography === 'distance' ? validDistance(plan.distanceLimitKm) : null;
    const proximityLimitKm = geography === 'distance' ? (plan.proximityLimitKm ?? distanceLimitKm) : null;
    const minNearbyCities = plan.minNearbyCities ?? 1;
    if (geography === 'distance') validNeighborhood(distanceLimitKm,proximityLimitKm,minNearbyCities);
    if (geography === 'distance' && !cityLimit) throw new Error('O cenário por distância deve manter juntas as varas da mesma cidade.');
    const members = new Map();
    const groupIds = new Set();
    const groups = plan.groups.map(group => {
      if (!validId(group.id) || groupIds.has(group.id) || !Array.isArray(group.members))
        throw new Error('Agrupamento inválido no arquivo.');
      if (cityLimit && group.members.length > cityLimit) throw new Error('Um agrupamento excede o limite de varas previsto neste cenário.');
      if (geography === 'distance') checkDistance(rows.filter(row => group.members.includes(row.id)), distanceLimitKm,proximityLimitKm,minNearbyCities);
      groupIds.add(group.id);
      for (const id of group.members) {
        if (!ids.has(id) || members.has(id)) throw new Error('Vara inexistente ou alocada mais de uma vez no cenário.');
        members.set(id, group.id);
      }
      return {id:group.id, name:validName(group.name,'Nome do agrupamento'), members:[...group.members]};
    });
    if (cityLimit) {
      for (const block of cities.values()) {
        const groupId = members.get(block[0].id);
        if (block.some(row => members.get(row.id) !== groupId)) throw new Error(`O cenário divide as varas de ${block[0].city} com a regra de cidade ativa.`);
      }
    }
    return {id:plan.id, name:validName(plan.name,'Nome do cenário'),groups,cityLimit,minSize,maxSize,maxGroups,geography,distanceLimitKm,proximityLimitKm,minNearbyCities};
  });
  if (!planIds.has(data.active)) throw new Error('O cenário ativo é inválido.');
  return {version:1, rows, plans, active:data.active, type:data.type};
}
