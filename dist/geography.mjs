import municipalities from './municipalities-mg.mjs';
import { regionNames, municipalRegions } from './municipal-regions-mg.mjs';

const normalize = value => String(value).trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
const coordinates = new Map(municipalities.map(city => [normalize(city.name), city]));
export const locateCity = name => coordinates.get(normalize(name)) ?? null;
export const geographicRegionForCity = name => {
  const city=locateCity(name);
  return city ? regionNames[municipalRegions[city.ibge]] ?? '' : '';
};

export function geographicGroupPrefix(rows) {
  const cities = [...new Map(rows.map(row => [normalize(row.city),locateCity(row.city)])).values()]
    .filter(Boolean).sort((a,b) => a.name.localeCompare(b.name,'pt-BR'));
  if (!cities.length) return 'Proximidade geográfica';
  const regions = [...new Set(cities.map(city => regionNames[municipalRegions[city.ibge]]).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b,'pt-BR'));
  // Medoid of distinct cities: a large number of courts in one municipality
  // must not change the geographic label. Ties retain alphabetical ordering.
  const ranked = cities.map(city => ({city,sum:cities.reduce((sum,other)=>sum+distanceKm(city,other),0)}));
  ranked.sort((a,b) => Math.abs(a.sum-b.sum) > 1e-9 ? a.sum-b.sum : a.city.name.localeCompare(b.city.name,'pt-BR'));
  const anchor = ranked[0].city.name;
  const regionLabel = regions.length ? regions.slice(0,2).join(' + ') + (regions.length > 2 ? ` + outras (${regions.length} regiões)` : '') : 'Proximidade geográfica';
  const available = 130 - anchor.length - 3;
  const label = regionLabel.length > available ? regionLabel.slice(0,available-1).trimEnd() + '…' : regionLabel;
  return `${label} · ${anchor}`;
}

export function distanceKm(a, b) {
  const rad = degrees => degrees * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function geographicStats(rows) {
  const cities = [...new Map(rows.map(row => [normalize(row.city), row.city])).values()];
  const missing = cities.filter(city => !locateCity(city));
  const known = cities.map(locateCity).filter(Boolean);
  let pairs = 0, sum = 0, maximum = 0;
  for (let i = 0; i < known.length; i++) for (let j = i + 1; j < known.length; j++) {
    const distance = distanceKm(known[i], known[j]);
    sum += distance;
    maximum = Math.max(maximum, distance);
    pairs++;
  }
  return {cities:cities.length, located:known.length, missing, pairs,
    mean:pairs ? sum / pairs : null, maximum:missing.length || !known.length ? null : maximum};
}

export function validDistance(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 2000)
    throw new Error('Informe um limite de distância maior que zero e até 2.000 km.');
  return value;
}

export function validNeighborhood(maximum, proximity = maximum, minimum = 1) {
  validDistance(maximum);
  validDistance(proximity);
  if (proximity > maximum) throw new Error('A distância de proximidade deve ser menor ou igual à distância máxima interna.');
  if (!Number.isInteger(minimum) || minimum < 1 || minimum > 59)
    throw new Error('O mínimo de cidades vizinhas deve ser um inteiro entre 1 e 59.');
  return {proximity,minimum};
}

function networkInfo(vertices, nearby) {
  if (vertices.length < 2) return {connected:true,minimumNearby:0};
  const edges = vertices.map(() => []);
  for (let i=0;i<vertices.length;i++) for (let j=i+1;j<vertices.length;j++) {
    if (nearby(vertices[i],vertices[j])) { edges[i].push(j); edges[j].push(i); }
  }
  const seen = new Set([0]), queue = [0];
  for (let i=0;i<queue.length;i++) for (const next of edges[queue[i]]) {
    if (!seen.has(next)) { seen.add(next); queue.push(next); }
  }
  return {connected:seen.size === vertices.length,minimumNearby:Math.min(...edges.map(edge => edge.length))};
}

export function neighborhoodStats(rows, proximity) {
  const cities = [...new Map(rows.map(row => [normalize(row.city),row.city])).values()];
  const points = cities.map(locateCity);
  if (points.some(point => !point)) return {connected:false,minimumNearby:null};
  return networkInfo(points,(a,b) => distanceKm(a,b) <= proximity + 1e-9);
}

