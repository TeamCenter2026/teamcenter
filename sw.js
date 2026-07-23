const CACHE='teamcenter-2.1-match-report-archive-home-fix';
const ASSETS=[
  './',
  './index.html',
  './styles.css',
  './api.js',
  './bootstrap.js',
  './app.js',
  './storage.js',
  './profile.js',
  './callup.js',
  './match.js',
  './image.js',
  './pdf.js',
  './allenamenti.js',
  './convocazioni.js',
  './manifest.webmanifest'
];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(
    fetch(event.request,{cache:'no-store'})
      .then(response=>{
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        return response;
      })
      .catch(()=>caches.match(event.request).then(response=>response||caches.match('./index.html')))
  );
});