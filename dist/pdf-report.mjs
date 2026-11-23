import {allocate,category,rateOf,searchKey,totals,validateProject} from './model.mjs';
import {geographicStats} from './geography.mjs';

export function buildPdfReport(project,{revision=null,generatedAt=new Date()}={}) {
  const p=validateProject(project);
  if (!p.rows.length) throw new Error('Cadastre ou importe a base de varas antes de gerar o PDF.');
  const reference=totals(p.rows);
  const summarize=rows => ({...totals(rows),rows:[...rows].sort((a,b)=>a.city.localeCompare(b.city,'pt-BR') || a.name.localeCompare(b.name,'pt-BR',{numeric:true})),
    cityCount:new Set(rows.map(row=>searchKey(row.city))).size,
    high:rows.filter(row=>category(rateOf(row),reference.rate)==='Alta movimentação').length,
    low:rows.filter(row=>category(rateOf(row),reference.rate)==='Baixa movimentação').length,
    geo:geographicStats(rows)});
  const regions=new Map();
  for(const row of p.rows) {
    const id=searchKey(row.region);
    if(!regions.has(id)) regions.set(id,{name:row.region,rows:[]});
    regions.get(id).rows.push(row);
  }
  const plan=p.plans.find(plan=>plan.id===p.active);
  const groups=allocate(p.rows,plan.groups,reference.rate,plan.minSize).map(group=>({...group,...summarize(group.rows)}));
  const assigned=new Set(groups.flatMap(group=>group.members));
  return {type:p.type,revision,generatedAt:new Date(generatedAt).toISOString(),reference,total:summarize(p.rows),
    regions:[...regions.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR',{numeric:true})).map(group=>({name:group.name,...summarize(group.rows)})),
    plan:{...plan,groups},assigned:assigned.size,unassigned:summarize(p.rows.filter(row=>!assigned.has(row.id)))};
}
