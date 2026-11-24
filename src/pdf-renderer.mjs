import {jsPDF} from 'jspdf';
import {autoTable} from 'jspdf-autotable';
import {category,courtsByCity,rateOf,statusText,totals} from '../dist/model.mjs';

const n=(value,digits=0)=>Number.isFinite(value)?new Intl.NumberFormat('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value):'-';
const navy=[16,33,59],teal=[23,110,114],gray=[82,97,112];
const relative=(group,report)=>report.reference.rate?group.rate/report.reference.rate:null;
const percent=value=>value===null?'-':n(value*100,1)+'%';
const km=value=>value===null?'-':n(value,1)+' km';

function courtNames(rows) {
  const numbers=rows.map(row=>Number(row.name.match(/ - (\d+)a Vara$/)?.[1]));
  if(numbers.some(number=>!Number.isInteger(number)||number<1)) return rows.map(row=>row.name).join('; ');
  numbers.sort((a,b)=>a-b);
  if(numbers.length>=3 && numbers.every((number,i)=>number===numbers[0]+i))
    return `${numbers[0]}ª a ${numbers.at(-1)}ª Varas`;
  return numbers.map(number=>number+'ª').join(', ')+(numbers.length===1?' Vara':' Varas');
}

function cityRows(rows,report,origins=false) {
  return [...courtsByCity(rows).values()].map(block=>{
    const stats=totals(block);
    const high=block.filter(row=>category(rateOf(row),report.reference.rate)==='Alta movimentação').length;
    const origin=origins?'\n'+[...new Set(block.map(row=>row.region))].join(', '):'';
    const geographicRegions=[...new Set(block.map(row=>row.geographicRegion).filter(Boolean))].join(' / ') || 'Região não identificada';
    return [block[0].city+'\n'+geographicRegions+origin,courtNames(block),n(block.length),n(stats.cases),n(stats.judges,2),n(stats.rate,2),`${high} / ${block.length-high}`];
  });
}

function layout(doc) {
  const margin=42,width=doc.internal.pageSize.getWidth()-84,bottom=doc.internal.pageSize.getHeight()-48;
  let y=62;
  const page=()=>{doc.addPage();y=62;};
  const room=height=>{if(y+height>bottom)page();};
  const write=(text,size=10,{bold=false,color=navy,gap=8}={})=>{
    doc.setFont('Report',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...color);
    const lines=doc.splitTextToSize(String(text),width);
    for(const line of lines){room(size*1.5);doc.text(line,margin,y);y+=size*1.5;}
    y+=gap;
  };
  const title=(text)=>{room(65);write(text,16,{bold:true,gap:12});};
  const table=(head,body,ratios,caption)=>{
    if(!body.length){write('Nenhum registro neste recorte.',10,{color:gray});return;}
    room(80);
    const startPage=doc.getNumberOfPages();
    autoTable(doc,{head:[head],body,startY:y,margin:{left:margin,right:margin,top:76,bottom:48},
      tableWidth:width,showHead:'everyPage',rowPageBreak:'avoid',theme:'striped',
      styles:{font:'Report',fontSize:8,cellPadding:5,overflow:'linebreak',textColor:navy,valign:'top'},
      headStyles:{fillColor:navy,textColor:[255,255,255],fontStyle:'bold',fontSize:7.5},
      alternateRowStyles:{fillColor:[242,246,249]},
      columnStyles:Object.fromEntries(ratios.map((ratio,i)=>[i,{cellWidth:width*ratio,halign:i>=2?'right':'left'}])),
      willDrawPage:()=>{
        if(doc.getCurrentPageInfo().pageNumber>startPage){
          doc.setFont('Report','bold');doc.setFontSize(8);doc.setTextColor(...teal);
          doc.text(doc.splitTextToSize(caption+' (continuação)',width),margin,54);
        }
      }});
    y=doc.lastAutoTable.finalY+16;
  };
  const compositionRoom=(title,rows,ratios,meta,status)=>{
    const lines=(text,size,cellWidth)=>{doc.setFont('Report','normal');doc.setFontSize(size);return doc.splitTextToSize(String(text),cellWidth).length;};
    const bodyHeight=rows.reduce((sum,row)=>sum+Math.max(...row.map((cell,i)=>lines(cell,8,width*ratios[i]-10)))*9.2+10,0);
    const height=lines(title,12,width)*18+lines(meta,8.5,width)*12.75+bodyHeight+65+(status?22:0);
    // Keep ordinary group compositions together; long tables still paginate.
    if(height<bottom-62) room(height);
    else room(150);
  };
  return {write,title,table,page,room,compositionRoom};
}

function overview(layout,groups,report,proposal=false) {
  layout.table(['Recorte','Varas','Cidades','Casos novos','Juízes*','Casos/juiz','% geral','Alta / baixa'],
    groups.map((group,i)=>[proposal?`G${String(i+1).padStart(2,'0')}`:group.name,n(group.rows.length),n(group.cityCount),n(group.cases),n(group.judges,2),n(group.rate,2),percent(relative(group,report)),`${group.high} / ${group.low}`]),
    [.19,.07,.09,.14,.12,.14,.12,.13],proposal?'Quadro do cenário ativo':'Quadro das sub-regiões');
}

function composition(layout,group,report,title,origins=false) {
  const meta=`${group.rows.length} varas | ${group.cityCount} municípios | ${n(group.cases)} casos | ${n(group.judges,2)} juízes*\nMédia: ${n(group.rate,2)} casos/juiz (${percent(relative(group,report))} da geral) | Alta/baixa: ${group.high} / ${group.low}\nDistâncias: média ${km(group.geo.mean)}; máxima ${km(group.geo.maximum)}.`;
  const body=cityRows(group.rows,report,origins),ratios=[.25,.21,.06,.13,.11,.14,.10];
  layout.compositionRoom(title,body,ratios,meta,'status' in group);
  layout.write(title,12,{bold:true,color:teal});
  layout.write(meta,8.5,{color:gray});
  if(group.complete===false) layout.write('Em montagem: ainda não atende ao mínimo de varas e/ou à composição de alta e baixa movimentação.',9,{color:[166,82,18]});
  if('status' in group) layout.write('Situação: '+(group.complete?statusText[group.status]:'Em montagem'),8.5,{color:gray});
  layout.table(['Município'+(origins?' / origem':''),'Varas integrantes','Nº','Casos novos','Juízes*','Casos/juiz','Alta / baixa'],body,ratios,title);
}

function introduction(layout,report) {
  layout.write('Subsídio à análise da Corregedoria',11,{bold:true,color:teal});
  layout.write('Sub-regiões e composição\ndas Varas do Trabalho',24,{bold:true,gap:12});
  layout.write('Organização cadastrada e cenário ativo de equalização',11);
  layout.write('Conhecimento - 2025 | Gerado em '+new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(report.generatedAt)),8.5,{color:gray});
  if(report.type==='demo') layout.write('BASE DEMONSTRATIVA: dados e nomes fictícios. Não usar como informação oficial do Tribunal.',11,{bold:true,color:[166,82,18]});
  layout.title('Síntese da base');
  layout.write(`${report.total.rows.length} varas | ${report.regions.length} sub-regiões | ${report.total.cityCount} municípios-sede\n${n(report.total.cases)} casos novos | ${n(report.total.judges,2)} juízes*\nMédia geral: ${n(report.reference.rate,2)} casos novos por juiz.`,11);
  layout.title('Cenário ativo');
  layout.write(report.plan.name,12,{bold:true});
  layout.write(`${report.plan.groups.length} grupos | ${report.assigned} varas alocadas (${percent(report.assigned/report.total.rows.length)}) | ${report.unassigned.rows.length} varas sem agrupamento.`);
  const inside=report.plan.groups.filter(group=>group.complete && group.status==='inside').length;
  const pending=report.plan.groups.filter(group=>!group.complete).length;
  layout.write(`${inside} grupos na faixa de 95% a 105% da média geral. ${pending} grupos em montagem.`);
  layout.write('Este relatório apresenta a base inteira, sem aplicar os filtros ou a paginação da tela. A Parte I reproduz as sub-regiões cadastradas; a Parte II apresenta o cenário ativo; a Parte III identifica as varas sem grupo.');
  layout.write('Levantamento descritivo para análise. O cenário é exploratório e não representa deliberação ou proposta aprovada. A vinculação às sub-regiões reproduz o cadastro informado, sem revisão normativa neste relatório.',9,{color:gray});
}

