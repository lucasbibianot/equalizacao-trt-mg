const EMPTY_SCORE = [0, 0, 0, 0, 0, 0, 0, 0];
const EPSILON = 1e-9;
const ROUNDS = 7;

function add(a, b) {
  return a.map((value, index) => value + b[index]);
}

function change(score, before, after) {
  return score.map((value, index) => value - before[index] + after[index]);
}

function compare(a, b) {
  for (let i = 0; i < a.length; i++) {
    const difference = a[i] - b[i];
    if (Math.abs(difference) > EPSILON) return Math.sign(difference);
  }
  return 0;
}

const courtCount = group => group.reduce((size, item) => size + item.size, 0);
const hasBothCategories = group => group.some(item => item.high) && group.some(item => item.low);
const isComplete = (group, minimum) => courtCount(group) >= minimum && hasBothCategories(group);

function groupScore(group, band) {
  const size = courtCount(group);
  if (size < band.minimum || !hasBothCategories(group)) return EMPTY_SCORE;
  let cases = 0;
  let capacity = 0;
  const regions = new Map();
  const cities = new Set();
  for (const item of group) {
    cases += item.cases;
    capacity += item.capacity;
    for (const [region, count] of item.regionCounts) regions.set(region, (regions.get(region) ?? 0) + count);
    cities.add(item.city);
  }
  const rate = cases * 10000 / capacity;
  const outside = Math.max(0, band.lower - rate, rate - band.upper);
  const scale = band.target || 1;
  const predominant = Math.max(...regions.values());
  // Scores compare lexicographically. Coverage comes first, followed by geography,
  // then the number of assigned courts and the distance from the target.
  return [
    outside <= EPSILON ? size : 0,
    1 - regions.size,
    predominant - size,
    regions.size > 1 ? -1 : 0,
    size,
    -outside / scale * size,
    -Math.abs(rate - band.target) / scale * size,
    1 - cities.size
  ];
}

function solution(groups, band) {
  return {groups, score:groups.reduce((sum, group) => add(sum, groupScore(group, band)), EMPTY_SCORE)};
}

const byRegionAndCity = (a, b) => (a.region ?? '').localeCompare(b.region ?? '', 'pt-BR') ||
  a.city.localeCompare(b.city, 'pt-BR') || a.order - b.order;
const byRate = (a, b) => a.rate - b.rate || a.order - b.order;
const byMovement = (a, b) => Math.abs(b.balance) - Math.abs(a.balance) || a.order - b.order;

function capacities(n, count, maxSize) {
  const used = Math.min(n, count * maxSize);
  const base = Math.floor(used / count);
  const rest = used % count;
  return Array.from({length:count}, (_, index) => base + (index < rest ? 1 : 0));
}

function sequential(items, sizes) {
  let start = 0;
  return sizes.map(size => {
    const group = items.slice(start, start + size);
    start += size;
    return group;
  });
}

function sequentialBlocks(items, maximum) {
  const groups = [];
  let current;
  let used = 0;
  for (const block of items) {
    if (!current || used + block.size > maximum) {
      current = [];
      groups.push(current);
      used = 0;
    }
    current.push(block);
    used += block.size;
  }
  return groups;
}

function fillBins(initial, sizes, items, byGeography, minimum = 0) {
  const bins = initial.map((group, index) => ({
    items:[...group], maximum:sizes[index], used:courtCount(group),
    balance:group.reduce((sum, item) => sum + item.balance, 0),
    capacity:group.reduce((sum, item) => sum + item.capacity, 0),
    high:group.some(item => item.high), low:group.some(item => item.low),
    regions:new Set(group.flatMap(item => [...item.regionCounts.keys()])), cities:new Set(group.map(item => item.city))
  }));
  let open = bins.filter(bin => bin.used < bin.maximum);
  for (const item of items) {
    if (!open.length) break;
    let best;
    let bestScore;
    for (const bin of open) {
      if (bin.used + item.size > bin.maximum) continue;
      let newRegions = 0;
      for (const region of item.regionCounts.keys()) if (!bin.regions.has(region)) newRegions++;
      const geographic = newRegions * 2 + (newRegions === 0 && !bin.cities.has(item.city) ? 1 : 0);
      const distance = Math.abs(bin.balance + item.balance) / (bin.capacity + item.capacity);
      const difference = distance - Math.abs(bin.balance) / bin.capacity;
      const completes = Number(!(bin.high && bin.low) && (bin.high || item.high) && (bin.low || item.low));
      const needsCourts = Number(bin.used < minimum);
      const score = byGeography
        ? [completes, needsCourts, -geographic, -distance, -difference]
        : [completes, needsCourts, -difference, -distance, -geographic];
      if (!best || compare(score, bestScore) > 0) {
        best = bin;
        bestScore = score;
      }
    }
    if (!best) continue;
    best.items.push(item);
    best.used += item.size;
    best.balance += item.balance;
    best.capacity += item.capacity;
    best.high ||= Boolean(item.high);
    best.low ||= Boolean(item.low);
    for (const region of item.regionCounts.keys()) best.regions.add(region);
    best.cities.add(item.city);
    if (best.used === best.maximum) open = open.filter(bin => bin !== best);
  }
  return bins.map(bin => bin.items);
}

