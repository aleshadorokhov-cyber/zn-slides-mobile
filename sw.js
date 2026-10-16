/* sw.js — работа без сети: все файлы конструктора сохраняются в телефоне при первом открытии.
 * Новая версия на сервере → новые файлы скачиваются в фоне, страница предлагает обновиться. */
'use strict';
const BUILD = '1.6.2-e7ff87c3e9';
const CACHE = 'zn-slides-' + BUILD;
const FILES = ["css/app.css", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/icon.svg", "index.html", "js/chart.js", "js/core.js", "js/editor.js", "js/engine.js", "js/llm-worker.js", "js/local-llm.js", "js/main.js", "js/materials.js", "js/more.js", "js/pictures.js", "js/plan.js", "js/shared.js", "js/slides-view.js", "manifest.webmanifest", "runtime/app-483c7ec4c1.zip", "runtime/files.json", "runtime/pdf-bridge.js", "runtime/pyodide/hashlib-1.0.0.zip", "runtime/pyodide/lzma-1.0.0.zip", "runtime/pyodide/openssl-1.1.1n.zip", "runtime/pyodide/pyodide-lock.json", "runtime/pyodide/pyodide.asm.js", "runtime/pyodide/pyodide.asm.wasm", "runtime/pyodide/pyodide.js", "runtime/pyodide/python_stdlib.zip", "runtime/pyodide/ssl-1.0.0.zip", "runtime/site-9dc7653c5d.zip", "runtime/worker.js", "vendor/pdfium.js", "vendor/pdfium.wasm", "vendor/pptx-renderer.min.js"];
const SCOPE = new URL('./', self.location.href).pathname;
const KNOWN = new Set(FILES.map(f => SCOPE + f));

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // по одному файлу: на медленной сети большой addAll легко обрывается целиком
    for (const f of FILES) {
      if (await c.match(f)) continue;
      try { await c.add(new Request(f, {cache: 'reload'})); } catch (e) { /* догрузится при запросе */ }
    }
  })());
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('zn-slides-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

/* встроенная модель ИИ: движку нужен общий с ней кусок памяти (SharedArrayBuffer), а браузер даёт его
   только «изолированной» странице (заголовки COOP/COEP). Включается, когда выбрана встроенная модель. */
let ISO = null;
async function isolated() {
  if (ISO === null) ISO = !!(await (await caches.open('zn-flags')).match('isolate'));
  return ISO;
}
function withIso(r) {
  if (!r || !r.status || r.type === 'opaque' || r.type === 'opaqueredirect') return r;
  const h = new Headers(r.headers);
  h.set('Cross-Origin-Embedder-Policy', 'require-corp');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  return new Response(r.body, {status: r.status, statusText: r.statusText, headers: h});
}

self.addEventListener('message', ev => {
  if (ev.data === 'skipWaiting') self.skipWaiting();
  if (ev.data === 'isolate-on' || ev.data === 'isolate-off') {
    ISO = ev.data === 'isolate-on';
    ev.waitUntil(caches.open('zn-flags').then(c => ISO ? c.put('isolate', new Response('1')) : c.delete('isolate'))
      .then(() => ev.source && ev.source.postMessage('isolate-ok')));
  }
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // модель ИИ на компьютере (через «Конструктор для телефона») — всегда по сети
  if (url.pathname.startsWith(SCOPE + 'ai/')) return;
  ev.respondWith((async () => {
    const r = await answer(req, url);
    return (await isolated()) ? withIso(r) : r;
  })());
});

async function answer(req, url) {
  const c = await caches.open(CACHE);
  const key = url.pathname.endsWith('/') ? new Request(url.pathname + 'index.html') : req;
  const hit = await c.match(key, {ignoreSearch: true});
  if (hit) return hit;
  try {
    const r = await fetch(req);
    // библиотеки по требованию (встроенная модель ИИ) — сохраняются при первом использовании
    if (r.ok && r.type === 'basic' && (KNOWN.has(url.pathname) || url.pathname.startsWith(SCOPE + 'vendor/'))) c.put(key, r.clone());
    return r;
  } catch (e) {
    return new Response('Нет сети, а этот файл ещё не сохранён в телефоне.', {status: 503,
      headers: {'Content-Type': 'text/plain; charset=utf-8'}});
  }
}
