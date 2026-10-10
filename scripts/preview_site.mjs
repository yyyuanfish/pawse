import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import gateway from '../api/gateway.mjs';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const root=resolve(project,process.argv.includes('--landing')?'site':'dist');
const port=Number(process.env.PORT||8895);
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){
    req.query=Object.fromEntries(url.searchParams);if(url.pathname!=='/api/gateway'||!req.query.route)req.query.route=url.pathname.slice(5);
    // Local preview already checks the incoming browser origin before using the HTTPS gateway contract.
    if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){res.writeHead(403).end();return;}
    if(req.headers.origin)req.headers.origin=`https://${req.headers.host}`;
    res.status=code=>{res.statusCode=code;return res;};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
    await gateway(req,res);return;
  }
  try{
    const pathname=url.pathname==='/landing'?'/index.html':decodeURIComponent(url.pathname);
    let path=resolve(root,'.'+pathname);if(!path.startsWith(root+'/')&&path!==root){res.writeHead(403).end();return;}
    if((await stat(path)).isDirectory())path=resolve(path,'index.html');
    res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[extname(path)]||'application/octet-stream');
    res.end(await readFile(path));
  }catch{res.writeHead(404).end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Pawse website preview: http://127.0.0.1:${port}`));
