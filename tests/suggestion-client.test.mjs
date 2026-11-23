import test from 'node:test';
import assert from 'node:assert/strict';
import { runSuggestion } from '../dist/suggestion-client.mjs';
import { Worker as NodeWorker } from 'node:worker_threads';
import { court } from '../dist/model.mjs';

class FakeWorker {
  postMessage(request) { this.request = request; }
  terminate() { this.terminated = true; }
}

test('Cálculo é enviado ao worker e encerrado ao receber resultado', async () => {
  const worker = new FakeWorker();
  const pending = runSuggestion({rows:[], maximum:4},{createWorker:()=>worker});
  assert.equal(worker.request.maximum,4);
  worker.onmessage({data:{groups:[{members:['a','b']}]}});
  assert.deepEqual(await pending,[{members:['a','b']}]);
  assert.equal(worker.terminated,true);
});

test('Tentativa sem solução libera o worker e permite tentar novamente', async () => {
  const first = new FakeWorker();
  const pending = runSuggestion({options:{distanceLimitKm:1}},{createWorker:()=>first});
  first.onmessage({data:{error:'Não foi encontrada uma composição completa.'}});
  await assert.rejects(pending,/composição completa/);
  assert.equal(first.terminated,true);
  const second = new FakeWorker();
  const retry = runSuggestion({options:{distanceLimitKm:250}},{createWorker:()=>second});
  second.onmessage({data:{groups:[{members:['a','b']}]}});
  assert.equal((await retry).length,1);
  assert.equal(second.terminated,true);
});

test('Tempo limite interrompe cálculo e permite nova tentativa', async () => {
  const worker = new FakeWorker();
  await assert.rejects(runSuggestion({}, {createWorker:()=>worker,timeoutMs:10}),/tempo limite/);
  assert.equal(worker.terminated,true);
});

test('Fechar formulário cancela cálculo pendente', async () => {
  const controller = new AbortController();
  const worker = new FakeWorker();
  const pending = runSuggestion({}, {createWorker:()=>worker,signal:controller.signal});
  controller.abort();
  await assert.rejects(pending,/cancelada/);
  assert.equal(worker.terminated,true);
});

test('Erro no worker libera recursos', async () => {
  const worker = new FakeWorker();
  const pending = runSuggestion({}, {createWorker:()=>worker});
  worker.onerror({preventDefault(){}});
  await assert.rejects(pending,/calcular/);
  assert.equal(worker.terminated,true);
});

test('Worker real: erro, resultado vazio e nova tentativa com 250 km', async () => {
  const workerURL = new URL('../dist/suggestion-worker.mjs',import.meta.url).href;
  const createWorker = () => {
    const bridge = new NodeWorker(`
      const {parentPort} = require('node:worker_threads');
      globalThis.self = {postMessage:data=>parentPort.postMessage(data)};
      import(${JSON.stringify(workerURL)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));
    `,{eval:true});
    const browserWorker = {
      postMessage:request=>bridge.postMessage(request),
      terminate:()=>bridge.terminate()
    };
    bridge.on('message',data=>browserWorker.onmessage?.({data}));
    bridge.on('error',error=>browserWorker.onerror?.(error));
    return browserWorker;
  };
  const rows = ['Belo Horizonte','Contagem','Uberaba','Uberlândia'].map((city,i) =>
    court({name:city,city,region:'Região',cases:i%2 ? 50 : 150,judges:1}));
  const request = {rows,reference:100,maximum:4,options:{geography:'distance',distanceLimitKm:0}};
  await assert.rejects(runSuggestion(request,{createWorker}),/distância/);
  request.options.distanceLimitKm = 1;
  assert.deepEqual(await runSuggestion(request,{createWorker}),[]);
  request.options.distanceLimitKm = 250;
  request.options.maxGroups = 1;
  const limited = await runSuggestion(request,{createWorker});
  assert.equal(limited.length,1);
  assert.equal(limited[0].members.length,2);
  request.options.maxGroups = 2;
  const groups = await runSuggestion(request,{createWorker});
  assert.deepEqual(new Set(groups.flatMap(group=>group.members)),new Set(rows.map(row=>row.id)));
});