function distribute(items, sizes, byGeography) {
  return fillBins(items.slice(0, sizes.length).map(item => [item]), sizes, items.slice(sizes.length), byGeography);
}

function starters(items, maximum, count, band) {
  const ready = [];
  const used = new Set();
  const pairBand = {...band, minimum:2};
  for (let i = 0; i < count; i++) {
    const available = items.filter(item => !used.has(item));
    const high = sample(available.filter(item => !item.low), 12);
    const low = sample(available.filter(item => !item.high), 12);
    const mixedCities = sample(available.filter(item => item.high && item.low), 12);
    const candidates = mixedCities.map(item => [item]);
    for (const a of high) for (const b of low) if (a.size + b.size <= maximum) candidates.push([a,b]);
    let best;
    let bestScore;
    for (const candidate of candidates) {
      const score = groupScore(candidate, pairBand);
      if (!best || compare(score, bestScore) > 0) {
        best = candidate;
        bestScore = score;
      }
    }
    if (!best) break;
    ready.push(best);
    for (const item of best) used.add(item);
  }
  return ready;
}

function seeds(items, maximum, maxGroups, band) {
  const extreme = [...items].sort(byMovement);
  const centered = [...extreme].reverse();
  const geographic = [...items].sort(byRegionAndCity);
  const uniform = items.every(item => item.size === 1);
  const largest = uniform ? extreme : [...items].sort((a,b) => b.size - a.size || byMovement(a,b));
  const count = Math.min(maxGroups, items.length, Math.floor(courtCount(items) / band.minimum));
  const ready = starters(extreme, maximum, count, band);
  const candidates = [];
  for (let groupCount = 1; groupCount <= count; groupCount++) {
    const sizes = uniform ? capacities(items.length, groupCount, maximum) : Array(groupCount).fill(maximum);
    const variants = [
      distribute(extreme, sizes, false),
      distribute(centered, sizes, false),
      distribute(geographic, sizes, true)
    ];
    if (uniform) variants.push(sequential(geographic, sizes));
    else variants.push(distribute(largest, sizes, false), sequentialBlocks(geographic, maximum).slice(0, groupCount));
    if (groupCount <= ready.length) {
      const initial = ready.slice(0, groupCount);
      const used = new Set(initial.flat());
      const remaining = extreme.filter(item => !used.has(item));
      variants.push(fillBins(initial, sizes, remaining, true, band.minimum));
    }
    for (const groups of variants) {
      const valid = groups.filter(group => isComplete(group, band.minimum));
      const slots = valid.length;
      if (!slots) continue;
      const candidate = solution(valid, band);
      if (!candidates[slots] || compare(candidate.score, candidates[slots].score) > 0) candidates[slots] = candidate;
    }
  }
  return candidates;
}

function groupByRegion(items) {
  const regions = new Map();
  for (const item of items) {
    if (item.region === null) continue;
    if (!regions.has(item.region)) regions.set(item.region, []);
    regions.get(item.region).push(item);
  }
  return [...regions.values()];
}

function regionalSolution(regions, maximum, maxGroups, band) {
  const empty = {groups:[], score:EMPTY_SCORE};
  let plans = [empty];
  for (const region of regions) {
    if (!isComplete(region, band.minimum)) continue;
    const options = seeds(region, maximum, maxGroups, band);
    options[0] = empty;
    const next = [];
    for (const [used, previous] of plans.entries()) {
      if (!previous) continue;
      for (const [slots, option] of options.entries()) {
        if (used + slots > maxGroups) break;
        if (!option) continue;
        const score = add(previous.score, option.score);
        if (!next[used + slots] || compare(score, next[used + slots].score) > 0)
          next[used + slots] = {groups:[...previous.groups, ...option.groups], score};
      }
    }
    plans = next;
  }
  return plans.reduce((best, option) => compare(option.score, best.score) > 0 ? option : best, empty);
}

function compactRegions(regions, maximum, maxGroups, band) {
  const blocks = regions.flatMap(region => {
    const sorted = [...region].sort(byRegionAndCity);
    if (sorted.some(item => item.size > 1)) return sequentialBlocks(sorted, maximum);
    const count = Math.ceil(region.length / maximum);
    return sequential(sorted, capacities(region.length, count, maximum));
  }).map(group => ({group, size:courtCount(group), score:groupScore(group, band)}));
  blocks.sort((a, b) => compare(b.score, a.score));
  const bins = blocks.slice(0, maxGroups * 4);
  while (bins.length > maxGroups) {
    let best;
    for (let i = 0; i < bins.length; i++) {
      for (let j = i + 1; j < bins.length; j++) {
        const size = bins[i].size + bins[j].size;
        if (size > maximum) continue;
        const group = [...bins[i].group, ...bins[j].group];
        const score = groupScore(group, band);
        const delta = change(EMPTY_SCORE, add(bins[i].score, bins[j].score), score);
        if (!best || compare(delta, best.delta) > 0) best = {i,j,group,size,score,delta};
      }
    }
    if (best) {
      bins[best.i] = {group:best.group, size:best.size, score:best.score};
      bins.splice(best.j, 1);
    } else {
      bins.sort((a, b) => compare(b.score, a.score));
      bins.pop();
    }
  }
  return solution(bins.map(bin => bin.group).filter(group => isComplete(group, band.minimum)), band);
}

