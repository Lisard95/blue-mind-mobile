// Guscio dell'app in cache per l'avvio offline; le API di GitHub non passano mai dalla cache.
const CACHE = 'bm-mobile-v2';
const GUSCIO = ['./', 'index.html', 'style.css', 'app.js', 'lib/approva.js', 'lib/github.js', 'vendor/marked.min.js', 'manifest.webmanifest', 'icone/icona-192.png'];

self.addEventListener('install', (e) => {
	e.waitUntil(caches.open(CACHE).then((c) => c.addAll(GUSCIO)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
	e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim()));
});
// Prima la rete (così un aggiornamento si vede subito), la cache solo senza connessione.
self.addEventListener('fetch', (e) => {
	const url = new URL(e.request.url);
	if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
	e.respondWith(
		fetch(e.request)
			.then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r; })
			.catch(() => caches.match(e.request).then((r) => r ?? caches.match('index.html'))),
	);
});