function criteria(layout,report) {
  layout.title('Critérios de leitura');
  layout.write('Casos novos: conhecimento de 2025, conforme a base do simulador.\nJuízes*: quantidade informada por vara, que admite frações; não equivale necessariamente ao número de magistrados distintos.\nMédia: soma dos casos novos dividida pela soma da quantidade de juízes cadastrada.\nAlta movimentação: casos por juiz iguais ou superiores à média geral. Baixa: valores abaixo da média geral. A classificação representa carga nesta base, não desempenho.');
  layout.write(`Faixa de referência: ${n(report.reference.rate*.95,2)} a ${n(report.reference.rate*1.05,2)} casos por juiz. Percentuais usam a mesma média geral em todos os recortes. Distâncias são em linha reta entre sedes municipais.`,9,{color:gray});
}

function parameters(layout,report) {
  const plan=report.plan;
  layout.write(`De ${plan.minSize} a ${plan.maxSize} varas por grupo | máximo de ${plan.maxGroups} grupos | ${plan.cityLimit?'varas da mesma cidade mantidas juntas':'alocação individual de varas'}.`,9);
  if(plan.geography==='distance') {
    layout.write(`Proximidade: ${n(plan.proximityLimitKm??plan.distanceLimitKm)} km | mínimo de ${plan.minNearbyCities??1} cidade(s) vizinha(s) | teto entre quaisquer duas cidades: ${n(plan.distanceLimitKm)} km.`,9);
    layout.write('Na sugestão automática, cada cidade deve atender ao mínimo de vizinhas e a rede deve ser conectada; uma cidade isolada no grupo é dispensada da regra de vizinhança. Sugestões em ambos os modos podem deixar varas sem agrupamento. Ajustes manuais são dispensados das regras geográficas e do máximo de varas, mantendo as distâncias observadas no relatório.');
  } else layout.write('Critério: sub-regiões cadastradas. Os agrupamentos podem combinar sub-regiões conforme a composição salva.');
}