export function checkDistance(rows, maximum, proximity = maximum, minimum = 1) {
  validNeighborhood(maximum,proximity,minimum);
  const stats = geographicStats(rows);
  if (stats.missing.length) throw new Error(`Sem coordenadas para: ${stats.missing.join(', ')}. Confira os nomes das cidades de Minas Gerais.`);
  if (stats.maximum !== null && stats.maximum > maximum + 1e-9)
    throw new Error(`A composição ultrapassa o limite de ${maximum} km entre cidades (${stats.maximum.toFixed(1)} km).`);
  if (stats.cities < 2) return;
  const network = neighborhoodStats(rows,proximity);
  if (!network.connected) throw new Error('As cidades do grupo precisam formar uma rede conectada pela distância de proximidade.');
  if (network.minimumNearby < minimum)
    throw new Error(`Cada cidade precisa ter pelo menos ${minimum} cidades vizinhas a até ${proximity} km dentro do grupo.`);
}

// Connected proximity graph plus an all-pairs diameter cap. Intermediate
// clusters may lack the required degree; only valid final clusters are selected.
export function proximityGroups(items, maximumSize, maxGroups, band, limit, proximity = limit, minimumNearby = 1) {
  validNeighborhood(limit,proximity,minimumNearby);
  const known = items.filter(item => locateCity(item.rows[0].city)).sort((a,b) => a.city.localeCompare(b.city, 'pt-BR'));
  const distances = new Map();
  const between = (a,b) => {
    const key = [a.city,b.city].sort().join('|');
    if (!distances.has(key)) distances.set(key, distanceKm(locateCity(a.rows[0].city),locateCity(b.rows[0].city)));
    return distances.get(key);
  };
  const coverage = group => {
    if (group.size < band.minimum || !group.items.some(item => item.high) || !group.items.some(item => item.low) ||
      (group.items.length > 1 && group.minimumNearby < minimumNearby)) return [0,0];
    const cases = group.items.reduce((sum,item) => sum + item.cases,0);
    const capacity = group.items.reduce((sum,item) => sum + item.capacity,0);
    const rate = cases * 10000 / capacity;
    return [rate >= band.lower - 1e-9 && rate <= band.upper + 1e-9 ? group.size : 0,group.size];
  };
  const compare = (a,b) => {
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i]-b[i]) > 1e-9) return Math.sign(a[i]-b[i]);
    return 0;
  };
  const select = clusters => clusters.filter(group => coverage(group)[1]).sort((a,b) => {
    const [insideA,assignedA] = coverage(a), [insideB,assignedB] = coverage(b);
    return compare([assignedB,insideB,-b.diameter],[assignedA,insideA,-a.diameter]);
  }).slice(0,maxGroups);
  const score = clusters => select(clusters).reduce((sum,group) => {
    const [inside,assigned] = coverage(group);
    return [sum[0]+assigned,sum[1]+inside,sum[2]-group.diameter];
  },[0,0,0]);
  const search = balanced => {
    const clusters = known.map(item => ({items:[item],size:item.size,diameter:0,minimumNearby:0}));
    let bestPlan = select(clusters);
    while (true) {
      let best = null;
      for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
        const a = clusters[i], b = clusters[j];
        if (a.size + b.size > maximumSize) continue;
        const diameter = Math.max(a.diameter,b.diameter,...a.items.flatMap(x => b.items.map(y => between(x,y))));
        if (diameter > limit + 1e-9) continue;
        if (!a.items.some(x => b.items.some(y => between(x,y) <= proximity + 1e-9))) continue;
        const mergedItems = [...a.items,...b.items];
        const network = networkInfo(mergedItems,(x,y) => between(x,y) <= proximity + 1e-9);
        const merged = {items:mergedItems,size:a.size+b.size,diameter,minimumNearby:network.minimumNearby};
        const beforeA = coverage(a), beforeB = coverage(b), after = coverage(merged);
        const rank = balanced ? [after[0]-beforeA[0]-beforeB[0],after[1]-beforeA[1]-beforeB[1],-diameter] : [-diameter];
        if (!best || compare(rank,best.rank) > 0) best = {i,j,merged,rank};
      }
      if (!best || (balanced && best.rank[0] < 0)) break;
      clusters[best.i] = best.merged;
      clusters.splice(best.j,1);
      if (compare(score(clusters),score(bestPlan)) > 0) bestPlan = select(clusters);
    }
    return bestPlan;
  };
  const compact = search(false), balanced = search(true);
  return (compare(score(balanced),score(compact)) > 0 ? balanced : compact).map(group => group.items);
}
