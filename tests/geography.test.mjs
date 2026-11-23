import test from 'node:test';
import assert from 'node:assert/strict';
import { geographicStats, locateCity, distanceKm } from '../dist/geography.mjs';
import { court, createProject, propose, totals, validateProject, assignCourt, demo } from '../dist/model.mjs';

const row = (city,cases,index=0,region='Central') => court({city,cases,name:`${city} ${index}`,region,judges:1});

test('Média usa pares de cidades distintas, sem ponderar por varas', () => {
  const rows = [row('Belo Horizonte',150),row('Belo Horizonte',50,1),row('Contagem',50),row('Betim',150)];
  const stats = geographicStats(rows);
  const [a,b,c] = ['Belo Horizonte','Contagem','Betim'].map(locateCity);
  assert.equal(stats.pairs,3);
  assert.ok(Math.abs(stats.mean - (distanceKm(a,b)+distanceKm(a,c)+distanceKm(b,c))/3) < 1e-9);
  assert.equal(geographicStats(rows.slice(0,2)).mean,null);
  assert.equal(geographicStats(rows.slice(0,2)).maximum,0);
  assert.equal(locateCity('  belo HORIZONTE ').name,'Belo Horizonte');
});

test('Coordenadas desconhecidas ficam explícitas, sem estimativa', () => {
  const stats = geographicStats([row('Cidade fictícia',100),row('Betim',100),row('Contagem',100)]);
  assert.deepEqual(stats.missing,['Cidade fictícia']);
  assert.equal(stats.pairs,1);
  assert.equal(stats.maximum,null);
});

test('Limiar impede encadeamento e independe da sub-região', () => {
  const rows = [row('Belo Horizonte',150,0,'Leste'),row('Contagem',50,0,'Oeste'),row('Betim',150)];
  const partial = propose(rows,totals(rows).rate,10,{geography:'distance',distanceLimitKm:25});
  assert.equal(partial.flatMap(group=>group.members).length,2);
  for (const group of partial) assert.ok(geographicStats(rows.filter(row=>group.members.includes(row.id))).maximum <= 25);
  const groups = propose(rows,totals(rows).rate,10,{geography:'distance',distanceLimitKm:35});
  assert.ok(groups.length);
  assert.equal(groups[0].members.length,3);
  assert.ok(groups.some(group => group.members.includes(rows[0].id) && group.members.includes(rows[1].id)));
  for (const group of groups) assert.ok(geographicStats(rows.filter(row => group.members.includes(row.id))).maximum <= 35);
  assert.deepEqual(propose(rows,totals(rows).rate,10,{geography:'distance',distanceLimitKm:1}),[]);
});

test('Cidade inteira, limite de tamanho, persistência e alocação manual', () => {
  const rows = [row('Belo Horizonte',150),row('Belo Horizonte',50,1),row('Contagem',50),row('Uberlândia',150),row('Cidade fictícia',100)];
  const project = createProject(rows);
  const plan = project.plans[0];
  Object.assign(plan,{geography:'distance',distanceLimitKm:25,cityLimit:3,maxSize:3});
  const partial = propose(rows,totals(rows).rate,3,{geography:'distance',distanceLimitKm:25});
  assert.ok(partial.length);
  assert.ok(!partial.flatMap(group=>group.members).includes(rows[4].id));
  const validRows = rows.slice(0,3);
  project.rows = validRows;
  plan.groups = propose(validRows,totals(validRows).rate,3,{geography:'distance',distanceLimitKm:25});
  const restored = validateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(restored.plans[0].distanceLimitKm,25);
  const assigned = new Set(plan.groups.flatMap(group => group.members));
  assert.equal(assigned.has(rows[0].id),assigned.has(rows[1].id));
  assert.ok(!assigned.has(rows[4].id));
  assert.throws(() => assignCourt(plan,rows,rows[3].id,plan.groups[0].id),/limite/);
  assert.throws(() => assignCourt(plan,rows,rows[4].id,plan.groups[0].id),/limite|coordenadas/);
  assert.throws(() => propose(rows,100,3,{geography:'distance',distanceLimitKm:NaN}),/distância/);
  assert.equal(propose(validRows,100,2,{geography:'distance',distanceLimitKm:25})[0].members.length,2);
});

