import assert from 'node:assert/strict';
import {Writable} from 'node:stream';
import gateway,{BACKEND} from '../gateway/index.mjs';
function response(){const chunks=[];const out=new Writable({write(chunk,enc,done){chunks.push(chunk);done();}});out.headers={};out.setHeader=(k,v)=>out.headers[k]=v;out.text=()=>Buffer.concat(chunks).toString();return out;}
let sent;
globalThis.fetch=async(url,options)=>{sent={url:String(url),...options};return new Response(JSON.stringify({status:'ok'}),{headers:{'Content-Type':'application/json','Set-Cookie':'pawse_session=test; HttpOnly; Secure; SameSite=Strict'}});};
let res=response();await gateway({method:'POST',query:{route:'v1/voice/scripts'},headers:{host:'pawse.example',origin:'https://evil.example'},body:{}},res);assert.equal(res.statusCode,403);assert.equal(sent,undefined);
res=response();await gateway({method:'POST',query:{route:'v1/voice/scripts'},headers:{host:'pawse.example',origin:'https://pawse.example',cookie:'pawse_session=test','content-type':'application/json'},body:{message:'test'}},res);
assert.equal(sent.url,BACKEND+'/api/v1/voice/scripts');assert.equal(sent.headers.origin,BACKEND);assert.equal(sent.headers.cookie,'pawse_session=test');assert.equal(JSON.parse(sent.body).message,'test');assert.equal(res.headers['Set-Cookie'][0],'pawse_session=test; HttpOnly; Secure; SameSite=Strict');assert.equal(JSON.parse(res.text()).status,'ok');
sent=null;res=response();await gateway({method:'GET',query:{route:'https://evil.example'},headers:{}},res);assert.equal(res.statusCode,404);assert.equal(sent,null);
res=response();await gateway({method:'POST',query:{route:'v1/vision/observations'},headers:{host:'pawse.example'},body:'x'.repeat(4500001)},res);assert.equal(res.statusCode,413);
res=response();await gateway({method:'GET',url:'/api/v1/health?language=de',headers:{host:'pawse.example'}},res);assert.equal(sent.url,BACKEND+'/api/v1/health?language=de');assert.equal(res.statusCode,200);
console.log('Website gateway checks passed: fixed origin, CSRF rejection, session forwarding and upload size.');
