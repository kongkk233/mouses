self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 const title=typeof data.title==='string'?data.title:'鼠鼠小窝';
 event.waitUntil(self.registration.showNotification(title,{body:typeof data.body==='string'?data.body:'有新的照护事项待查看',icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:data.tag||'mouse-nook',data:{url:data.url||'/'}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();let url=new URL(event.notification.data?.url||'/',self.location.origin);if(url.origin!==self.location.origin)url=new URL('/',self.location.origin);
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
  for(const client of clients)if(new URL(client.url).origin===url.origin){await client.navigate(url.href);return client.focus();}
  return self.clients.openWindow(url.href);
 }));
});
// Do not cache biological records or successful saves; an offline copy must never look current.
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>小窝暂时离线</title><body style="font-family:system-ui;background:#fbf6f2;color:#503c40;padding:12vh 8vw"><h1>小窝暂时离线</h1><p>请检查网络或本机服务后重新打开。离线时不能保存记录。</p><button onclick="location.reload()">重新连接</button></body></html>',{headers:{'Content-Type':'text/html;charset=utf-8'}}))));});
