/* engine.js — связь страницы с движком (runtime/worker.js).
 * Engine.api(method, path, {json, form, body}) → {status, ok, headers, body, json(), text(), blob()}
 * Engine.waitJob(id, onProgress) → итог фонового задания (анализ, справка)
 * Engine.cancelJob() — прервать: движок перезапускается (потоков в браузере нет). */
'use strict';
const Engine = (() => {
  let worker = null, seq = 0, readyP = null, readyInfo = null, sab = null;
  const pending = new Map(), jobs = new Map(), bootSubs = new Set();

  function spawn() {
    readyP = new Promise((resolve, reject) => {
      worker = new Worker('runtime/worker.js');
      worker.onmessage = ev => {
        const m = ev.data;
        if (m.type === 'res') {
          const p = pending.get(m.id);
          if (p) { pending.delete(m.id); p.resolve(wrap(m)); }
        } else if (m.type === 'boot') {
          bootSubs.forEach(f => f(m));
        } else if (m.type === 'ready') {
          readyInfo = m; bootSubs.forEach(f => f(m)); resolve(m);
        } else if (m.type === 'llm') {
          answerLLM(m);
        } else if (m.type === 'fatal') {
          bootSubs.forEach(f => f(m)); reject(new Error(m.error));
        } else if (m.type === 'job') {
          const j = jobs.get(m.job);
          if (j) {
            if (m.kind === 'progress' && j.onProgress) j.onProgress(m.view);
            if (m.kind === 'jobdone') { jobs.delete(m.job); j.resolve(m.view); }
          }
        }
      };
      // встроенная модель ИИ: ответ передаётся в общую память, движок ждёт его синхронно
      if (window.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined') {
        sab = {type: 'sab', ctrl: new SharedArrayBuffer(16), data: new SharedArrayBuffer(16 << 20)};
        worker.postMessage(sab);
      }
      worker.onerror = ev => { bootSubs.forEach(f => f({type: 'fatal', error: ev.message || 'сбой движка'})); };
    });
    return readyP;
  }

  async function answerLLM(m) {
    const my = sab;
    let r;
    try { r = await LocalLLM.handle(m); } catch (e) { r = {status: 500, body: new TextEncoder().encode(JSON.stringify({error: {message: String(e.message || e)}})), headers: {}}; }
    if (!my || my !== sab) return;                      // движок перезапущен (отмена) — ответ уже не нужен
    const ctrl = new Int32Array(my.ctrl), data = new Uint8Array(my.data);
    const body = r.body.length > data.length ? r.body.slice(0, data.length) : r.body;
    data.set(body);
    Atomics.store(ctrl, 1, r.status); Atomics.store(ctrl, 2, body.length);
    Atomics.store(ctrl, 3, /event-stream/.test((r.headers || {})['Content-Type'] || '') ? 1 : 0);
    Atomics.store(ctrl, 0, 1);
    Atomics.notify(ctrl, 0);
  }

  function wrap(m) {
    const headers = {};
    for (const [k, v] of Object.entries(m.headers || {})) headers[k.toLowerCase()] = v;
    const body = m.body || new ArrayBuffer(0);
    return {
      status: m.status, ok: m.status >= 200 && m.status < 300, headers, body,
      text() { return new TextDecoder().decode(body); },
      json() { try { return JSON.parse(new TextDecoder().decode(body)); } catch (e) { return {error: 'Неверный ответ движка'}; } },
      blob(type) { return new Blob([body], {type: type || headers['content-type'] || 'application/octet-stream'}); },
    };
  }

  async function api(method, path, opt = {}) {
    if (!worker) spawn();
    let body = null;
    const headers = Object.assign({}, opt.headers || {});
    if (opt.json !== undefined) {
      body = new TextEncoder().encode(JSON.stringify(opt.json)).buffer;
      headers['Content-Type'] = 'application/json';
    } else if (opt.form) {
      const req = new Request('https://x/', {method: 'POST', body: opt.form});
      headers['Content-Type'] = req.headers.get('content-type');
      body = await req.arrayBuffer();
    } else if (opt.body) {
      body = opt.body;
    }
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, {resolve, reject});
      worker.postMessage({type: 'req', id, method, path, headers, body}, body ? [body] : []);
    });
  }

  function waitJob(id, onProgress) {
    return new Promise((resolve, reject) => jobs.set(id, {resolve, reject, onProgress}));
  }

  function cancelJob() {                       // прервать долгую работу: перезапуск движка
    if (worker) worker.terminate();
    const err = Object.assign(new Error('Отменено.'), {cancelled: true});
    for (const p of pending.values()) p.reject(err);
    pending.clear();
    for (const j of jobs.values()) j.resolve({state: 'cancelled', error: 'Отменено.'});
    jobs.clear();
    worker = null; readyInfo = null; sab = null;
    return spawn();
  }

  return {
    start() { return readyP || spawn(); },
    ready() { return readyP || spawn(); },
    info() { return readyInfo; },
    onBoot(f) { bootSubs.add(f); return () => bootSubs.delete(f); },
    api, waitJob, cancelJob,
    get: (p) => api('GET', p),
    post: (p, json) => api('POST', p, {json}),
  };
})();
