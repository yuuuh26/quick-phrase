const PREFIX='quick-phrase-shell-';
const CACHE=PREFIX+'v1.0.0';
const ROOT=new URL('./',self.location).href;
const ASSETS=['./','./index.html','./style.css','./app.js','./db.js','./manifest.json','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png'].map(p=>new URL(p,ROOT).href);
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith(PREFIX)&&name!==CACHE)await caches.delete(name);await self.clients.claim();})());});
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;
  const url=new URL(request.url);if(!url.href.startsWith(ROOT)||url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(ROOT+'index.html'))||fetch(request)));return;}
  if(ASSETS.includes(url.href))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(request))||fetch(request)));
});