function sample(items, limit) {
  if (items.length <= limit) return items;
  const ordered = [...items].sort(byRate);
  return Array.from({length:limit}, (_, i) => ordered[Math.round(i * (ordered.length - 1) / (limit - 1))]);
}

function replaceOne(group, previous, next) {
  return group.map(item => item === previous ? next : item);
}

function refine(initial, items, maximum, maxGroups, band, allowMix) {
  let current = initial;
  for (let round = 0; round < ROUNDS; round++) {
    const groups = current.groups;
    const assigned = new Set(groups.flat());
    const rest = items.filter(item => !assigned.has(item));
    const scores = groups.map(group => groupScore(group, band));
    const samples = groups.map(group => sample(group, 10));
    const sizes = groups.map(courtCount);
    let bestScore = current.score;
    let edit = null;

    const consider = (i, a, j = -1, b = []) => {
      if (courtCount(a) > maximum || courtCount(b) > maximum) return;
      const sa = groupScore(a, band);
      const sb = groupScore(b, band);
      if (!allowMix && (sa[1] || sb[1])) return;
      const without = add(scores[i] ?? EMPTY_SCORE, scores[j] ?? EMPTY_SCORE);
      const withChanges = add(sa, sb);
      const score = change(current.score, without, withChanges);
      if (compare(score, bestScore) <= 0) return;
      bestScore = score;
      edit = {i,a,j,b};
    };

    for (let i = 0; i < groups.length; i++) {
      const a = groups[i];
      const regions = new Set(a.flatMap(item => [...item.regionCounts.keys()]));
      const nearby = rest.filter(item => item.region !== null && regions.has(item.region));
      const reserve = [...new Set([...sample(nearby, 12), ...(allowMix ? sample(rest, 12) : [])])];
      for (const row of reserve) {
        if (sizes[i] + row.size <= maximum) consider(i, [...a, row]);
        for (const original of samples[i]) consider(i, replaceOne(a, original, row));
      }
      for (let j = i + 1; j < groups.length; j++) {
        const b = groups[j];
        if (!allowMix && a[0].region !== b[0].region) continue;
        if (sizes[i] + sizes[j] <= maximum) consider(i, [...a, ...b], j);
        for (const x of samples[i]) {
          if (sizes[j] + x.size <= maximum) consider(i, a.filter(item => item !== x), j, [...b, x]);
          for (const y of samples[j]) consider(i, replaceOne(a, x, y), j, replaceOne(b, y, x));
        }
        for (const y of samples[j]) if (sizes[i] + y.size <= maximum) consider(i, [...a, y], j, b.filter(item => item !== y));
      }
    }
    if (allowMix && maxGroups > groups.length) {
      const pool = sample(rest, 24);
      for (let i = 0; i < pool.length; i++) {
        if (pool[i].size >= band.minimum) consider(groups.length, [pool[i]]);
        for (let j = i + 1; j < pool.length; j++) consider(groups.length, [pool[i], pool[j]]);
      }
    }
    if (!edit) break;
    const next = [...groups];
    next[edit.i] = edit.a;
    if (edit.j >= 0) next[edit.j] = edit.b;
    current = {groups:next.filter(group => isComplete(group, band.minimum)), score:bestScore};
  }
  return current;
}

export function optimizeGroups(items, maximum, maxGroups, band, allowMix) {
  const regions = groupByRegion(items);
  const pure = refine(regionalSolution(regions, maximum, maxGroups, band), items, maximum, maxGroups, band, false);
  if (!allowMix || pure.score[0] === courtCount(items)) return pure.groups;

  const regionalMerge = compactRegions(regions, maximum, maxGroups, band);
  const alternatives = [...seeds(items, maximum, maxGroups, band).filter(Boolean), regionalMerge]
    .sort((a, b) => compare(b.score, a.score)).slice(0, 2);
  const fromRegions = refine(pure, items, maximum, maxGroups, band, true);
  const candidates = [fromRegions, ...alternatives.map(seed => refine(seed, items, maximum, maxGroups, band, true))];
  const mixed = candidates.reduce((best, candidate) => compare(candidate.score, best.score) > 0 ? candidate : best, pure);
  return mixed.score[0] > pure.score[0] ? mixed.groups : pure.groups;
}
