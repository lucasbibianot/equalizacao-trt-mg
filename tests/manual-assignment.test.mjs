import test from 'node:test';
import assert from 'node:assert/strict';
import {court,createProject,assignCourt,validateProject,propose,totals,recommendedGroups} from '../dist/model.mjs';
const row=(city,cases,judges=1)=>court({city,cases,judges,name:city+' '+cases,region:'Teste'});

test('Vínculo manual aceita cidade distante e persiste a exceção sem relaxar a sugestão',()=>{
 const rows=[row('Belo Horizonte',150),row('Contagem',50),row('Uberlândia',160)];
 const p=createProject(rows),plan=p.plans[0];
 Object.assign(plan,{geography:'distance',distanceLimitKm:30,proximityLimitKm:20,minNearbyCities:1,cityLimit:10,maxSize:10});
 plan.groups=propose(rows,totals(rows).rate,10,plan);
 const group=plan.groups[0];assert.equal(group.members.length,2);
 assignCourt(plan,rows,rows[2].id,group.id);
 assert.equal(group.members.length,3);
 assert.equal(group.manualGeography,true);
 const restored=validateProject(JSON.parse(JSON.stringify(p)));
 assert.equal(restored.plans[0].groups[0].manualGeography,true);
 assert.equal(restored.plans[0].groups[0].members.length,3);
 const strict=structuredClone(p);delete strict.plans[0].groups[0].manualGeography;
 assert.throws(()=>validateProject(strict),/limite/);
 assert.equal(propose(rows,totals(rows).rate,10,plan).flatMap(g=>g.members).length,2);
 const invalid=structuredClone(p);invalid.plans[0].groups[0].manualGeography='true';
 assert.throws(()=>validateProject(invalid),/manual/);
});

test('Remover manualmente uma cidade intermediária preserva origem e destino ao restaurar',()=>{
 const rows=[row('Belo Horizonte',150),row('Contagem',50),row('Betim',160)];
 const p=createProject(rows),plan=p.plans[0];
 Object.assign(plan,{geography:'distance',distanceLimitKm:35,proximityLimitKm:20,minNearbyCities:1,cityLimit:10,maxSize:10});
 plan.groups=[{id:'g1',name:'Origem',members:rows.map(r=>r.id)},{id:'g2',name:'Destino',members:[]}];
 assignCourt(plan,rows,rows[1].id,'g2');
 assert.equal(validateProject(p).plans[0].groups[0].manualGeography,true);
 assert.equal(plan.groups[1].manualGeography,true);
});

test('Recomenda médias menores para alta e maiores para baixa, sem escolher pelo usuário',()=>{
 const rows=[row('Belo Horizonte',200),row('Contagem',50),row('Betim',240,4),row('Uberaba',180,2)];
 const p=createProject(rows),plan=p.plans[0];
 plan.groups=[{id:'g1',name:'Menor',members:[rows[2].id]},{id:'g2',name:'Maior',members:[rows[3].id]},{id:'g3',name:'Vazio',members:[]}];
 const before=JSON.stringify(p);
 assert.deepEqual(recommendedGroups(plan,rows,rows[0].id).map(g=>g.id),['g1','g2','g3']);
 assert.deepEqual(recommendedGroups(plan,rows,rows[1].id).map(g=>g.id),['g2','g1','g3']);
 assert.equal(recommendedGroups(plan,rows,rows[0].id)[0].rate,60);
 assert.equal(JSON.stringify(p),before);
});

test('Manual mantém cidade inteira e limite de tamanho; composição incompleta continua sinalizada',()=>{
 const rows=[row('Belo Horizonte',150),row('Belo Horizonte',160),row('Uberlândia',50)];
 const p=createProject(rows),plan=p.plans[0];
 Object.assign(plan,{geography:'distance',cityLimit:2,maxSize:2,distanceLimitKm:20});
 plan.groups=[{id:'g1',name:'Destino',members:[rows[2].id]}];
 const before=JSON.stringify(p);
 assert.throws(()=>assignCourt(plan,rows,rows[0].id,'g1'),/limite/);
 assert.equal(JSON.stringify(p),before);
 assignCourt(plan,rows,rows[2].id,null);
 assignCourt(plan,rows,rows[0].id,'g1');
 assert.deepEqual(new Set(plan.groups[0].members),new Set(rows.slice(0,2).map(r=>r.id)));
 assert.equal(recommendedGroups(plan,rows,rows[0].id)[0].complete,false);
 assert.equal(validateProject(p).plans[0].groups[0].members.length,2);
});