function pageLabels(doc,report) {
  const pages=doc.getNumberOfPages(),width=doc.internal.pageSize.getWidth(),height=doc.internal.pageSize.getHeight();
  for(let i=1;i<=pages;i++) {
    doc.setPage(i);doc.setFont('Report','bold');doc.setFontSize(8);doc.setTextColor(...navy);
    doc.text('TRIBUNAL REGIONAL DO TRABALHO DA 3ª REGIÃO',42,27);
    doc.setDrawColor(...teal);doc.line(42,35,width-42,35);
    doc.setDrawColor(205,215,225);doc.line(42,height-34,width-42,height-34);
    doc.setFont('Report','normal');doc.setFontSize(7);doc.setTextColor(...gray);
    doc.text('TRT-MG | DIESTAD | '+(report.type==='demo'?'Base demonstrativa':'Base cadastrada')+(report.revision===null?'':` | Revisão ${report.revision}`),42,height-22);
    doc.text(`${i} / ${pages}`,width-42,height-22,{align:'right'});
  }
}

export function renderReportPdf(report,fonts) {
  const doc=new jsPDF({unit:'pt',format:'a4',compress:true,putOnlyUsedFonts:true});
  for(const [style,name] of [['normal','DejaVuSans'],['bold','DejaVuSans-Bold']]) {
    doc.addFileToVFS(name+'.ttf',fonts[style]);doc.addFont(name+'.ttf','Report',style);
  }
  doc.setProperties({title:'Sub-regiões e composição das Varas do Trabalho - TRT-MG',author:'DIESTAD | TRT-MG',subject:'Base de conhecimento de 2025 e cenário ativo'});
  const l=layout(doc);
  introduction(l,report);l.page();criteria(l,report);
  l.title('Parte I | Sub-regiões cadastradas');overview(l,report.regions,report);
  for(const region of report.regions) composition(l,region,report,region.name);
  l.page();l.title('Parte II | Cenário ativo');l.write(report.plan.name,12,{bold:true});
  parameters(l,report);overview(l,report.plan.groups,report,true);
  for(const [i,group] of report.plan.groups.entries()) {
    composition(l,group,report,`G${String(i+1).padStart(2,'0')} | ${group.name}${group.manualGeography || group.manualSize ? ' | Ajuste manual' : ''}`);
  }
  l.page();l.title('Parte III | Varas sem agrupamento');
  l.write(`${report.unassigned.rows.length} varas permanecem sem grupo no cenário ativo. Elas continuam na base e nas sub-regiões da Parte I. A ausência de alocação não comprova impossibilidade de agrupamento com outra composição ou outros parâmetros.`);
  if(report.unassigned.rows.length)composition(l,report.unassigned,report,'Composição das varas sem grupo',true);
  l.title('Fonte e rastreabilidade');
  l.write(`Base carregada no Simulador de Equalização do TRT-MG${report.revision===null?'':`, revisão ${report.revision}`}. Universo: ${report.total.rows.length} varas. Cenário ativo: ${report.plan.name}. Nenhum outro cenário salvo foi incluído. A geração não altera a base ou as composições.`,9);
  l.write('Valores calculados com a precisão da base e arredondados somente na apresentação. Nomes geográficos dos grupos são rótulos do cenário, não delimitações de competência territorial.',8.5,{color:gray});
  pageLabels(doc,report);
  return doc.output('arraybuffer');
}
