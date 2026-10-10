// Fixed Cloud Run origin; credentials and application state stay on the backend.
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
export const BACKEND='https://pawse-329984198357.europe-west6.run.app';
function reply(res,status,data){res.statusCode=status;if(data!==undefined){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));}else res.end();}
export default async function handler(req,res){
  const parsed=new URL(req.url||'/','https://pawse.invalid');
  if(parsed.pathname.startsWith('/api/v1/'))req.query={...Object.fromEntries(parsed.searchParams),route:parsed.pathname.slice(5)};
  const route=Array.isArray(req.query?.route)?req.query.route.join('/'):req.query?.route;
  if(typeof route!=='string'||!/^v1\/[a-zA-Z0-9/_-]+$/.test(route)){reply(res,404,{detail:'Unknown API route.'});return;}
  if(!['GET','POST','PUT','PATCH','DELETE','HEAD'].includes(req.method)){reply(res,405);return;}
  const origin=req.headers.origin;
  if(origin && origin!==`https://${req.headers.host}`){reply(res,403,{detail:'Cross-origin request rejected.'});return;}
  const url=new URL(`${BACKEND}/api/${route}`);
  for(const [k,v] of Object.entries(req.query||{})){if(k!=='route'&&typeof v==='string')url.searchParams.set(k,v);}
  const headers={};
  for(const k of ['content-type','accept','cookie'])if(req.headers[k])headers[k]=req.headers[k];
  if(origin)headers.origin=BACKEND;
  let body;
  if(!['GET','HEAD'].includes(req.method)){
    if(req.body!==undefined)body=Buffer.isBuffer(req.body)?req.body:typeof req.body==='string'?req.body:JSON.stringify(req.body);
    else{const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>4500000){reply(res,413);return;}chunks.push(chunk);}body=Buffer.concat(chunks);}
    if(Buffer.byteLength(body)>4500000){reply(res,413);return;}
  }
  try{
    const upstream=await fetch(url,{method:req.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(55000)});
    res.statusCode=upstream.status;
    for(const k of ['content-type','cache-control','x-content-type-options']){const v=upstream.headers.get(k);if(v)res.setHeader(k,v);}
    res.setHeader('Cache-Control','no-store');
    const cookies=upstream.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
    if(upstream.body)await pipeline(Readable.fromWeb(upstream.body),res);else res.end();
  }catch{if(!res.headersSent)reply(res,502,{detail:'The live backend is unavailable. Please retry shortly.'});else res.end();}
}
