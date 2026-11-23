// Bounded constraint search: coverage is mandatory; geography and capacity are
// hard constraints. Exhausting the budget is not proof of infeasibility.
export function completeGroups(items, initial, maximum, maxGroups, band, compatible) {
  const size = group => group.reduce((sum,item) => sum + item.size,0);
  const complete = group => size(group) >= band.minimum && group.some(item => item.high) && group.some(item => item.low);
  const assigned = new Set(initial.flat());
  if (assigned.size === items.length && initial.every(complete)) return initial;
  const conflicts = new Map(items.map(item => [item,items.filter(other => !compatible(item,other)).length]));
  const ordered = [...items].sort((a,b) => conflicts.get(b)-conflicts.get(a) || b.size-a.size || a.city.localeCompare(b.city,'pt-BR') || a.order-b.order);
  let budget = 150000;
  const attempt = (seed,count) => {
    const groups = seed.map(group => [...group]);
    while (groups.length < count) groups.push([]);
    const used = new Set(seed.flat());
    const rest = ordered.filter(item => !used.has(item));
    const remaining = Array(rest.length+1).fill(0);
    for (let i = rest.length-1; i >= 0; i--) remaining[i] = remaining[i+1]+rest[i].size;
    const visit = index => {
      if (--budget < 0) return false;
      if (index === rest.length) return groups.every(complete);
      const sizes = groups.map(size);
      if (sizes.reduce((sum,n)=>sum+Math.max(0,band.minimum-n),0) > remaining[index]) return false;
      if (sizes.reduce((sum,n)=>sum+maximum-n,0) < remaining[index]) return false;
      const needHigh = groups.filter(group => !group.some(item=>item.high)).length;
      const needLow = groups.filter(group => !group.some(item=>item.low)).length;
      const available = rest.slice(index);
      if (needHigh > available.filter(item=>item.high).length || needLow > available.filter(item=>item.low).length) return false;
      const item = rest[index];
      const choices = [];
      let emptySeen = false;
      for (let i=0;i<groups.length;i++) {
        const group = groups[i];
        if (!group.length) { if (emptySeen) continue; emptySeen = true; }
        if (sizes[i]+item.size > maximum || !group.every(other=>compatible(item,other))) continue;
        const fills = Number(!group.some(x=>x.high) && !!item.high)+Number(!group.some(x=>x.low) && !!item.low);
        const cases = group.reduce((sum,x)=>sum+x.cases,0)+item.cases;
        const capacity = group.reduce((sum,x)=>sum+x.capacity,0)+item.capacity;
        choices.push({i,fills,deviation:Math.abs(cases*10000/capacity-band.target)});
      }
      choices.sort((a,b)=>b.fills-a.fills || a.deviation-b.deviation || a.i-b.i);
      for (const {i} of choices) {
        groups[i].push(item);
        if (visit(index+1)) return true;
        groups[i].pop();
        if (budget < 0) break;
      }
      return false;
    };
    return visit(0) ? groups : null;
  };
  const total = size(items);
  const minimumCount = Math.max(1,Math.ceil(total/maximum));
  const maximumCount = Math.min(maxGroups,Math.floor(total/band.minimum));
  // Try rebuilding first: fixing partial groups can make a valid partition
  // unreachable, or consume the entire search budget.
  for (let count=minimumCount;count<=maximumCount && budget>0;count++) {
    const result = attempt([],count);
    if (result) return result;
  }
  throw new Error('Não foi encontrada uma composição que aloque todas as varas e respeite os critérios. Nenhuma sugestão parcial foi aplicada. Revise o limite de distância, o tamanho dos grupos ou o critério de sub-região. A busca é limitada e não comprova que a composição seja impossível.');
}
