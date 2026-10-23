import express from 'express';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Store } from './store.js';
import { DomainError } from './domain.js';
import { PushService } from './notifications.js';

const app=express(), store=new Store(), push=new PushService(store);
if(process.env.TRUST_PROXY==='1') app.set('trust proxy',1);
app.disable('x-powered-by');
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'");
  const password=process.env.APP_PASSWORD;
  if(password) {
    const expected=Buffer.from(`admin:${password}`), given=Buffer.from((req.headers.authorization||'').replace(/^Basic /,'') ,'base64');
    if(given.length!==expected.length||!timingSafeEqual(given,expected)){res.setHeader('WWW-Authenticate','Basic realm="Mouse Nook", charset="UTF-8"');res.status(401).send('请登录受控小窝');return;}
  }
  next();
});
app.use('/api',(req,res,next)=>{
  res.setHeader('Cache-Control','no-store');
  if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
    const origin=req.headers.origin;
    const allowed=new Set([process.env.APP_ORIGIN,`http://127.0.0.1:${process.env.PORT||3001}`,`http://localhost:${process.env.PORT||3001}`,...(process.env.NODE_ENV!=='production'?['http://127.0.0.1:5173','http://localhost:5173']:[])].filter(Boolean));
    if(origin && !allowed.has(origin)){ res.status(403).json({error:'来源不被允许'});return; }
    if(!req.is('application/json')){res.status(415).json({error:'请使用 JSON 请求'});return;}
  }
  next();
});
app.use(express.json({limit:'256kb'}));
app.get('/api/health',(_req,res)=>res.json({ok:true,service:'mouse-nook'}));
app.get('/api/state',(_req,res)=>res.json(store.snapshot()));
const commandSchema=z.object({type:z.string().min(1).max(80),payload:z.record(z.any()),opId:z.string().uuid(),expectedRevision:z.number().int().nonnegative()}).strict();
app.post('/api/commands',(req,res,next)=>{
  try { const command=commandSchema.parse(req.body); res.json(store.execute(command)); void push.tick().catch(()=>{}); }catch(e){next(e);}
});
app.get('/api/notifications',(_req,res)=>res.json(push.status()));
app.post('/api/notifications/subscribe',(req,res,next)=>{try{push.subscribe(req.body);res.json({ok:true});}catch(e){next(new DomainError((e as Error).message));}});
app.post('/api/notifications/unsubscribe',(req,res)=>{push.remove(String(req.body.endpoint||''));res.json({ok:true});});
app.post('/api/notifications/test',(req,res,next)=>{try{const id=push.test(String(req.body.endpoint||''));res.json({id,status:'pending'});void push.tick().catch(()=>{});}catch(e){next(new DomainError((e as Error).message));}});
app.use('/api',(_req,res)=>res.status(404).json({error:'接口不存在'}));
const dist=resolve('dist');
if(existsSync(dist)) {
  app.use(express.static(dist,{maxAge:'1h',setHeaders:(res,path)=>{if(/sw\.js|index\.html|webmanifest/.test(path))res.setHeader('Cache-Control','no-cache');if(/\/assets\//.test(path)&&!path.endsWith('source.png'))res.setHeader('Cache-Control','public,max-age=86400');}}));
  app.get('/{*path}',(_req,res)=>res.sendFile(resolve(dist,'index.html')));
}
app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  if(error instanceof z.ZodError){res.status(400).json({error:'请求格式无效',field:error.issues[0]?.path.join('.')});return;}
  if(error instanceof DomainError){res.status(error.status).json({error:error.message,field:error.field});return;}
  if(error.type==='entity.too.large'){res.status(413).json({error:'请求内容过大'});return;}
  console.error('Request failed:',error.name,error.code||'');res.status(500).json({error:'保存未完成，输入已保留，请重试'});
});
const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT)||3001;
const server=app.listen(port,host,()=>{console.log(`Mouse Nook API · http://${host}:${port}`);void push.tick().catch(e=>console.error('Scheduler:',e.message));});
const timer=setInterval(()=>void push.tick().catch(e=>console.error('Scheduler:',e.message)),30000);timer.unref();
function stop(){clearInterval(timer);server.close(()=>{store.close();process.exit(0);});}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
