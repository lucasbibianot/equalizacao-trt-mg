import { propose } from './model.mjs';

self.onmessage = ({data:{rows,reference,maximum,options}}) => {
  try { self.postMessage({groups:propose(rows,reference,maximum,options)}); }
  catch (error) { self.postMessage({error:error.message}); }
};