test('Alterações externas inválidas são rejeitadas e projetos antigos continuam válidos', () => {
  const project = createProject([row('Belo Horizonte',150),row('Uberlândia',50)]);
  const plan = project.plans[0];
  Object.assign(plan,{geography:'distance',distanceLimitKm:10,cityLimit:10,maxSize:10,groups:[{id:'g1',name:'Grupo',members:project.rows.map(row=>row.id)}]});
  assert.throws(() => validateProject(project),/distância|limite/);
  const old = demo();
  for (const plan of old.plans) { delete plan.geography; delete plan.distanceLimitKm; }
  assert.equal(validateProject(old).plans[0].geography,'regions');
});

test('Preserva grupos equilibrados quando a união mais próxima pioraria a cobertura', () => {
  const rows = [row('Belo Horizonte',150),row('Belo Horizonte',50,1),row('Contagem',50),row('Betim',150)];
  const groups = propose(rows,100,60,{geography:'distance',distanceLimitKm:25});
  assert.equal(groups.length,2);
  assert.equal(groups.flatMap(group => group.members).length,4);
  for (const group of groups) {
    const members = rows.filter(row => group.members.includes(row.id));
    assert.equal(totals(members).rate,100);
    assert.ok(geographicStats(members).maximum <= 25);
  }
  const plan = {...createProject(rows).plans[0],geography:'distance',distanceLimitKm:25,cityLimit:60,maxSize:60,groups};
  const bh = groups.find(group => group.members.includes(rows[0].id));
  assert.throws(() => assignCourt(plan,rows,rows[3].id,bh.id),/ultrapassa o limite/);
});


test('Sugestão regional cobre todas as varas mesmo fora da faixa ideal', () => {
  const rows = [row('Belo Horizonte',200),row('Contagem',50),row('Betim',50),row('Uberaba',50)];
  const groups = propose(rows,totals(rows).rate,4);
  assert.equal(new Set(groups.flatMap(group=>group.members)).size,rows.length);
  assert.equal(groups.flatMap(group=>group.members).length,rows.length);
});

test('Falhas de cobertura não modificam o cenário existente', () => {
  const rows = [row('Belo Horizonte',150),row('Uberlândia',50)];
  rows[1].region = 'Outra região';
  const project = createProject(rows);
  const previous = JSON.stringify(project);
  assert.throws(() => propose(rows,100,2,{geography:'regions',allowMix:false}), /Nenhuma sugestão parcial|ambas as categorias/);
  assert.equal(JSON.stringify(project),previous);
  const oversized = [row('Belo Horizonte',150),row('Belo Horizonte',50,1),row('Belo Horizonte',100,2)];
  assert.throws(() => propose(oversized,100,2,{keepCityTogether:true}), /excede o máximo/);
  const many = Array.from({length:19},(_,i)=>row('Belo Horizonte',i%2 ? 50 : 150,i));
  assert.throws(() => propose(many,totals(many).rate,2), /até 9 grupos/);
});


test('Distância aceita base maior que a capacidade e mantém cidades grandes inteiras sem grupo', () => {
  const rows = [row('Belo Horizonte',150),row('Belo Horizonte',50,1),row('Belo Horizonte',100,2),row('Contagem',50),row('Betim',150)];
  const groups = propose(rows,100,2,{geography:'distance',distanceLimitKm:25});
  assert.equal(groups.flatMap(group=>group.members).length,2);
  for (const group of groups) assert.ok(group.members.every(id=>rows.slice(3).some(row=>row.id===id)));
  assert.deepEqual(propose(rows,100,2,{geography:'distance',distanceLimitKm:1}),[]);
});

const chainRows = () => [row('Belo Horizonte',150),row('Contagem',50),row('Betim',150)];
test('Vizinhança permite cadeia conectada, respeitando o teto entre todos os pares', () => {
  const rows = chainRows();
  const groups = propose(rows,totals(rows).rate,10,{geography:'distance',distanceLimitKm:35,proximityLimitKm:20,minNearbyCities:1});
  assert.equal(groups.flatMap(group=>group.members).length,3);
  const strict = propose(rows,totals(rows).rate,10,{geography:'distance',distanceLimitKm:25,proximityLimitKm:20,minNearbyCities:1});
  assert.equal(strict.flatMap(group=>group.members).length,2);
});

