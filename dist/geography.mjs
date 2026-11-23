import municipalities from './municipalities-mg.mjs';

const normalize = value => String(value).trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
const coordinates = new Map(municipalities.map(city => [normalize(city.name), city]));
export const locateCity = name => coordinates.get(normalize(name)) ?? null;

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

export function checkDistance(rows, maximum) {
  const stats = geographicStats(rows);
  if (stats.missing.length) throw new Error(`Sem coordenadas para: ${stats.missing.join(', ')}. Confira os nomes das cidades de Minas Gerais.`);
  if (stats.maximum !== null && stats.maximum > maximum + 1e-9)
    throw new Error(`A composição ultrapassa o limite de ${maximum} km entre cidades (${stats.maximum.toFixed(1)} km).`);
}

// Complete linkage: each merge checks every cross-city pair. Stable tie breaking
// makes the heuristic reproducible, independent of the input row order.
export function proximityGroups(items, maximumSize, maxGroups, band, limit) {
  validDistance(limit);
  const known = items.filter(item => locateCity(item.rows[0].city)).sort((a,b) => a.city.localeCompare(b.city, 'pt-BR'));
  const distances = new Map();
  const between = (a,b) => {
    const key = [a.city,b.city].sort().join('|');
    if (!distances.has(key)) distances.set(key, distanceKm(locateCity(a.rows[0].city),locateCity(b.rows[0].city)));
    return distances.get(key);
  };
  const coverage = group => {
    if (group.size < band.minimum || !group.items.some(item => item.high) || !group.items.some(item => item.low)) return [0,0];
    const cases = group.items.reduce((sum,item) => sum + item.cases,0);
    const capacity = group.items.reduce((sum,item) => sum + item.capacity,0);
    const rate = cases * 10000 / capacity;
    return [rate >= band.lower - 1e-9 && rate <= band.upper + 1e-9 ? group.size : 0,group.size];
  };
  const compare = (a,b) => {
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i]-b[i]) > 1e-9) return Math.sign(a[i]-b[i]);
    return 0;
  };
  const select = clusters => clusters.filter(group => coverage(group)[1]).sort((a,b) =>
    compare([...coverage(b),-b.diameter],[...coverage(a),-a.diameter])).slice(0,maxGroups);
  const score = clusters => select(clusters).reduce((sum,group) => {
    const [inside,assigned] = coverage(group);
    return [sum[0]+inside,sum[1]+assigned,sum[2]-group.diameter];
  },[0,0,0]);
  const search = balanced => {
    const clusters = known.map(item => ({items:[item],size:item.size,diameter:0}));
    let bestPlan = select(clusters);
    while (true) {
      let best = null;
      for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
        const a = clusters[i], b = clusters[j];
        if (a.size + b.size > maximumSize) continue;
        const diameter = Math.max(a.diameter,b.diameter,...a.items.flatMap(x => b.items.map(y => between(x,y))));
        if (diameter > limit + 1e-9) continue;
        const merged = {items:[...a.items,...b.items],size:a.size+b.size,diameter};
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
