export function generatePdfFile(project,revision,{timeoutMs=60000,createWorker=()=>new Worker(new URL('./pdf-worker.mjs',import.meta.url),{type:'module'})}={}) {
  return new Promise((resolve,reject)=>{
    const worker=createWorker();
    const finish=(error,buffer)=>{
      clearTimeout(timer);
      worker.onmessage=worker.onerror=null;
      worker.terminate();
      if(error) reject(error); else resolve(buffer);
    };
    const timer=setTimeout(()=>finish(new Error('O PDF excedeu o tempo de geração. Tente novamente.')),timeoutMs);
    worker.onmessage=({data})=>data.error?finish(new Error(data.error)):finish(null,data.buffer);
    worker.onerror=event=>{event.preventDefault?.();finish(new Error('Não foi possível gerar o PDF. Tente novamente.'));};
    try {worker.postMessage({project,revision,generatedAt:new Date().toISOString()});}
    catch(error){finish(error);}
  });
}
