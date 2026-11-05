const CACHE_NAME = 'trf-cache-v10';
const PRECACHE = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './icon-maskable-512.png'
];
const EXTERNAL_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => Promise.all(PRECACHE.map(url => cache.add(url).catch(() => null))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', event => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET' || !req.url.startsWith('http')) return;
    // Requisições parciais (vídeo/áudio) vão direto para a rede
    if (req.headers.has('range')) return;

    const url = new URL(req.url);
    const sameOrigin = url.origin === self.location.origin;
    const allowedExternal =
        EXTERNAL_HOSTS.includes(url.hostname) ||
        (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'));

    // Login do Firebase/Google e demais chamadas vão direto para a rede
    if (!sameOrigin && !allowedExternal) return;

    // Páginas: rede primeiro, cache se estiver offline
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req)
                .then(res => {
                    if (res && res.status === 200 && res.type === 'basic') {
                        const copy = res.clone();
                        caches.open(CACHE_NAME).then(c => c.put('./index.html', copy));
                    }
                    return res;
                })
                .catch(() =>
                    caches.match('./index.html')
                        .then(r => r || caches.match('./'))
                        .then(r => r || Response.error())
                )
        );
        return;
    }

    // Demais arquivos: cache primeiro, atualiza em segundo plano
    event.respondWith(
        caches.match(req).then(cached => {
            const network = fetch(req)
                .then(res => {
                    if (res && (res.status === 200 || res.type === 'opaque')) {
                        const copy = res.clone();
                        caches.open(CACHE_NAME).then(c => c.put(req, copy));
                    }
                    return res;
                })
                .catch(() => cached || Response.error());

            if (cached) {
                // Mantém o service worker vivo até terminar a atualização em segundo plano
                event.waitUntil(network.catch(() => null));
                return cached;
            }
            return network;
        })
    );
});