test('Cada cidade precisa do mínimo de vizinhas distintas, sem contar suas próprias varas', () => {
  const rows = chainRows();
  const options={geography:'distance',distanceLimitKm:35,proximityLimitKm:20,minNearbyCities:2};
  assert.deepEqual(propose(rows,totals(rows).rate,10,options),[]);
  const triangle=propose(rows,totals(rows).rate,10,{...options,proximityLimitKm:35});
  assert.equal(triangle[0].members.length,3);
  const single=[row('Belo Horizonte',150),row('Belo Horizonte',50,1)];
  assert.equal(propose(single,100,10,options)[0].members.length,2);
});

test('Não reúne componentes desconectados mesmo dentro do teto máximo', () => {
  const rows=[row('Belo Horizonte',150),row('Contagem',50),row('Uberaba',150),row('Uberlândia',50)];
  const groups=propose(rows,100,10,{geography:'distance',distanceLimitKm:600,proximityLimitKm:110,minNearbyCities:1,maxGroups:1});
  assert.equal(groups.length,1);
  assert.equal(groups[0].members.length,2);
});

test('Persiste regras de vizinhança, valida importação e alocação manual', () => {
  const rows=chainRows(), project=createProject(rows), plan=project.plans[0];
  Object.assign(plan,{geography:'distance',cityLimit:10,maxSize:10,distanceLimitKm:35,proximityLimitKm:20,minNearbyCities:1});
  plan.groups=propose(rows,totals(rows).rate,10,plan);
  const restored=validateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(restored.plans[0].proximityLimitKm,20);
  assert.equal(restored.plans[0].minNearbyCities,1);
  const invalid=structuredClone(project);
  invalid.plans[0].minNearbyCities=2;
  assert.throws(()=>validateProject(invalid),/vizinhas/);
  const distant=row('Uberaba',50);
  assert.throws(()=>assignCourt(plan,[...rows,distant],distant.id,plan.groups[0].id),/limite/);
  plan.distanceLimitKm=600;
  assert.throws(()=>assignCourt(plan,[...rows,distant],distant.id,plan.groups[0].id),/rede conectada/);
  delete plan.proximityLimitKm;
  delete plan.minNearbyCities;
  const migrated=validateProject(project);
  assert.equal(migrated.plans[0].proximityLimitKm,600);
  assert.equal(migrated.plans[0].minNearbyCities,1);
  for (const minNearbyCities of [0,1.5,60,NaN]) assert.throws(()=>propose(rows,100,10,{geography:'distance',minNearbyCities}),/vizinhas/);
  assert.throws(()=>propose(rows,100,10,{geography:'distance',distanceLimitKm:20,proximityLimitKm:30}),/proximidade/);
});

test('Nomes por proximidade usam região do estado e cidade central, sem depender da sub-região judicial', () => {
  const rows=[row('Uberaba',150,0,'Sub-região de teste'),row('Uberlândia',50,0,'Outra sub-região')];
  const groups=propose(rows,100,4,{geography:'distance',distanceLimitKm:250});
  assert.match(groups[0].name,/Triângulo Mineiro\/Alto Paranaíba/);
  assert.match(groups[0].name,/Uberaba|Uberlândia/);
  assert.ok(!groups[0].name.includes('Sub-região de teste'));
  const reverse=propose([...rows].reverse(),100,4,{geography:'distance',distanceLimitKm:250});
  assert.equal(groups[0].name,reverse[0].name);
  const project=createProject(rows);
  Object.assign(project.plans[0],{geography:'distance',cityLimit:4,maxSize:4,distanceLimitKm:250,groups});
  assert.equal(validateProject(project).plans[0].groups[0].name,groups[0].name);
});

test('Nome identifica transição entre regiões e respeita o tamanho permitido', () => {
  const rows=[row('Belo Horizonte',150),row('Juiz de Fora',50)];
  const groups=propose(rows,100,4,{geography:'distance',distanceLimitKm:600});
  assert.match(groups[0].name,/Metropolitana de Belo Horizonte/);
  assert.match(groups[0].name,/Zona da Mata/);
  assert.ok(groups[0].name.length<=140);
});
