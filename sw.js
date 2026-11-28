// Service worker: permite usar la app sin internet y avisa cuando hay una versión nueva.
// Cambia VERSION (y APP_VERSION en app.js) cada vez que publiques cambios.
// Los datos del usuario viven en localStorage, no en esta caché: actualizar nunca los borra.
const VERSION = 'mis6cuentas-v5';
const SHELL = ['./', './index.html', './styles.css', './i18n.js', './app.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

self.addEventListener('install', (e) => {
  // no se activa sola: espera a que el usuario toque "Actualizar ahora"
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
});
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin && req.url !== XLSX_URL) return;
  // red primero (la versión más nueva si hay internet); caché si no hay conexión
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
