import test from 'node:test';
import assert from 'node:assert/strict';
import {court,createProject,validateProject,parseRecords,parseCSV,makeCSV,HEADERS,courtExportValues} from '../dist/model.mjs';

const base={name:'1ª Vara',city:'Uberlândia',region:'03ª Sub-Região',cases:150,judges:1.5};

test('Cadastro preenche região geográfica pelo município, separada da sub-região',()=>{
  const row=court(base);
  assert.equal(row.geographicRegion,'Triângulo Mineiro/Alto Paranaíba');
  assert.equal(row.region,'03ª Sub-Região');
  assert.equal(court({...base,city:'  belo horizonte '}).geographicRegion,'Metropolitana de Belo Horizonte');
  assert.throws(()=>court({...base,geographicRegion:'Zona da Mata'}),/região geográfica|Região geográfica/);
});

test('Cidade desconhecida permite informação manual e não inventa região',()=>{
  assert.equal(court({...base,city:'Cidade fictícia'}).geographicRegion,'');
  assert.equal(court({...base,city:'Cidade fictícia',geographicRegion:'Região informada'}).geographicRegion,'Região informada');
  assert.throws(()=>court({...base,city:'Cidade fictícia',geographicRegion:'x'.repeat(141)}),/Região geográfica/);
});

test('Importação antiga continua válida e coluna nova é reconhecida no XLSX/CSV',()=>{
  const old=[['Vara','Cidade sede','Subregião','Qtde casos novos 2025','Qtde juízes'],['Vara de teste','Uberlândia','03ª Sub-Região',150,1.5]];
  assert.equal(parseRecords(old)[0].geographicRegion,'Triângulo Mineiro/Alto Paranaíba');
  const current=[['Vara','Cidade','Subregião','Casos novos 2025','Juízes','Região geográfica'],['Vara fictícia','Cidade fictícia','09ª Sub-Região',100,1,'Região informada']];
  assert.equal(parseRecords(current)[0].geographicRegion,'Região informada');
  assert.equal(parseCSV(makeCSV(current))[0].geographicRegion,'Região informada');
  current[1][1]='Uberlândia';
  assert.throws(()=>parseRecords(current),/Linha 2.*[Rr]egião geográfica/);
});

test('CSV exportado reimporta a nova coluna sem deslocar valores e JSON preserva/migra',()=>{
  const row=court(base);
  assert.equal(HEADERS.length,courtExportValues(row).length);
  const [restored]=parseCSV(makeCSV([HEADERS,courtExportValues(row)]));
  assert.equal(restored.geographicRegion,row.geographicRegion);
  assert.equal(restored.cases,row.cases);assert.equal(restored.judges,row.judges);
  const project=createProject([row]);
  assert.equal(validateProject(JSON.parse(JSON.stringify(project))).rows[0].geographicRegion,row.geographicRegion);
  const expected=row.geographicRegion;
  delete project.rows[0].geographicRegion;
  assert.equal(validateProject(project).rows[0].geographicRegion,expected);
});
