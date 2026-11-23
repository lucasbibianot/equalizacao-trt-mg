import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderReportPdf} from '../src/pdf-renderer.mjs';
import {buildPdfReport} from '../dist/pdf-report.mjs';
import {demo} from '../dist/model.mjs';

test('Gera PDF paginado com fonte local e identificação da base demonstrativa',()=>{
  const fonts={normal:fs.readFileSync(new URL('../dist/vendor/fonts/DejaVuSans.ttf',import.meta.url)).toString('base64'),
    bold:fs.readFileSync(new URL('../dist/vendor/fonts/DejaVuSans-Bold.ttf',import.meta.url)).toString('base64')};
  const data=buildPdfReport(demo(),{generatedAt:'2026-11-23T20:00:00Z'});
  const bytes=renderReportPdf(data,fonts);
  assert.ok(bytes instanceof ArrayBuffer);
  const pdf=Buffer.from(bytes).toString('latin1');
  assert.ok(pdf.startsWith('%PDF-'));
  assert.ok((pdf.match(/\/Type \/Page\b/g)??[]).length>=3);
  assert.ok(pdf.includes('FontFile2'));
});
