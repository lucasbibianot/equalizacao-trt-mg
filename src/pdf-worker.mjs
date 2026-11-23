import {buildPdfReport} from '../dist/pdf-report.mjs';
import {renderReportPdf} from './pdf-renderer.mjs';

async function font(name) {
  const response=await fetch(new URL(`./vendor/fonts/${name}.ttf`,import.meta.url));
  if(!response.ok) throw new Error('Não foi possível carregar as fontes do PDF. Recarregue a página e tente novamente.');
  const bytes=new Uint8Array(await response.arrayBuffer());
  let binary='';
  for(let i=0;i<bytes.length;i+=32768) binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(binary);
}

self.onmessage=async ({data:{project,revision,generatedAt}})=>{
  try {
    const report=buildPdfReport(project,{revision,generatedAt});
    const [normal,bold]=await Promise.all([font('DejaVuSans'),font('DejaVuSans-Bold')]);
    const buffer=renderReportPdf(report,{normal,bold});
    self.postMessage({buffer},[buffer]);
  } catch(error) {self.postMessage({error:error.message});}
};
