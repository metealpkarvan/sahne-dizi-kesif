import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||4182);
process.env.BETTER_AUTH_URL=`http://localhost:${port}`;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,`http://localhost:${port}`);
    if(url.pathname.startsWith('/api/')){
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2_000_000){res.writeHead(413).end();return;}chunks.push(chunk);}
      const request=new Request(url,{method:req.method,headers:{...req.headers,'x-forwarded-for':req.socket.remoteAddress||'127.0.0.1'},...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
      const mod=url.pathname.startsWith('/api/auth/')||url.pathname==='/api/auth-router'?await import('../api/auth-router.js'):await import('../api/community.js');
      const handler=mod[req.method];const response=handler?await handler(request):new Response('Method not allowed',{status:405});
      res.statusCode=response.status;response.headers.forEach((value,key)=>{if(key!=='set-cookie')res.setHeader(key,value);});
      const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
      res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    const filename=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!filename.startsWith(root+path.sep)||/\/(?:\.|api\/|server\/|node_modules\/|scripts\/|tests\/)/.test(filename.slice(root.length))){res.writeHead(404).end();return;}
    const info=await stat(filename);if(!info.isFile())throw Error('notfile');
    res.setHeader('Content-Type',types[path.extname(filename)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(await readFile(filename));
  }catch(error){if(req.url.startsWith('/api/'))console.error('API error:',error.message);res.writeHead(req.url.startsWith('/api/')?500:404,{'Content-Type':'application/json'}).end(JSON.stringify({error:'İstek tamamlanamadı.'}));}
}).listen(port,'127.0.0.1',()=>console.log(`Sahne local http://localhost:${port}`));
