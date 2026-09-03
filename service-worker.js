// service-worker.js — cache do app (offline) + dados sempre atualizados.
// Bump a versão ao alterar arquivos do app para forçar atualização do cache.
const VERSION = '1.10.0';
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
  'js/version.js',
  'js/recommend.js',
  'js/session-edit.js',
  'js/perfil.js',
  'js/hr.js',
  'js/metrics.js',
];

// Ilustrações dos exercícios: precisam ficar no cache, senão o app instalado
// (muitas vezes offline) não mostra a imagem nas instruções.
// GERADO por tools/gen_exercise_svgs.py - não editar à mão.
const ILUSTRACOES = [
  // <ilustracoes>
  'assets/exercises/abdominal-bicicleta.svg',
  'assets/exercises/abdominal-crunch.svg',
  'assets/exercises/abdominal-elevacao-pernas.svg',
  'assets/exercises/abdominal-mountain-climber.svg',
  'assets/exercises/afundo-halteres.svg',
  'assets/exercises/agachamento-barra.svg',
  'assets/exercises/agachamento-goblet.svg',
  'assets/exercises/barra-fixa.svg',
  'assets/exercises/bike-cardio.svg',
  'assets/exercises/boxe-bob.svg',
  'assets/exercises/cadeira-extensora.svg',
  'assets/exercises/caminhada.svg',
  'assets/exercises/caminhada-inclinada.svg',
  'assets/exercises/caminhada-intervalada.svg',
  'assets/exercises/caminhada-rapida.svg',
  'assets/exercises/coice-gluteo-caneleira.svg',
  'assets/exercises/corrida.svg',
  'assets/exercises/desenvolvimento-ombro-halteres.svg',
  'assets/exercises/elevacao-lateral.svg',
  'assets/exercises/elevacao-pelvica-halter.svg',
  'assets/exercises/flexao-bracos.svg',
  'assets/exercises/kettlebell-swing.svg',
  'assets/exercises/panturrilha-halteres.svg',
  'assets/exercises/ponte-gluteo-isometrica.svg',
  'assets/exercises/prancha.svg',
  'assets/exercises/prancha-lateral.svg',
  'assets/exercises/puxada-alta-maquina.svg',
  'assets/exercises/remada-curvada-halteres.svg',
  'assets/exercises/remada-trx.svg',
  'assets/exercises/rosca-direta-halteres.svg',
  'assets/exercises/supino-halteres.svg',
  'assets/exercises/supino-reto-barra.svg',
  'assets/exercises/terra-romeno-halteres.svg',
  'assets/exercises/triceps-frances-halter.svg',
  'assets/exercises/voador-maquina.svg',
  // </ilustracoes>
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(async (c) => {
    await c.addAll(CORE);
    // Ilustrações: uma a uma, para que uma falha não derrube a instalação toda.
    await Promise.all(ILUSTRACOES.map((u) => c.add(u).catch(() => {})));
  }).then(() => self.skipWaiting()));
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
