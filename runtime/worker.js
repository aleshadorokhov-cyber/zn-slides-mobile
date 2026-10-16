/* worker.js — движок конструктора в фоновом потоке браузера (Pyodide).
 *
 * Сообщения от страницы:
 *   {type:'req', id, method, path, headers, body}  → {type:'res', id, status, headers, body}
 * Сообщения страницы о ходе работы:
 *   {type:'boot', stage, pct}       — загрузка движка
 *   {type:'ready', version, seconds} — можно работать
 *   {type:'progress'|'jobdone', job, view} — ход и итог фоновых заданий (анализ, справка)
 *   {type:'fatal', error}           — движок не запустился
 *   {type:'llm', method, url, headers, body} — запрос к встроенной модели ИИ (её считает страница):
 *       поток ждёт ответа синхронно (Atomics.wait) в общей памяти, которую страница передала {type:'sab'}
 */
'use strict';
const BASE = self.location.href.replace(/[^/]*$/, '');      // …/runtime/
const SITE = new URL('../', BASE).href;                     // корень сайта
const PY = BASE + 'pyodide/';
let py = null, M = null, queue = Promise.resolve(), dirty = false, syncing = null;

function boot(stage, pct) { self.postMessage({type: 'boot', stage, pct}); }

async function fetchBytes(url, label, from, to) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${label}: ${r.status}`);
  const total = +r.headers.get('content-length') || 0;
  if (!r.body || !total) return new Uint8Array(await r.arrayBuffer());
  const reader = r.body.getReader(), parts = [];
  let got = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    parts.push(value); got += value.length;
    boot(label, Math.round(from + (to - from) * Math.min(1, got / total)));
  }
  const out = new Uint8Array(got); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function syncfs(populate) {
  return new Promise((ok, fail) => py.FS.syncfs(populate, e => e ? fail(e) : ok()));
}

async function persist() {                     // папка output → IndexedDB (после каждого изменения)
  if (!dirty) return;
  if (syncing) { await syncing; if (!dirty) return; }
  dirty = false;
  syncing = syncfs(false).catch(e => console.warn('syncfs', e)).finally(() => { syncing = null; });
  return syncing;
}

async function start() {
  const t0 = performance.now();
  boot('Загрузка Python', 2);
  importScripts(PY + 'pyodide.js');
  const files = await (await fetch(BASE + 'files.json')).json();
  const sitePromise = fetchBytes(BASE + files.site, 'Библиотеки', 30, 50);
  const appPromise = fetchBytes(BASE + files.app, 'Шаблон и картинки', 50, 75);
  const iconsPromise = files.icons ? fetchBytes(BASE + files.icons, 'Значки', 75, 85) : null;
  py = await loadPyodide({indexURL: PY, stdout: s => console.log(s), stderr: s => console.warn(s)});
  boot('Загрузка Python', 25);
  await py.loadPackage(['ssl', 'lzma', 'hashlib', 'sqlite3'], {messageCallback: () => {}});
  const site = await sitePromise;
  py.unpackArchive(site, 'zip', {extractDir: '/lib/python3.11/site-packages'});
  const app = await appPromise;
  py.FS.mkdirTree('/app');
  py.unpackArchive(app, 'zip', {extractDir: '/app'});
  if (iconsPromise) py.unpackArchive(await iconsPromise, 'zip', {extractDir: '/app'});
  boot('Хранилище', 88);
  py.FS.mkdirTree('/app/output');
  try {
    py.FS.mount(py.FS.filesystems.IDBFS, {}, '/app/output');
    await syncfs(true);
  } catch (e) { console.warn('IDBFS недоступно — настройки не сохранятся', e); }
  boot('Запуск движка', 92);
  py.runPython("import sys, os; sys.path.insert(0, '/app'); os.chdir('/app')");
  M = py.pyimport('zn_mobile');
  M.set_notify(s => self.postMessage(Object.assign({type: 'job'}, JSON.parse(s))));
  if (M.set_site) M.set_site(SITE);
  const version = py.runPython('import app; app.VERSION');
  boot('Готово', 100);
  self.postMessage({type: 'ready', version, seconds: Math.round((performance.now() - t0) / 100) / 10});
  queue = queue.then(() => { try { M.warmup(); } catch (e) { console.warn(e); } });
}

/* встроенная модель ИИ: синхронный запрос к странице (движку Python нужен ответ «как от сервера») */
let SAB = null;
self.znLLM = (method, url, headersJson, body) => {
  if (!SAB) return {status: 0, body: new Uint8Array(), error: 'Встроенная модель недоступна: перезапустите конструктор.'};
  const ctrl = new Int32Array(SAB.ctrl), data = new Uint8Array(SAB.data);
  Atomics.store(ctrl, 0, 0);
  const b = body ? new Uint8Array(body.toJs ? body.toJs() : body).slice() : null;
  self.postMessage({type: 'llm', method, url, headers: JSON.parse(headersJson || '{}'), body: b}, b ? [b.buffer] : []);
  while (Atomics.wait(ctrl, 0, 0, 30000) === 'timed-out') { /* модель думает: ждём дальше */ }
  const status = Atomics.load(ctrl, 1), n = Atomics.load(ctrl, 2);
  return {status, body: data.slice(0, n), ctype: Atomics.load(ctrl, 3) ? 'text/event-stream' : 'application/json'};
};

/* PDF читает PDFium (WebAssembly, 4,6 МБ): он загружается, только когда в запросе есть PDF */
function hasPdf(body) {
  if (!body) return false;
  const u = new Uint8Array(body), n = u.length - 5;
  for (let i = 0; i < n; i++) {
    if (u[i] === 0x25 && u[i + 1] === 0x50 && u[i + 2] === 0x44 && u[i + 3] === 0x46 && u[i + 4] === 0x2D) return true;   // %PDF-
  }
  return false;
}
function pdfReady(msg) {
  if (!hasPdf(msg.body)) return null;
  if (!self.znPdf) importScripts(BASE + 'pdf-bridge.js');
  return self.znPdf.load(BASE + '../vendor/').catch(e => console.warn('pdfium', e));
}

/* встроенные фотографии (1.7): снимки лежат на сайте, в движке — пустые заглушки (zn_mobile.py).
   Перед запросом скачиваем снимки, упомянутые в нём (ph_… в адресе или в JSON). */
const PHOTO_DIR = '/app/assets/photos/photos/';
const PH_RX = /\bph_(?!my_)[a-z0-9_]{1,60}/g;
function photoIds(msg) {
  let text = msg.path || '';
  const ct = Object.entries(msg.headers || {}).find(([k]) => k.toLowerCase() === 'content-type');
  if (msg.body && ct && /json/.test(ct[1])) text += new TextDecoder().decode(msg.body);
  return [...new Set(text.match(PH_RX) || [])];
}
function emptyPhoto(id) {
  try { return py.FS.stat(PHOTO_DIR + id + '.jpg').size === 0; } catch (e) { return false; }
}
async function photosReady(msg) {
  if (!py) return;
  const ids = photoIds(msg).filter(emptyPhoto);
  await Promise.all(ids.map(async id => {
    try {
      const r = await fetch(SITE + 'photos/' + id + '.jpg');
      if (!r.ok) return;
      const b = new Uint8Array(await r.arrayBuffer());
      if (b.length && emptyPhoto(id)) py.FS.writeFile(PHOTO_DIR + id + '.jpg', b);
    } catch (e) { /* нет сети: движок попробует сам и, если не выйдет, обойдётся без снимка */ }
  }));
}
/* миниатюры встроенных фото — прямо с сайта (готовые 400 точек), без движка и без очереди */
async function photoFile(msg) {
  const m = msg.method === 'GET' && /^\/api\/photo\/(ph_(?!my_)[a-z0-9_]{1,60})(?:\?(.*))?$/.exec(msg.path || '');
  if (!m) return false;
  const w = +(new URLSearchParams(m[2] || '').get('w') || 0);
  let r = null;
  try { r = await fetch(SITE + 'photos/' + (w && w <= 400 ? 'thumbs/' : '') + m[1] + '.jpg'); } catch (e) { r = null; }
  if (!r || !r.ok) return false;
  const buf = await r.arrayBuffer();
  self.postMessage({type: 'res', id: msg.id, status: 200, headers: {'Content-Type': 'image/jpeg'}, body: buf}, [buf]);
  return true;
}

function handle(msg) {
  const {id, method, path, headers, body} = msg;
  let res;
  try {
    const r = M.handle(method, path, JSON.stringify(headers || {}), body ? new Uint8Array(body) : null);
    const [status, hdr, data] = r.toJs();
    r.destroy();
    const bytes = data.toJs ? data.toJs() : data;
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    if (data.destroy) data.destroy();
    res = {type: 'res', id, status, headers: JSON.parse(hdr), body: buf};
    self.postMessage(res, [buf]);
  } catch (e) {
    const buf = new TextEncoder().encode(JSON.stringify({error: 'Ошибка движка: ' + (e && e.message || e)})).buffer;
    self.postMessage({type: 'res', id, status: 500, headers: {'Content-Type': 'application/json'}, body: buf}, [buf]);
  }
  if (method !== 'GET') dirty = true;
  // отложенные задания (анализ, справка) — после ответа, страница уже показывает ход работы
  try { M.run_pending(); } catch (e) { console.warn('job', e); }
  return persist();
}

const ready = start().catch(e => {
  self.postMessage({type: 'fatal', error: String(e && e.message || e)});
  throw e;
});

self.onmessage = ev => {
  const msg = ev.data;
  if (msg && msg.type === 'sab') { SAB = msg; return; }
  if (msg && msg.type === 'req') {
    photoFile(msg).then(done => {
      if (done) return;
      queue = queue.then(() => ready).then(() => Promise.all([pdfReady(msg), photosReady(msg)]))
        .then(() => handle(msg)).catch(e => console.warn(e));
    });
  }
};
