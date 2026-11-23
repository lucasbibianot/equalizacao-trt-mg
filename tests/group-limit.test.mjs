import test from 'node:test';
import assert from 'node:assert/strict';
import municipalities from '../dist/municipalities-mg.mjs';
import {court,createProject,propose,validateProject} from '../dist/model.mjs';

const rows = municipalities.slice(0,10).flatMap(({name:city}) => [50,150].map((cases,i)=>
  court({name:`${city} ${i}`,city,region:'Região',cases,judges:1})));

test('Nove grupos por padrão; dez grupos permitem cobrir todas as cidades', () => {
  const options = {geography:'distance',distanceLimitKm:1};
  const standard = propose(rows,100,2,options);
  assert.equal(standard.length,9);
  assert.equal(standard.flatMap(group=>group.members).length,18);
  const expanded = propose(rows,100,2,{...options,maxGroups:10});
  assert.equal(expanded.length,10);
  assert.equal(new Set(expanded.flatMap(group=>group.members)).size,20);
  assert.equal(propose(rows,100,2,{...options,maxGroups:1}).length,1);
});

test('Limite configurável também vale para sugestões regionais', () => {
  assert.throws(()=>propose(rows,100,2),/até 9 grupos/);
  const groups = propose(rows,100,2,{maxGroups:10,keepCityTogether:true});
  assert.equal(groups.length,10);
  assert.equal(new Set(groups.flatMap(group=>group.members)).size,20);
});

test('Limite é persistido e cenários antigos assumem nove', () => {
  const project = createProject(rows);
  assert.equal(project.plans[0].maxGroups,9);
  project.plans[0].maxGroups = 15;
  assert.equal(validateProject(JSON.parse(JSON.stringify(project))).plans[0].maxGroups,15);
  delete project.plans[0].maxGroups;
  assert.equal(validateProject(project).plans[0].maxGroups,9);
});

test('Limite deve ser inteiro de 1 a 100, na sugestão e no arquivo', () => {
  for (const value of [0,-1,1.5,101,NaN,'10',null]) {
    assert.throws(()=>propose(rows,100,2,{maxGroups:value}),/grupos/);
    const project = createProject(rows);
    project.plans[0].maxGroups=value;
    assert.throws(()=>validateProject(project),/grupos/);
  }
});
