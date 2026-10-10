// Fixed Cloud Run origin; credentials and application state stay on the backend.
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
export const BACKEND='https://pawse-114215092948.europe-west6.run.app';
export default async function handler(req,res){
  const route=Array.isArray(req.query?.route)?req.query.route.join('/'):req.query?.route;
  if(typeof route!=='string'||!/^v1\/[a-zA-Z0-9/_-]+$/.test(route)){res.status(404).json({detail:'Unknown API route.'});return;}
  if(!['GET','POST','PUT','PATCH','DELETE','HEAD'].includes(req.method)){res.status(405).end();return;}
  const origin=req.headers.origin;
  if(origin && origin!==`https://${req.headers.host}`){res.status(403).json({detail:'Cross-origin request rejected.'});return;}
  const url=new URL(`${BACKEND}/api/${route}`);
  for(const [k,v] of Object.entries(req.query||{})){if(k!=='route'&&typeof v==='string')url.searchParams.set(k,v);}
  const headers={};
  for(const k of ['content-type','accept','cookie'])if(req.headers[k])headers[k]=req.headers[k];
  if(origin)headers.origin=BACKEND;
  let body;
  if(!['GET','HEAD'].includes(req.method)){
    if(req.body!==undefined)body=Buffer.isBuffer(req.body)?req.body:typeof req.body==='string'?req.body:JSON.stringify(req.body);
    else{const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>4500000){res.status(413).end();return;}chunks.push(chunk);}body=Buffer.concat(chunks);}
    if(Buffer.byteLength(body)>4500000){res.status(413).end();return;}
  }
  try{
    const upstream=await fetch(url,{method:req.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(55000)});
    res.statusCode=upstream.status;
    for(const k of ['content-type','cache-control','x-content-type-options']){const v=upstream.headers.get(k);if(v)res.setHeader(k,v);}
    res.setHeader('Cache-Control','no-store');
    const cookies=upstream.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
    if(upstream.body)await pipeline(Readable.fromWeb(upstream.body),res);else res.end();
  }catch{if(!res.headersSent)res.status(502).json({detail:'The live backend is unavailable. Please retry shortly.'});else res.end();}
}
