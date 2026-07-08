self.addEventListener('install',e=>e.waitUntil(caches.open('moneyflow-v1').then(c=>c.addAll(['/','/manifest.json','/icon.svg']))));
self.addEventListener('fetch',e=>e.respondWith(fetch(e.request).catch(()=>caches.match(e.request))));
