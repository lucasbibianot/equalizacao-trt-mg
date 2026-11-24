import test from 'node:test';
import assert from 'node:assert/strict';
import {goalsChart} from '../dist/goals-chart.mjs';
import {court,createProject,assignCourt,allocate,totals} from '../dist/model.mjs';
const format={esc:String,percent:v=>(v*100).toFixed(2)+'%'};
const render=p=>goalsChart(allocate(p.rows,p.plans[0].groups,totals(p.rows).rate,p.plans[0].minSize),format);
test('Gráfico acompanha vínculo e remoção manual inclusive composição em montagem',()=>{
 const rows=[150,50].map((cases,i)=>court({name:'Vara '+i,city:'Cidade '+i,region:'R',cases,judges:1}));
 const p=createProject(rows),plan=p.plans[0];
 plan.groups=[{id:'g',name:'Grupo teste',members:[]}];
 assert.ok(!render(p).includes('goal-point'));
 assignCourt(plan,rows,rows[0].id,'g');
 assert.match(render(p),/150.00%/);
 assert.match(render(p),/Em montagem/);
 assignCourt(plan,rows,rows[1].id,'g');
 assert.match(render(p),/100.00%/);
 assert.ok(!render(p).includes('Em montagem'));
 assignCourt(plan,rows,rows[0].id,null);
 assert.match(render(p),/50.00%/);
 assert.match(render(p),/Em montagem/);
 assignCourt(plan,rows,rows[1].id,null);
 assert.ok(!render(p).includes('goal-point'));
});
test('Gráfico exibe todos os grupos, inclusive os intermediários após ajuste',()=>{
 const groups=Array.from({length:15},(_,i)=>({name:'Grupo '+i,relative:.5+i/10,status:'inside',complete:true}));
 const html=goalsChart(groups,format);
 assert.equal((html.match(/class="goal-point /g)||[]).length,15);
 assert.match(html,/Grupo 7/);
});
