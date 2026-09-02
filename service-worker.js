// service-worker.js — cache do app (offline) + dados sempre atualizados.
// Bump a versão ao alterar arquivos do app para forçar atualização do cache.
const VERSION = 'achilles-v7';
const CORE = [
  './',
  'index.html',
  'manifest.json',
  'assets/css/styles.css',
  'assets/icons/icon.svg',
  'js/app.js',
  'js/ui.js',
  'js/data.js',
  'js/store.js',
  'js/workout.js',
  'js/history.js',
  'js/plans.js',
  'js/progression.js',
  'js/motivation.js',
  'js/recommend.js',
  'js/session-edit.js',
  'js/perfil.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Dados (exercícios, planos): network-first para pegar o que o Claude atualizou.
  if (url.pathname.includes('/data/')) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // App shell: cache-first, atualizando em segundo plano.
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
