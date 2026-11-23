import test from 'node:test';
import assert from 'node:assert/strict';
import {court,createProject,newPlan} from '../dist/model.mjs';
import {generatePdfFile} from '../dist/pdf-client.mjs';
import {buildPdfReport} from '../dist/pdf-report.mjs';

function project() {
  const rows=[court({name:'1ª Vara de Contagem',city:'Contagem',region:'01ª Sub-Região',cases:150,judges:1}),
    court({name:'2ª Vara de Contagem',city:'Contagem',region:'01ª Sub-Região',cases:50,judges:1}),
    court({name:'Vara de Araxá',city:'Araxá',region:'03ª Sub-Região',cases:120,judges:1.5})];
  const p=createProject(rows);
  p.plans[0].groups=[{id:'group1',name:'Grupo salvo',members:rows.slice(0,2).map(row=>row.id)}];
  return p;
}

test('Relatório usa a base inteira, separa sub-regiões, cenário ativo e varas sem grupo', () => {
  const p=project(),r=buildPdfReport(p,{revision:12,generatedAt:'2026-11-23T20:00:00Z'});
  assert.equal(r.total.rows.length,3);
  assert.equal(r.total.cases,320);
  assert.equal(r.total.judges,3.5);
  assert.equal(r.regions.length,2);
  assert.equal(r.plan.groups[0].high,1);
  assert.equal(r.plan.groups[0].low,1);
  assert.equal(r.assigned,2);
  assert.deepEqual(r.unassigned.rows.map(row=>row.name),['Vara de Araxá']);
  assert.equal(r.revision,12);
  assert.equal(r.generatedAt,'2026-11-23T20:00:00.000Z');
});

test('Trocar cenário altera o relatório e a geração não modifica o projeto', () => {
  const p=project(),other=newPlan('Outro cenário');
  p.plans.push(other);p.active=other.id;
  const original=JSON.stringify(p),r=buildPdfReport(p);
  assert.equal(r.plan.name,'Outro cenário');
  assert.equal(r.assigned,0);
  assert.equal(r.unassigned.rows.length,3);
  assert.equal(JSON.stringify(p),original);
});

test('Identifica base demonstrativa, grupos incompletos e rejeita base vazia', () => {
  const p=project();p.type='demo';p.plans[0].groups[0].members.pop();
  const r=buildPdfReport(p);
  assert.equal(r.type,'demo');
  assert.equal(r.plan.groups[0].complete,false);
  assert.throws(()=>buildPdfReport(createProject()),/base|varas/);
});


class PdfWorker {
  postMessage(request){this.request=request;}
  terminate(){this.terminated=true;}
}

test('Exportação devolve o PDF do worker e preserva a revisão solicitada',async()=>{
  const worker=new PdfWorker(),data=project();
  const pending=generatePdfFile(data,15,{createWorker:()=>worker});
  assert.equal(worker.request.revision,15);
  assert.equal(worker.request.project.active,data.active);
  const buffer=new ArrayBuffer(8);worker.onmessage({data:{buffer}});
  assert.equal(await pending,buffer);assert.equal(worker.terminated,true);
});

test('Falha na geração e tempo limite encerram o worker e permitem nova tentativa',async()=>{
  const worker=new PdfWorker();
  const pending=generatePdfFile(project(),15,{createWorker:()=>worker});
  worker.onmessage({data:{error:'Fonte indisponível'}});
  await assert.rejects(pending,/Fonte indisponível/);assert.equal(worker.terminated,true);
  const retry=new PdfWorker();
  await assert.rejects(generatePdfFile(project(),15,{createWorker:()=>retry,timeoutMs:10}),/tempo/);
  assert.equal(retry.terminated,true);
});
