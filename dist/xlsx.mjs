import { parseRecords, searchKey } from './model.mjs';

const nodes = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));

async function readXml(archive, path, optional = false) {
  const entry = archive.file(path);
  if (!entry && optional) return null;
  if (!entry) throw new Error('O arquivo XLSX não contém a estrutura esperada.');
  const text = await entry.async('string');
  if (text.length > 25_000_000 || /<!DOCTYPE/i.test(text)) throw new Error('O conteúdo da planilha excede o limite suportado.');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (nodes(doc, 'parsererror').length) throw new Error('Não foi possível ler o conteúdo da planilha.');
  return doc;
}

function columnIndex(reference) {
  const letters = reference?.match(/^[A-Z]+/i)?.[0];
  if (!letters) return -1;
  let value = 0;
  for (const letter of letters.toUpperCase()) value = value * 26 + letter.charCodeAt(0) - 64;
  return value - 1;
}

export async function importXlsx(bytes) {
  let archive;
  try { archive = await window.JSZip.loadAsync(bytes); }
  catch { throw new Error('Selecione uma planilha XLSX válida e sem proteção de abertura.'); }
  const [book, rels, stringsFile] = await Promise.all([
    readXml(archive, 'xl/workbook.xml'), readXml(archive, 'xl/_rels/workbook.xml.rels'),
    readXml(archive, 'xl/sharedStrings.xml', true)
  ]);
  const sheets = nodes(book, 'sheet');
  const sheet = sheets.find(item => searchKey(item.getAttribute('name')) === 'importacao') ?? sheets[0];
  const id = Array.from(sheet?.attributes ?? []).find(a => a.localName === 'id')?.value;
  const rel = nodes(rels, 'Relationship').find(node => node.getAttribute('Id') === id);
  const rawPath = rel?.getAttribute('Target');
  if (!rawPath || rel.getAttribute('TargetMode') === 'External') throw new Error('Não foi possível localizar a aba de importação.');
  const url = new URL(rawPath, 'https://planilha.local/xl/workbook.xml');
  if (url.origin !== 'https://planilha.local' || !url.pathname.startsWith('/xl/')) throw new Error('A referência da aba de importação é inválida.');
  const sheetXml = await readXml(archive, decodeURIComponent(url.pathname.slice(1)));
  const shared = stringsFile ? nodes(stringsFile, 'si').map(item => nodes(item, 't').map(n => n.textContent).join('')) : [];
  const records = nodes(sheetXml, 'row').map((line, i) => {
    const row = [];
    row.line = Number(line.getAttribute('r')) || i + 1;
    for (const cell of nodes(line, 'c')) {
      const index = columnIndex(cell.getAttribute('r'));
      if (index < 0 || index > 511) continue;
      const kind = cell.getAttribute('t');
      const value = nodes(cell, 'v')[0]?.textContent;
      if (kind === 's') row[index] = shared[Number(value)] ?? '';
      else if (kind === 'inlineStr') row[index] = nodes(cell, 't').map(node => node.textContent).join('');
      else if (value === undefined || value === '') row[index] = '';
      else if (kind === 'str' || kind === 'e' || kind === 'b' || kind === 'd') row[index] = value;
      else {
        const numeric = Number(value);
        row[index] = Number.isFinite(numeric) ? numeric : value;
      }
    }
    return Object.assign(Array.from(row, value => value ?? ''), {line: row.line});
  });
  return parseRecords(records);
}
