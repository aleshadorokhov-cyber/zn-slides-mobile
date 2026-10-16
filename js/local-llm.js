/* local-llm.js — встроенная модель ИИ: работает в самом телефоне, на видеочипе (WebGPU), без интернета
   после первой загрузки. Движок обращается к ней как к OpenAI-совместимому серверу по адресу
   http://browser.local/v1 — запрос приходит сюда из движка (Engine → handle), ответ уходит обратно. */
'use strict';
const LocalLLM = (() => {
  const BASE = 'http://browser.local/v1';
  const CTX = 8192;                              // окно контекста: выжимка документа + ответ
  const MODELS = [
    {id: 'Qwen3-1.7B-q4f16_1-MLC', name: 'Qwen3 1.7B', size: '≈ 1 ГБ', note: 'Рекомендуется: быстро и хорошо по-русски', vram: 2.0},
    {id: 'Qwen3-4B-q4f16_1-MLC', name: 'Qwen3 4B', size: '≈ 2,3 ГБ', note: 'Точнее, но медленнее. Для iPhone 15 Pro и новее, Android с 8 ГБ памяти', vram: 3.4},
    {id: 'Qwen3-0.6B-q4f16_1-MLC', name: 'Qwen3 0.6B', size: '≈ 0,4 ГБ', note: 'Самая быстрая и лёгкая, тексты проще', vram: 1.4},
  ];
  let lib = null, engine = null, engineModel = '', loading = null;

  /* можно ли запустить модель в этом браузере; иначе — понятная причина */
  function reason() {
    if (!window.isSecureContext) return 'Конструктор открыт по адресу без защиты (http). Встроенной модели нужен защищённый адрес (https) — откройте конструктор по адресу от администратора.';
    if (!('gpu' in navigator)) return /iPhone|iPad/.test(navigator.userAgent)
      ? 'Нужен iOS 26 или новее (Safari с WebGPU). Обновите iPhone: Настройки → Основные → Обновление ПО.'
      : 'Браузер не поддерживает WebGPU. Откройте конструктор в свежем Chrome (Android 12 и новее).';
    if (!window.crossOriginIsolated) return 'reload';
    return '';
  }
  const isLocal = base => String(base || '').startsWith(BASE);

  async function loadLib() {
    if (!lib) lib = await import(new URL('vendor/web-llm.js', document.baseURI).href);
    return lib;
  }
  async function inCache(id) {
    try { return await (await loadLib()).hasModelInCache(id); } catch (e) { return false; }
  }
  async function remove(id) {
    const L = await loadLib();
    if (engine && engineModel === id) { try { await engine.unload(); } catch (e) { /* уже */ } engine = null; engineModel = ''; }
    await L.deleteModelAllInfoInCache(id);
  }

  /* модель в память видеочипа (при первом разе — скачивание); onProgress(доля 0…1, текст) */
  async function ensure(id, onProgress) {
    if (engine && engineModel === id) return engine;
    if (loading && loading.id === id) return loading.p;
    const p = (async () => {
      const r = reason();
      if (r) throw new Error(r === 'reload' ? 'Перезапустите конструктор (закройте и откройте), чтобы включить встроенную модель.' : r);
      const L = await loadLib();
      if (engine) { try { await engine.unload(); } catch (e) { /* уже */ } engine = null; }
      try { await navigator.storage.persist(); } catch (e) { /* не разрешили */ }
      const w = new Worker(new URL('js/llm-worker.js', document.baseURI), {type: 'module'});
      const e = await L.CreateWebWorkerMLCEngine(w, id, {
        initProgressCallback: x => onProgress && onProgress(x.progress || 0, progressText(x)),
      }, {context_window_size: CTX});
      engine = e; engineModel = id;
      return e;
    })();
    loading = {id, p};
    try { return await p; } finally { loading = null; }
  }
  function progressText(x) {
    const t = String(x.text || '');
    const m = t.match(/(\d+)MB fetched/);
    if (/Fetching param cache|Loading model from cache/.test(t) && m) return `Скачано ${m[1]} МБ`;
    if (/Loading model from cache/i.test(t)) return 'Загружаю модель в память…';
    if (/shader|GPU/i.test(t)) return 'Готовлю видеочип…';
    return x.progress ? `Загрузка ${Math.round(x.progress * 100)} %` : 'Загрузка…';
  }

  /* запрос движка (OpenAI API) → {status, headers, body: Uint8Array} */
  async function handle(req) {
    const enc = s => new TextEncoder().encode(typeof s === 'string' ? s : JSON.stringify(s));
    const json = (status, obj) => ({status, headers: {'Content-Type': 'application/json'}, body: enc(obj)});
    const path = new URL(req.url).pathname;
    const cfgModel = (state.status && state.status.llm && state.status.llm.model) || MODELS[0].id;
    try {
      if (req.method === 'GET' && path.endsWith('/models')) {
        const ids = [];
        for (const m of MODELS) if (await inCache(m.id)) ids.push(m.id);
        return json(200, {data: (ids.length ? ids : [cfgModel]).map(id => ({id, object: 'model'}))});
      }
      if (!path.endsWith('/chat/completions')) return json(404, {error: {message: 'нет такого адреса'}});
      const body = JSON.parse(new TextDecoder().decode(req.body || new Uint8Array()));
      const id = MODELS.some(m => m.id === body.model) ? body.model : cfgModel;
      const first = !(engine && engineModel === id);
      const e = await ensure(id, (f, t) => Busy.text('Встроенная модель ИИ', `${esc(t)}<div class="bar"><i style="width:${Math.max(4, Math.round(f * 100))}%"></i></div>`));
      if (first) Busy.text('Встроенная модель ИИ думает…', '');
      const opts = {messages: body.messages, temperature: body.temperature ?? 0.3, stream: true,
        max_tokens: Math.min(+(body.max_tokens || body.max_completion_tokens || 2048), 3072),
        stream_options: {include_usage: true}, extra_body: {enable_thinking: false}};
      if (body.response_format && body.response_format.type === 'json_object') opts.response_format = {type: 'json_object'};
      const t0 = performance.now();
      let text = '', n = 0, usage = null, finish = null;
      for await (const ch of await e.chat.completions.create(opts)) {
        const c = ch.choices && ch.choices[0];
        if (c && c.delta && c.delta.content) { text += c.delta.content; n++; }
        if (c && c.finish_reason) finish = c.finish_reason;
        if (ch.usage) usage = ch.usage;
        if (n % 8 === 1) Busy.text('Встроенная модель ИИ пишет…', `${n} токенов · ${Math.round((performance.now() - t0) / 1000)} с`);
      }
      const chunk = {choices: [{index: 0, delta: {content: text}, finish_reason: finish || 'stop'}]};
      const out = `data: ${JSON.stringify(chunk)}\n\n` + (usage ? `data: ${JSON.stringify({choices: [], usage})}\n\n` : '') + 'data: [DONE]\n\n';
      return {status: 200, headers: {'Content-Type': 'text/event-stream'}, body: enc(out)};
    } catch (err) {
      let msg = String(err && err.message || err);
      if (/context window|prompt tokens exceed/i.test(msg)) msg = 'документ слишком длинный для встроенной модели — уменьшите «Объём выжимки» в настройках модели';
      else if (/device lost|out of memory|OOM|allocation/i.test(msg)) { engine = null; engineModel = ''; msg = 'не хватило памяти телефона — выберите модель поменьше (Qwen3 0.6B или 1.7B) и закройте другие приложения'; }
      return json(500, {error: {message: `встроенная модель: ${msg}`}});
    }
  }
  function stop() { if (engine) { try { engine.interruptGenerate(); } catch (e) { /* уже */ } } }
  return {BASE, MODELS, CTX, reason, isLocal, inCache, ensure, remove, handle, stop};
})();
