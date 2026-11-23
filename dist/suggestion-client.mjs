export function runSuggestion(request, {
  signal,
  timeoutMs = 20000,
  createWorker = () => new Worker(new URL('./suggestion-worker.mjs', import.meta.url), {type:'module'})
} = {}) {
  return new Promise((resolve,reject) => {
    if (signal?.aborted) { reject(new Error('Busca cancelada.')); return; }
    const worker = createWorker();
    let finished = false;
    let timer;
    const finish = (error,groups) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort',cancel);
      worker.onmessage = worker.onerror = null;
      worker.terminate();
      if (error) reject(error);
      else resolve(groups);
    };
    const cancel = () => finish(new Error('Busca cancelada.'));
    signal?.addEventListener('abort',cancel,{once:true});
    timer = setTimeout(() => finish(new Error('A busca atingiu o tempo limite de 20 segundos. O cenário atual foi preservado. Ajuste os critérios e tente novamente.')),timeoutMs);
    worker.onmessage = ({data}) => data.error ? finish(new Error(data.error)) : finish(null,data.groups);
    worker.onerror = event => {
      event.preventDefault?.();
      finish(new Error('Não foi possível calcular a sugestão. O cenário atual foi preservado. Tente novamente.'));
    };
    try { worker.postMessage(request); }
    catch (error) { finish(error); }
  });
}
