/* more.js — экран «Ещё»: модель ИИ (локальная на компьютере или телефоне), шаблоны, мои презентации,
   тема, установка на телефон, справка, память. */
'use strict';

/* ---------------------------------------------------------------- поиск локальных моделей ИИ */
const LocalAI = (() => {
  // известные программы и их порты по умолчанию; любая другая — вручную, по адресу
  const KNOWN = [
    [11434, 'Ollama', 'ollama'], [1234, 'LM Studio', 'openai'], [8080, 'llama.cpp / LocalAI', 'openai'],
    [1337, 'Jan', 'openai'], [4891, 'GPT4All', 'openai'], [5001, 'KoboldCpp', 'openai'],
    [8000, 'vLLM', 'openai'], [5000, 'text-generation-webui', 'openai'], [52415, 'exo', 'openai'],
  ];
  const isLoop = host => /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i.test(host);
  const pageHttps = () => location.protocol === 'https:';
  function timeout(ms) { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; }

  // одна программа по адресу: {ok, models} | {cors: true} (отвечает, но не пускает страницы) | null
  async function probe(origin, api) {
    const url = api === 'ollama' ? origin + '/api/tags' : origin + '/v1/models';
    try {
      const r = await fetch(url, {signal: timeout(2500), cache: 'no-store'});
      if (!r.ok) return null;
      const d = await r.json();
      const list = api === 'ollama' ? (d.models || []).map(m => m.name || m.model) : (d.data || d.models || []).map(m => m.id || m.name);
      if (!Array.isArray(list)) return null;
      return {ok: true, models: list.filter(Boolean).map(String)};
    } catch (e) {
      try { await fetch(url, {mode: 'no-cors', signal: timeout(2000), cache: 'no-store'}); return {cors: true}; } catch (e2) { return null; }
    }
  }
  // компьютер, с которого открыт конструктор (программа «Конструктор для телефона»): /ai/scan
  async function bridge() {
    try {
      const r = await fetch('ai/scan', {signal: timeout(6000), cache: 'no-store'});
      if (!r.ok) return null;
      const d = await r.json();
      return d && d.bridge ? d : null;
    } catch (e) { return null; }
  }
  /* где искать: 'bridge' — компьютер с конструктором, 'phone' — этот телефон, 'lan' — компьютер по адресу */
  async function scan(where, host) {
    const out = [];
    if (where === 'bridge') {
      const b = await bridge();
      if (!b) return {servers: [], note: 'nobridge'};
      (b.servers || []).forEach(s => out.push({where, name: s.name, api: s.api, port: s.port, models: s.models || [], ok: true,
        base: new URL(`ai/${s.port}`, location.href).href.replace(/\/$/, '') + (s.api === 'openai' ? '/v1' : ''), host: b.host}));
      return {servers: out, host: b.host};
    }
    const h0 = where === 'phone' ? '127.0.0.1' : String(host || '').trim().replace(/^https?:\/\//, '').replace(/[/:].*$/, '');
    if (!h0) return {servers: [], note: 'nohost'};
    if (pageHttps() && !isLoop(h0)) return {servers: [], note: 'https'};
    const res = await Promise.all(KNOWN.map(async ([port, name, api]) => {
      const origin = `http://${h0}:${port}`;
      const r = await probe(origin, api);
      return r ? {where, name, api, port, models: r.models || [], ok: !!r.ok, cors: !!r.cors, base: origin + (api === 'openai' ? '/v1' : '')} : null;
    }));
    // 8080 и 8000 — частые порты и у других программ: без списка моделей не показываем
    return {servers: res.filter(x => x && (x.ok || [11434, 1234, 1337, 4891].includes(x.port)))};
  }
  return {scan, bridge, KNOWN, pageHttps, isLoop};
})();

const More = (() => {
  /* ---------------------------------------------------------------- модель ИИ */
  async function openAi() {
    let st;
    try { st = await apiJSON('GET', '/api/settings'); } catch (e) { toast(e.message, true); return; }
    const L = st.llm, prov = new Map(st.providers.map(p => [p.id, p]));
    const cfg = {provider: L.provider || 'ollama', base_url: L.base_url || '', model: L.model || '', api_key: L.api_key || '',
      temperature: L.temperature ?? '', num_ctx: L.num_ctx ?? '', timeout: L.timeout ?? '', max_chars: L.max_chars ?? '',
      illustrations: L.illustrations ?? '', cloud_consent: !!L.cloud_consent,
      embed_url: L.embed_url || '', embed_model: L.embed_model || '', vision_url: L.vision_url || '', vision_model: L.vision_model || ''};
    const isLocalProv = id => (prov.get(id) || {}).group === 'local';
    const lanHost = () => { try { const u = new URL(cfg.base_url); return LocalAI.isLoop(u.hostname) ? '' : u.hostname; } catch (e) { return ''; } };
    let where = !cfg.model ? 'none' : (cfg.provider === 'browser' ? 'device' : !isLocalProv(cfg.provider) ? 'cloud'
      : (/\/ai\/\d+/.test(cfg.base_url) ? 'pc' : (lanHost() ? 'pc' : 'phone')));
    const onBridge = !!(await LocalAI.bridge());
    let found = [];
    let slot = null;                    // настройки выбранного варианта — сразу под ним

    const body = h('<div class="ai-set"></div>');
    const save = h('<button class="btn primary" type="button">Сохранить</button>');
    const sh = openSheet({title: 'Модель ИИ', full: true, back: true, body, foot: save});

    function draw() {
      body.innerHTML = '';
      body.appendChild(h(`<p class="hint" style="margin-top:0">Модель пишет план и тексты слайдов, исправляет слайды по замечаниям и рисует иллюстрации. Без неё конструктор работает по правилам.</p>`));
      body.appendChild(h('<div class="sec-h">Где работает модель</div>'));
      const opts = [
        ['device', '🧠', 'Встроенная в конструктор', 'Модель скачивается один раз и работает в самом телефоне, без интернета'],
        ['pc', '💻', 'На компьютере', 'Ollama, LM Studio, llama.cpp, Jan, GPT4All… — в той же сети Wi-Fi'],
        ['phone', '📱', 'На этом телефоне', 'Приложение с моделью, которое включает сервер: Local LLM Server, ai.local, Ollama в Termux…'],
        ['cloud', '☁', 'Облачный сервис', 'GigaChat, YandexGPT и другие — текст документов уходит во внешний сервис'],
        ['none', '⊘', 'Без модели ИИ', 'План строится по правилам — быстро и без сети'],
      ];
      const grp = h('<div class="menu-group" style="margin:0 0 6px"></div>');
      opts.forEach(([v, ic, t, d]) => {
        const b = h(`<button type="button" class="menu-item${where === v ? ' on' : ''}"><i>${ic}</i><span><b>${esc(t)}</b><small>${esc(d)}</small></span><span class="radio${where === v ? ' on' : ''}"></span></button>`);
        b.addEventListener('click', () => {
          if (where === v) return;
          where = v; found = [];
          if (v === 'cloud' && isLocalProv(cfg.provider)) Object.assign(cfg, {provider: '', base_url: '', model: ''});
          if ((v === 'pc' || v === 'phone') && (!isLocalProv(cfg.provider) || cfg.provider === 'browser')) Object.assign(cfg, {provider: 'ollama', base_url: '', model: ''});
          if (v === 'device' && cfg.provider !== 'browser') Object.assign(cfg, {provider: 'browser', base_url: LocalLLM.BASE, model: ''});
          draw();
          const on = body.querySelector('.menu-item.on');
          if (on) on.scrollIntoView({block: 'start', behavior: 'smooth'});
          if (v === 'pc' && onBridge) find();
        });
        grp.appendChild(b);
        if (where === v && v !== 'none') { slot = h('<div class="ai-det"></div>'); grp.appendChild(slot); }
      });
      body.appendChild(grp);
      body.appendChild(auxEl());
      if (where === 'none') return;
      if (where === 'cloud') return drawCloud();
      if (where === 'device') return drawDevice();
      drawLocal();
    }

    /* локальная модель: найти автоматически или указать адрес */
    function drawLocal() {
      const box = h('<div></div>');
      if (where === 'pc') {
        if (onBridge) box.appendChild(h('<p class="hint">Конструктор открыт с компьютера — модели на нём подключаются без настроек.</p>'));
        else {
          box.appendChild(field('Адрес компьютера в Wi-Fi', cfg, '_host', {placeholder: '192.168.1.10', inputmode: 'url', get: () => cfg._host ?? lanHost(), set: v => { cfg._host = v.trim(); }}));
          if (LocalAI.pageHttps()) box.appendChild(h(`<p class="hint warn-txt">Конструктор открыт по защищённому адресу (https), а модели на компьютере отвечают по http — браузер телефона не пустит к ним напрямую. Проще всего открыть конструктор с самого компьютера: запустите на нём «Конструктор для телефона» и откройте показанный адрес. <a href="#" data-help>Как это сделать</a></p>`));
        }
      } else {
        box.appendChild(h(`<p class="hint">${isIOS()
          ? 'Подойдёт приложение, которое включает на телефоне сервер модели с API как у OpenAI или Ollama, — например, Local LLM Server (Apple Intelligence) или ai.local. Включите в нём сервер и разрешите запросы из браузера (CORS). Пока конструктор работает, не закрывайте это приложение: iPhone может приостановить его в фоне.'
          : 'Подойдёт приложение, которое включает на телефоне сервер модели с API как у OpenAI или Ollama: Ollama в Termux, llama.cpp server, MLC и похожие. Включите в нём сервер и разрешите запросы из браузера (CORS).'} Если поиск не найдёт модель — впишите адрес вида http://127.0.0.1:порт ниже.</p>`));
      }
      const findBtn = h('<button class="btn ghost wide" type="button">🔍 Найти модели</button>');
      findBtn.addEventListener('click', find);
      box.appendChild(findBtn);
      const res = h('<div class="found"></div>');
      found.forEach(s => res.appendChild(serverCard(s)));
      if (found.note) res.appendChild(h(`<p class="hint warn-txt">${found.note}</p>`));
      box.appendChild(res);

      box.appendChild(h('<div class="sec-h">Подключение</div>'));
      const locals = st.providers.filter(p => p.group === 'local' && p.id !== 'browser');
      box.appendChild(field('Тип сервера', cfg, 'provider', {select: locals.map(p => [p.id, p.id === 'ollama' ? 'Ollama' : 'OpenAI-совместимый (LM Studio, llama.cpp, Jan, vLLM…)']),
        onChange: () => { if (!cfg.base_url) cfg.base_url = (prov.get(cfg.provider) || {}).base_url || ''; }}));
      box.appendChild(field('Адрес сервера', cfg, 'base_url', {placeholder: cfg.provider === 'ollama' ? 'http://192.168.1.10:11434' : 'http://192.168.1.10:1234/v1', inputmode: 'url'}));
      box.appendChild(modelField());
      box.appendChild(field('Ключ (если сервер его просит)', cfg, 'api_key', {placeholder: 'необязательно'}));
      const test = h('<button class="btn ghost wide" type="button">Проверить связь</button>');
      test.addEventListener('click', check);
      box.appendChild(test);
      box.appendChild(advanced());
      slot.appendChild(box);
      $('[data-help]', box)?.addEventListener('click', e => { e.preventDefault(); help('pc'); });
    }
    function modelField() {
      const w = field('Модель', cfg, 'model', {placeholder: cfg.provider === 'ollama' ? 'qwen3:8b' : 'имя модели на сервере'});
      const list = (cfg._models || []).slice(0, 30);
      if (list.length) {
        const chips = h('<div class="ex-row" style="margin-top:8px"></div>');
        list.forEach(m => {
          const b = h(`<button type="button"${m === cfg.model ? ' class="on"' : ''}></button>`); b.textContent = m;
          b.addEventListener('click', () => { cfg.model = m; $('input', w).value = m; $$('button', chips).forEach(x => x.classList.toggle('on', x === b)); });
          chips.appendChild(b);
        });
        w.appendChild(chips);
      }
      return w;
    }
    function serverCard(s) {
      const where = s.where === 'phone' ? 'на этом телефоне' : (s.host ? `на компьютере ${s.host}` : 'на компьютере');
      const c = h(`<div class="item"><div class="item-head"><b style="color:var(--heading)"></b><span class="sp"></span></div><p class="hint" style="margin:2px 0 8px"></p><div class="ex-row"></div></div>`);
      $('b', c).textContent = `${s.name} · ${where}`;
      if (s.cors) {
        $('p', c).innerHTML = esc(`Программа отвечает, но не пускает запросы со страниц браузера.`) + ' ' + corsHint(s);
        return c;
      }
      $('p', c).textContent = s.models.length ? `Моделей: ${s.models.length}. Нажмите модель, чтобы выбрать её.` : 'Сервер работает, но моделей нет — загрузите модель в программе.';
      s.models.slice(0, 24).forEach(m => {
        const b = h(`<button type="button"${cfg.base_url === s.base && cfg.model === m ? ' class="on"' : ''}></button>`); b.textContent = m;
        b.addEventListener('click', () => {
          Object.assign(cfg, {provider: s.api === 'ollama' ? 'ollama' : 'openai', base_url: s.base, model: m, _models: s.models});
          draw(); toast(`Выбрана модель ${m}`);
        });
        $('.ex-row', c).appendChild(b);
      });
      return c;
    }
    function corsHint(s) {
      if (s.name === 'Ollama') return 'Перезапустите Ollama с переменной <b>OLLAMA_ORIGINS=*</b> (и <b>OLLAMA_HOST=0.0.0.0</b>, если она на компьютере).';
      if (s.name === 'LM Studio') return 'В LM Studio: Developer → Settings → включите <b>Enable CORS</b> и <b>Serve on Local Network</b>.';
      if (s.name === 'Jan') return 'В Jan: Settings → Local API Server → разрешите CORS и доступ из сети.';
      return 'Включите в программе CORS (разрешение запросов из браузера) или откройте конструктор с компьютера через «Конструктор для телефона».';
    }
    async function find() {
      const msg = {nobridge: 'Конструктор открыт не с компьютера — укажите адрес компьютера в Wi-Fi.', nohost: 'Укажите адрес компьютера в Wi-Fi, например 192.168.1.10 (в Windows: Параметры → Сеть → Свойства → IPv4).',
        https: 'Браузер не пускает страницу https к компьютеру по http. Откройте конструктор с компьютера через «Конструктор для телефона».'};
      Busy.on('Ищу модели ИИ…');
      try {
        const mode = where === 'phone' ? 'phone' : (onBridge ? 'bridge' : 'lan');
        const r = await LocalAI.scan(mode, cfg._host ?? lanHost());
        found = r.servers;
        if (r.note) found.note = esc(msg[r.note]);
        else if (!found.length) found.note = esc(where === 'phone' ? 'На телефоне модели не найдены. Запустите приложение с моделью и включите в нём сервер.'
          : 'Модели не найдены. Проверьте, что программа с моделью запущена, телефон в той же сети Wi-Fi, а программа доступна из сети.') + (onBridge ? '' : ' ' + 'Проще всего — запустить на компьютере «Конструктор для телефона»: он сам найдёт модели.');
        const one = found.filter(s => s.ok && s.models.length);
        if (one.length === 1 && !cfg.model) Object.assign(cfg, {provider: one[0].api === 'ollama' ? 'ollama' : 'openai', base_url: one[0].base, model: one[0].models[0], _models: one[0].models});
      } finally { Busy.off(); }
      draw();
    }
    function fields() {
      const o = {provider: cfg.provider, base_url: cfg.base_url.trim(), model: cfg.model.trim(), api_key: cfg.api_key};
      ['temperature', 'num_ctx', 'timeout', 'max_chars', 'illustrations'].forEach(k => { if (String(cfg[k]).trim() !== '') o[k] = cfg[k]; });
      if (where === 'cloud') o.cloud_consent = !!cfg.cloud_consent;
      if (where === 'device') {                // окно контекста встроенной модели — 8 тыс. токенов
        Object.assign(o, {provider: 'browser', base_url: LocalLLM.BASE, timeout: 3600});
        if (!(+o.max_chars > 0) || +o.max_chars > 9000) o.max_chars = 8000;
      }
      return o;
    }
    async function check() {
      if (!cfg.base_url.trim() && !(prov.get(cfg.provider) || {}).base_url) { toast('Укажите адрес сервера.', true); return; }
      Busy.on('Проверяю связь с моделью…', {cancel: cancelEngine});
      try {
        const r = await apiJSON('POST', '/api/llm/test', {llm: fields()});
        Busy.off();
        if (!r.ok) { toast(r.error || 'Нет связи с сервером', true, 12000); return; }
        cfg._models = r.models || [];
        if (!cfg.model && cfg._models.length) cfg.model = cfg._models[0];
        draw();
        toast(r.has_model || !cfg.model ? `Связь есть. Моделей: ${cfg._models.length}` : `Связь есть, но модели «${cfg.model}» на сервере нет — выберите из списка.`, !r.has_model && !!cfg.model, 7000);
      } catch (e) { if (!e.cancelled) toast(e.message, true, 10000); } finally { Busy.off(); }
    }
    function advanced() {
      const d = h('<details class="card more" style="margin-top:14px"><summary>Дополнительно</summary></details>');
      const r1 = h('<div class="row2"></div>');
      r1.appendChild(field('Температура', cfg, 'temperature', {inputmode: 'decimal', placeholder: '0,2'}));
      r1.appendChild(field('Контекст, токенов', cfg, 'num_ctx', {inputmode: 'numeric', placeholder: '16384'}));
      d.appendChild(r1);
      const r2 = h('<div class="row2"></div>');
      r2.appendChild(field('Ожидание ответа, с', cfg, 'timeout', {inputmode: 'numeric', placeholder: '600'}));
      r2.appendChild(field('Объём выжимки, символов', cfg, 'max_chars', {inputmode: 'numeric', placeholder: '14000'}));
      d.appendChild(r2);
      d.appendChild(field('Иллюстраций при анализе', cfg, 'illustrations', {inputmode: 'numeric', placeholder: '2', hint: 'Сколько рисунков модель рисует сама при построении плана (0 — только по кнопке).'}));
      return d;
    }

    /* модели поиска фраз и названий картинок (1.7): только в сети Компании или на этом телефоне */
    const aux = () => ({embed_url: cfg.embed_url.trim(), embed_model: cfg.embed_model.trim(), vision_url: cfg.vision_url.trim(), vision_model: cfg.vision_model.trim()});
    function auxEl() {
      const d = h('<details class="card more aux"><summary>Модели поиска и названий</summary></details>');
      d.open = !!(cfg.embed_model || cfg.vision_model);
      d.appendChild(h(`<p class="hint" style="margin-top:0"><b>Модель поиска</b> сравнивает готовые предложения из документов и «📚 Библиотеки материалов» со слайдом и ничего не пишет сама: режим «+ поиск фраз» и «🔎 Подходящие фразы» у слайда. Например, <b>bge-m3</b> в Ollama.
        <b>Модель для названий</b> смотрит на свои фото, даёт им название по содержанию и предлагает эффекты к фото. Например, <b>qwen2.5vl:7b</b> или <b>gemma3:4b</b>.
        Обе работают на компьютере в сети Wi-Fi или в сети Компании — материалы наружу не уходят. Без них фразы ищутся по совпадению слов.</p>`));
      if (cfg.base_url && cfg.provider === 'ollama') {
        const same = h('<button class="btn ghost small wide" type="button">Тот же адрес, что у основной модели</button>');
        same.addEventListener('click', () => { cfg.embed_url = cfg.vision_url = cfg.base_url.trim(); draw(); });
        d.appendChild(same);
      }
      d.appendChild(field('Адрес модели поиска', cfg, 'embed_url', {inputmode: 'url', placeholder: 'http://192.168.1.10:11434'}));
      d.appendChild(field('Модель поиска', cfg, 'embed_model', {placeholder: 'bge-m3'}));
      d.appendChild(field('Адрес модели для названий', cfg, 'vision_url', {inputmode: 'url', placeholder: 'http://192.168.1.10:11434'}));
      d.appendChild(field('Модель для названий картинок', cfg, 'vision_model', {placeholder: 'qwen2.5vl:7b'}));
      const res = h('<p class="hint aux-res"></p>'), pic = h('<img class="aux-pic hidden" alt="Снимок, который назвала модель">');
      const row = h('<div class="row2" style="margin-top:10px"><button class="btn ghost small" type="button">Проверить поиск</button><button class="btn ghost small" type="button">Проверить названия</button></div>');
      const [be, bv] = $$('button', row);
      async function test(kind) {
        res.className = 'hint aux-res';
        res.textContent = kind === 'embed' ? 'Проверяю модель поиска…' : 'Модель смотрит на пробный снимок… Первый запрос загружает модель в память — до пары минут.';
        pic.classList.add('hidden');
        be.disabled = bv.disabled = true;
        try {
          const r = (await Engine.post(kind === 'embed' ? '/api/llm/embed_test' : '/api/llm/vision_test', {llm: Object.assign(fields(), aux())})).json();
          if (!r.ok) { res.className = 'hint aux-res warn-txt'; res.textContent = '✕ ' + (r.error || 'нет ответа'); return; }
          if (kind === 'embed') {
            const good = r.near > r.far;
            res.textContent = `✓ Модель поиска «${r.model}» отвечает: вектор из ${r.dims} чисел, ${fmtTime(r.seconds)}. Близость похожих фраз ${String(r.near).replace('.', ',')}, далёких — ${String(r.far).replace('.', ',')}`
              + (good ? ' — различает смысл.' : ' — похоже, это не модель поиска. Нужна, например, bge-m3.');
            if (!good) res.className = 'hint aux-res warn-txt';
          } else {
            res.textContent = `✓ «${r.model}» назвала ${r.url ? 'снимок' : 'рисунок'} за ${fmtTime(r.seconds)}: «${r.name}»${r.tags && r.tags.length ? ' · слова для поиска: ' + r.tags.join(', ') : ''}.`;
            if (r.url) { engineImage(r.url).then(u => { if (u) { pic.src = u; pic.classList.remove('hidden'); } }); }
          }
        } catch (e) { res.className = 'hint aux-res warn-txt'; res.textContent = '✕ ' + e.message; }
        finally { be.disabled = bv.disabled = false; }
      }
      be.addEventListener('click', () => test('embed'));
      bv.addEventListener('click', () => test('vision'));
      d.appendChild(row); d.appendChild(res); d.appendChild(pic);
      return d;
    }

    /* встроенная модель: скачать, выбрать, удалить */
    async function drawDevice() {
      const box = h('<div></div>');
      slot.appendChild(box);
      const why = LocalLLM.reason();
      if (why && why !== 'reload') { box.appendChild(h(`<p class="hint warn-txt">${esc(why)}</p>`)); return; }
      if (why === 'reload') {
        if (!(navigator.serviceWorker && navigator.serviceWorker.controller)) {
          box.appendChild(h('<p class="hint warn-txt">Встроенной модели нужен установленный конструктор: откройте его по адресу https и добавьте на экран «Домой», затем вернитесь сюда.</p>'));
          return;
        }
        box.appendChild(h('<p class="hint">Чтобы включить встроенную модель, конструктор один раз перезапустится. План и файлы сохранятся.</p>'));
        const b = h('<button class="btn primary wide" type="button">Включить и перезапустить</button>');
        b.addEventListener('click', async () => {
          await saveProject();
          navigator.serviceWorker.addEventListener('message', ev => { if (ev.data === 'isolate-ok') location.reload(); });
          navigator.serviceWorker.controller.postMessage('isolate-on');
          setTimeout(() => location.reload(), 1500);
        });
        box.appendChild(b);
        return;
      }
      box.appendChild(h('<p class="hint">Модель работает на видеочипе телефона: документы никуда не отправляются, интернет нужен только чтобы скачать её один раз (лучше по Wi-Fi). Ответ занимает от десятков секунд до нескольких минут.</p>'));
      if (!cfg.model) cfg.model = LocalLLM.MODELS[0].id;
      for (const m of LocalLLM.MODELS) {
        const have = await LocalLLM.inCache(m.id);
        const on = cfg.model === m.id;
        const c = h(`<div class="item${on ? ' sel' : ''}" role="button" tabindex="0"><div class="item-head"><span class="radio-dot${on ? ' on' : ''}"></span><b style="color:var(--heading)"></b><span class="sp"></span><small class="hint" style="margin:0"></small></div>
          <p class="hint" style="margin:4px 0 8px"></p><div class="row2"></div></div>`);
        $('b', c).textContent = m.name;
        $('small', c).textContent = have ? '✓ скачана' : m.size;
        $('p', c).textContent = m.note;
        c.addEventListener('click', e => { if (!e.target.closest('button')) { cfg.model = m.id; draw(); } });
        const row = $('.row2', c);
        if (!have) {
          const dl = h('<button class="btn primary small" type="button">Скачать</button>');
          dl.addEventListener('click', () => download(m));
          row.appendChild(dl);
        } else {
          const del = h('<button class="btn ghost small" type="button">Удалить</button>');
          del.addEventListener('click', async () => {
            if (!await confirmSheet(`Удалить модель ${m.name} из телефона?`, 'Удалить', true)) return;
            await LocalLLM.remove(m.id).catch(e => toast(e.message, true));
            draw();
          });
          row.appendChild(del);
        }
        box.appendChild(c);
      }
      box.appendChild(advanced());
    }
    async function download(m) {
      cfg.model = m.id;
      Busy.on(`Скачиваю модель ${m.name}…`, {detail: 'Один раз. Не закрывайте конструктор и не блокируйте экран.'});
      try {
        await LocalLLM.ensure(m.id, (f, t) => Busy.text(`Скачиваю модель ${m.name}…`, `${esc(t)}<div class="bar"><i style="width:${Math.max(3, Math.round(f * 100))}%"></i></div>`));
        toast(`Модель ${m.name} готова к работе`);
      } catch (e) { toast('Модель не загрузилась: ' + e.message, true, 12000); } finally { Busy.off(); }
      draw();
    }

    /* облачный сервис */
    function drawCloud() {
      const box = h('<div></div>');
      if (!st.cloud_allowed) { box.appendChild(h('<p class="warn-txt">Облачные модели отключены администратором.</p>')); slot.appendChild(box); return; }
      const groups = st.groups.filter(g => g[0] !== 'local');
      const sel = h('<label class="fld"><span>Сервис</span><select></select></label>');
      $('select', sel).innerHTML = '<option value="">— выберите —</option>' + groups.map(([g, t]) => `<optgroup label="${esc(t)}">${st.providers.filter(p => p.group === g).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</optgroup>`).join('');
      $('select', sel).value = cfg.provider;
      $('select', sel).addEventListener('change', e => {
        const p = prov.get(e.target.value) || {};
        Object.assign(cfg, {provider: e.target.value, base_url: p.base_url || '', model: p.model || '', api_key: (L.api_keys || {})[e.target.value] || '', _models: p.models || []});
        draw();
      });
      box.appendChild(sel);
      const p = prov.get(cfg.provider);
      if (p) {
        box.appendChild(h(`<p class="hint">${esc(p.hint || '')}${p.note ? '<br>' + esc(p.note) : ''}${p.key_url ? `<br>Ключ: <a href="${esc(p.key_url)}" target="_blank" rel="noopener">${esc(p.key_url.replace(/^https:\/\//, ''))}</a>` : ''}</p>`));
        if (!cfg._models && p.models) cfg._models = p.models;
        box.appendChild(modelField());
        box.appendChild(field(p.key_required ? 'Ключ API' : 'Ключ API (если нужен)', cfg, 'api_key', {placeholder: 'вставьте ключ'}));
        box.appendChild(field('Адрес', cfg, 'base_url', {inputmode: 'url', placeholder: p.base_url}));
        box.appendChild(h('<label class="sw"><input type="checkbox" data-c><span>Согласен: текст документов отправляется в этот сервис</span></label>'));
        $('[data-c]', box).checked = cfg.cloud_consent;
        $('[data-c]', box).addEventListener('change', e => { cfg.cloud_consent = e.target.checked; });
        box.appendChild(h('<p class="hint">Не все облачные сервисы принимают запросы прямо из браузера телефона. Если связи нет — используйте шлюз Компании («Другой облачный сервис») или модель на компьютере.</p>'));
        const test = h('<button class="btn ghost wide" type="button">Проверить связь</button>');
        test.addEventListener('click', check);
        box.appendChild(test);
        box.appendChild(advanced());
      }
      slot.appendChild(box);
    }

    save.addEventListener('click', async () => {
      const o = Object.assign(where === 'none' ? {model: ''} : fields(), aux());
      if (where !== 'none' && !o.model) { toast('Выберите модель: нажмите «Найти модели» или «Проверить связь».', true, 6000); return; }
      if (where === 'device' && LocalLLM.reason()) { toast('Встроенная модель в этом браузере пока недоступна — см. подсказку выше.', true, 6000); return; }
      if (where === 'device' && !await LocalLLM.inCache(o.model)) { toast('Сначала скачайте выбранную модель.', true, 6000); return; }
      if (where === 'cloud' && !o.cloud_consent) { toast('Для облачного сервиса нужно согласие на отправку текста документов.', true, 6000); return; }
      try {
        await apiJSON('POST', '/api/settings', {llm: o});
        await App.refreshStatus();
        sh.close();
        toast(where === 'none' ? 'Модель ИИ отключена — план строится по правилам.' : `Модель подключена: ${o.model}`);
      } catch (e) { toast(e.message, true, 8000); }
    });
    draw();
    if (where === 'pc' && onBridge && !cfg.model) find();
  }
  function aiSub() {
    const l = state.status && state.status.llm;
    if (!l || !l.model) return 'Не подключена — план строится по правилам';
    let where = '';
    if (l.provider === 'browser') return `🧠 Встроенная · ${(LocalLLM.MODELS.find(m => m.id === l.model) || {name: l.model}).name}`;
    try { const u = new URL(l.base_url); where = /\/ai\/\d+/.test(u.pathname) ? ' · на компьютере' : (LocalAI.isLoop(u.hostname) ? ' · на телефоне' : (l.cloud ? '' : ` · ${u.hostname}`)); } catch (e) { /* адрес по умолчанию */ }
    return `${l.cloud ? '☁ ' : ''}${l.provider_name || l.provider} · ${l.model}${where}`;
  }

  /* ---------------------------------------------------------------- шаблоны оформления */
  async function templates() {
    const body = h('<div></div>');
    const add = h('<label class="btn primary" style="position:relative">＋ Загрузить свой шаблон<input type="file" accept=".pptx,.potx,.ppsx" multiple style="position:absolute;inset:0;opacity:0"></label>');
    const sh = openSheet({title: 'Шаблоны оформления', full: true, back: true, body, foot: add});
    async function draw() {
      let d;
      try { d = await apiJSON('GET', '/api/templates'); } catch (e) { body.innerHTML = `<p class="warn-txt">${esc(e.message)}</p>`; return; }
      state.templates = d.templates || [];
      Materials.renderTemplates();
      body.innerHTML = '';
      body.appendChild(h('<p class="hint" style="margin-top:0">Презентация собирается в выбранном шаблоне. Свой шаблон — файл PowerPoint (.pptx или .potx) с макетами и темой Компании или заказчика.</p>'));
      const cur = Materials.template();
      state.templates.forEach(t => {
        const id = t.builtin ? '' : t.id;
        const c = h(`<div class="tpl-card${id === cur ? ' on' : ''}"><h4></h4><small class="hint"></small><div class="tpl-shots"></div><div class="swatches"></div><div class="row2" style="margin-top:10px"></div></div>`);
        $('h4', c).textContent = t.name;
        $('small', c).textContent = t.builtin ? 'Корпоративный шаблон АО «Зарубежнефть»' : `${t.file || ''}${t.aspect ? ' · ' + t.aspect : ''}`;
        [t.primary, t.accent].filter(Boolean).forEach(x => $('.swatches', c).appendChild(h(`<i style="background:#${esc(x)}"></i>`)));
        const shots = $('.tpl-shots', c);
        for (let i = 0; i < 4; i++) shots.appendChild(h('<div class="s"></div>'));
        tplShots(t, shots);
        const row = $('.row2', c);
        const use = h(`<button class="btn ${id === cur ? 'ghost' : 'primary'} small" type="button">${id === cur ? '✓ Выбран' : 'Выбрать'}</button>`);
        use.addEventListener('click', () => { $('#optTpl').value = id; $('#optTpl').dispatchEvent(new Event('change')); draw(); toast(`Шаблон «${t.name}»`); });
        row.appendChild(use);
        if (!t.builtin) {
          const ed = h('<button class="btn ghost small" type="button">Настроить</button>');
          ed.addEventListener('click', () => editTpl(t, draw));
          row.appendChild(ed);
        }
        (t.warnings || []).slice(0, 2).forEach(w => c.appendChild(h(`<p class="hint">⚠ ${esc(w)}</p>`)));
        body.appendChild(c);
      });
    }
    $('input', add).addEventListener('change', async e => {
      const files = Array.from(e.target.files || []); e.target.value = '';
      if (!files.length) return;
      const fd = new FormData(); files.forEach(f => fd.append('files', f, f.name));
      Busy.on('Разбираю шаблон…');
      try {
        const r = await Engine.api('POST', '/api/templates', {form: fd});
        const d = r.json();
        (d.errors || []).forEach(x => toast(x, true, 8000));
        if ((d.added || []).length) {
          toast(`Шаблон добавлен: ${d.added.map(t => t.name).join(', ')}`);
          $('#optTpl').innerHTML += '';
          await draw();
          const t = d.added[d.added.length - 1];
          $('#optTpl').value = t.id; $('#optTpl').dispatchEvent(new Event('change'));
          await draw();
        } else if (!r.ok && !(d.errors || []).length) toast(d.error || 'Шаблон не добавлен', true);
      } catch (err) { toast(err.message, true); } finally { Busy.off(); }
    });
    draw();
    return sh;
  }
  const SHOTS = new Map();
  async function tplShots(t, box) {
    const k = t.id + ':' + (t.rev || '');
    const fill = views => views.forEach((v, i) => { const s = box.children[i]; if (s && v) SlidesView.put(s, v); });
    if (SHOTS.has(k)) { fill(SHOTS.get(k)); return; }
    if (!SlidesView.available()) { box.classList.add('hidden'); return; }
    try {
      const r = await Engine.get(`/api/m/template_deck/${encodeURIComponent(t.id)}`);
      if (!r.ok) throw new Error(r.json().error);
      const dk = await SlidesView.deck(r.body);
      const views = [0, 1, 2, 3].map(i => dk.view(i));
      SHOTS.set(k, views); fill(views);
    } catch (e) { box.classList.add('hidden'); }
  }
  function editTpl(t, redraw) {
    const o = {name: t.name, primary: t.primary || '', accent: t.accent || '', roles: Object.assign({}, t.roles || {})};
    const body = h('<div></div>');
    body.appendChild(field('Название', o, 'name'));
    const r = h('<div class="row2"></div>');
    r.appendChild(field('Основной цвет', o, 'primary', {placeholder: t.auto_primary || '00326E'}));
    r.appendChild(field('Акцентный цвет', o, 'accent', {placeholder: t.auto_accent || '4BAF46'}));
    body.appendChild(r);
    body.appendChild(h('<p class="hint">Цвет — шесть знаков, например 00326E. Пусто — как в шаблоне.</p>'));
    const lays = (t.layouts || []).map(l => [l.key, l.name]);
    if (lays.length) {
      body.appendChild(h('<div class="sec-h">Макеты шаблона для слайдов</div>'));
      state.templateRoles && Object.entries(state.templateRoles).forEach(([role, name]) => body.appendChild(field(name, o.roles, role, {select: lays})));
    }
    const del = h('<button class="btn danger" type="button">Удалить</button>');
    const ok = h('<button class="btn primary" type="button">Сохранить</button>');
    const sh = openSheet({title: 'Шаблон', body, foot: [del, ok]});
    ok.addEventListener('click', async () => {
      Busy.on('Сохраняю шаблон…');
      try {
        await apiJSON('PATCH', `/api/templates/${encodeURIComponent(t.id)}`, {name: o.name, primary: o.primary.replace('#', ''), accent: o.accent.replace('#', ''), roles: o.roles});
        SHOTS.clear(); sh.close(); redraw(); toast('Шаблон сохранён');
      } catch (e) { toast(e.message, true); } finally { Busy.off(); }
    });
    del.addEventListener('click', async () => {
      if (!await confirmSheet(`Удалить шаблон «${t.name}»?`, 'Удалить', true)) return;
      try {
        await apiJSON('DELETE', `/api/templates/${encodeURIComponent(t.id)}`);
        if (Materials.template() === t.id) { $('#optTpl').value = ''; $('#optTpl').dispatchEvent(new Event('change')); }
        sh.close(); redraw(); toast('Шаблон удалён');
      } catch (e) { toast(e.message, true); }
    });
  }

  /* ---------------------------------------------------------------- мои презентации */
  async function projects() {
    const body = h('<div></div>');
    const nu = h('<button class="btn primary" type="button">＋ Новая презентация</button>');
    const sh = openSheet({title: 'Мои презентации', full: true, back: true, body, foot: nu});
    nu.addEventListener('click', () => { sh.close(); App.newProject(); });
    async function draw() {
      const all = (await DB.all().catch(() => [])).sort((a, b) => b.updated - a.updated);
      body.innerHTML = '';
      if (!all.length) { body.appendChild(h('<div class="empty"><h2>Пока пусто</h2><p>Планы сохраняются здесь сами, как только вы их построите или откроете.</p></div>')); return; }
      body.appendChild(h('<p class="hint" style="margin-top:0">Планы хранятся только на этом телефоне. Чтобы перенести план на компьютер — «Сохранить файлом» и откройте его в Windows-версии.</p>'));
      all.forEach(p => {
        const s0 = (p.spec.slides || []).find(s => s.layout !== 'title') || (p.spec.slides || [])[0] || {layout: 'title'};
        const c = h(`<div class="proj" role="button" tabindex="0"><div class="pic">${thumbSvg(p.spec.slides && p.spec.slides[0] ? p.spec.slides[0].layout : 'title')}</div>
          <div class="t"><b></b><small></small></div><button class="icon-btn" type="button" aria-label="Действия">⋯</button></div>`);
        $('b', c).textContent = p.title || 'Презентация';
        $('small', c).textContent = `${p.slides} слайдов · ${new Date(p.updated).toLocaleString('ru-RU', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}${p.id === state.projectId ? ' · открыта' : ''}`;
        c.addEventListener('click', e => { if (!e.target.closest('.icon-btn')) { sh.close(); openProject(p); } });
        $('.icon-btn', c).addEventListener('click', () => projMenu(p, draw, sh));
        body.appendChild(c);
        void s0;
      });
    }
    draw();
  }
  function openProject(p) {
    state.projectId = p.id;
    Plan.open(p.spec, {info: p.info, warnings: p.warnings}, null);
    state.projectId = p.id;
    App.go('plan');
    toast(`Открыт план «${p.title}»`);
  }
  function projMenu(p, redraw, parent) {
    const body = h('<div class="menu-group" style="margin:0"></div>');
    const sh = openSheet({title: p.title || 'Презентация', body});
    [['open', '📂', 'Открыть'], ['dup', '⧉', 'Сделать копию'], ['file', '💾', 'Сохранить файлом (.plan.json)'], ['del', '🗑', 'Удалить']].forEach(([a, ic, t]) => {
      const b = h(`<button class="menu-item" type="button"><i>${ic}</i><span><b>${esc(t)}</b></span></button>`);
      b.addEventListener('click', async () => {
        sh.close();
        if (a === 'open') { parent.close(); openProject(p); }
        if (a === 'dup') { await DB.put(Object.assign(clone(p), {id: 'p' + Date.now().toString(36), title: p.title + ' (копия)', updated: Date.now()})); redraw(); toast('Копия сохранена'); }
        if (a === 'file') saveFile(new Blob([JSON.stringify(p.spec, null, 2)], {type: 'application/json'}), (p.title || 'план').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 60) + '.plan.json');
        if (a === 'del' && await confirmSheet(`Удалить план «${p.title}» с телефона?`, 'Удалить', true)) {
          await DB.del(p.id);
          if (state.projectId === p.id) state.projectId = null;
          redraw(); toast('План удалён');
        }
      });
      body.appendChild(b);
    });
  }

  /* ---------------------------------------------------------------- вид: тема и размер текста (как «🎨 Вид» в Windows 1.7.1) */
  // [id, название, [фон, окно, текст]] — образец в окне «Вид»; сами цвета — в app.css (:root[data-theme])
  const THEMES = [
    ['', 'Как в телефоне', null],
    ['light', 'Светлая', ['#F2F5F9', '#FFFFFF', '#00669A']],
    ['dark', 'Тёмная', ['#07101D', '#0F1B2E', '#6CC4EE']],
    ['navy', 'Фирменная синяя', ['#04224A', '#093060', '#8AD3FF']],
    ['graphite', 'Графит', ['#17191C', '#22252A', '#7FC9F2']],
    ['sand', 'Тёплая светлая', ['#F4EEE2', '#FFFCF5', '#005E94']],
    ['contrast', 'Контрастная тёмная', ['#000000', '#000000', '#FFFFFF']],
    ['contrast-light', 'Контрастная светлая', ['#FFFFFF', '#FFFFFF', '#000000']],
  ];
  const LIGHT = ['light', 'sand', 'contrast-light'];
  const SIZES = [['m', 'Обычный'], ['l', 'Крупный'], ['xl', 'Очень крупный']];
  const curTheme = () => { const v = restore('theme', ''); return THEMES.some(t => t[0] === v) ? v : ''; };
  const curFz = () => { const v = restore('fz', 'l'); return SIZES.some(z => z[0] === v) ? v : 'l'; };
  function theme() {
    const body = h(`<div><div class="sec-h">Размер текста</div><div class="vm-row"></div>
      <div class="vm-sample"><b>Так выглядит текст</b><p>Презентация из документов в корпоративном шаблоне.</p>
        <p class="hint">Подсказки и подписи — тоже крупно и чётко.</p><p class="lk">Ссылка или кнопка</p></div>
      <div class="sec-h">Тема</div><div class="vm-themes"></div></div>`);
    const draw = () => {
      const th = curTheme(), fz = curFz();
      $('.vm-themes', body).innerHTML = THEMES.map(([id, name, c]) => `<button type="button" class="vm-theme${id === th ? ' on' : ''}" data-th="${id}" aria-pressed="${id === th}">
        ${c ? `<span class="vm-sw" style="background:${c[0]}; border: 1px solid ${c[2]}66"><i style="background:${c[1]}; border: 1px solid ${c[2]}88"></i><i style="background:${c[2]}"></i><i style="background: var(--grad-btn)"></i></span>`
          : '<span class="vm-sw vm-auto"><i style="background: var(--grad-btn)"></i></span>'}${esc(name)}</button>`).join('');
      $('.vm-row', body).innerHTML = SIZES.map(([id, name]) => `<button type="button" data-fz="${id}" class="${id === fz ? 'on' : ''}" aria-pressed="${id === fz}">${name}</button>`).join('');
      $$('.vm-theme', body).forEach(b => b.addEventListener('click', () => { setTheme(b.dataset.th); draw(); }));
      $$('.vm-row button', body).forEach(b => b.addEventListener('click', () => { setFz(b.dataset.fz); draw(); }));
    };
    draw();
    const done = h('<button class="btn primary" type="button">Готово</button>');
    const sh = openSheet({title: '🎨 Вид', sub: 'Запоминается в этом телефоне', body, foot: done});
    done.addEventListener('click', () => sh.close());
  }
  function viewSub() {
    const t = THEMES.find(x => x[0] === curTheme()), z = SIZES.find(x => x[0] === curFz());
    $('#moreThemeSub').textContent = `${t[1]} · ${z[1].toLowerCase()} текст`;
  }
  function setTheme(v) {
    const d = document.documentElement;
    if (v) { d.setAttribute('data-theme', v); store('theme', v); }
    else { d.removeAttribute('data-theme'); try { localStorage.removeItem('znm.theme'); } catch (e) { /* нет */ } }
    const dark = v ? !LIGHT.includes(v) : matchMedia('(prefers-color-scheme: dark)').matches;
    d.setAttribute('data-tone', dark ? 'dark' : 'light');
    const t = THEMES.find(x => x[0] === v);
    $('meta[name=theme-color]').setAttribute('content', !dark ? '#00326E' : (t && t[2] ? t[2][0] : '#07101D'));
    viewSub();
  }
  function setFz(v) {
    document.documentElement.setAttribute('data-fz', v);
    store('fz', v);
    viewSub();
  }

  /* ---------------------------------------------------------------- установка */
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  function install() {
    const body = h('<div class="help"></div>');
    const secure = window.isSecureContext;
    if (standalone()) body.appendChild(h('<p>✓ Конструктор уже установлен — он открывается значком на экране «Домой».</p>'));
    else if (isIOS()) body.appendChild(h(`<h4>iPhone и iPad</h4><ol>
      <li>Откройте эту страницу в <b>Safari</b>.</li>
      <li>Нажмите <b>«Поделиться»</b> — квадрат со стрелкой вверх.</li>
      <li>Выберите <b>«На экран „Домой“»</b> и нажмите <b>«Добавить»</b>.</li></ol>
      <p>Конструктор появится значком и будет открываться на весь экран, как обычное приложение.</p>`));
    else {
      body.appendChild(h(`<h4>Android</h4><ol><li>Нажмите кнопку ниже — или меню браузера <b>⋮</b> → <b>«Установить приложение»</b> (или «Добавить на гл. экран»).</li><li>Подтвердите установку.</li></ol>`));
      if (App.installPrompt) {
        const b = h('<button class="btn primary wide" type="button">📲 Установить</button>');
        b.addEventListener('click', async () => { App.installPrompt.prompt(); const r = await App.installPrompt.userChoice.catch(() => ({})); if (r.outcome === 'accepted') { App.installPrompt = null; sh.close(); } });
        body.appendChild(b);
      }
    }
    body.appendChild(h(`<h4>Без интернета</h4><p>${secure ? 'После первого запуска всё нужное хранится в телефоне: план, сборка .pptx, картинки и шаблоны работают без сети. Интернет нужен только облачной модели ИИ.' : 'Сейчас конструктор открыт по адресу без защиты (http) — работа без сети недоступна, каждый запуск загружает его с компьютера. Для работы без сети откройте конструктор по https (адрес выдаёт администратор).'}</p>`));
    const sh = openSheet({title: 'Установить на телефон', body});
  }

  /* ---------------------------------------------------------------- справка */
  function help(topic) {
    const body = h('<div class="help"></div>');
    if (topic === 'pc') {
      body.innerHTML = `<p>Модель ИИ на компьютере (Ollama, LM Studio, llama.cpp, Jan, GPT4All…) подключается проще всего, если открыть конструктор с самого компьютера:</p>
        <ol><li>На компьютере запустите <b>«Конструктор для телефона»</b> (файл из архива мобильной версии).</li>
        <li>Он покажет адрес вида <b>http://192.168.1.10:8060</b> и QR-код.</li>
        <li>Откройте этот адрес на телефоне (телефон — в той же сети Wi-Fi).</li>
        <li>«Ещё» → «Модель ИИ» → «На компьютере» — модели найдутся сами.</li></ol>
        <p>Можно и без него: укажите адрес компьютера и порт программы. Тогда программе нужно разрешить доступ из сети и запросы из браузера (CORS) — например, для Ollama переменные <b>OLLAMA_HOST=0.0.0.0</b> и <b>OLLAMA_ORIGINS=*</b>.</p>`;
      openSheet({title: 'Модель на компьютере', body});
      return;
    }
    body.innerHTML = `<h4>1. Материалы</h4><p>Добавьте документы: Word, PDF, PowerPoint, Excel, CSV, JSON или текст. Можно сразу несколько. Задайте название, количество слайдов и способ построения: по правилам или с моделью ИИ.</p>
      <h4>2. План</h4><p>Конструктор предлагает план слайдов в корпоративном шаблоне. Нажмите слайд, чтобы изменить текст, макет (их больше 30), таблицу, диаграмму или картинки. Есть «Варианты оформления» и «Замечание к слайду» — например, «сделай короче» или «покажи таблицей».</p>
      <h4>3. Просмотр и готовая презентация</h4><p>Слайды можно пролистать на весь экран. Кнопка «Скачать .pptx» собирает презентацию и предлагает отправить её — в PowerPoint, «Файлы», почту или мессенджер.</p>
      <h4>Фото библиотеки</h4><p>«Ещё» → «Библиотека картинок» → «📷 Фото» или «Картинки» у слайда: 158 фото нефтегаза, энергетики, стройки и экологии с Викисклада под открытыми лицензиями. Подходящие к слайду отмечены «★». Автор фото сам подписывается в заметках слайда, так требует лицензия. Фото скачивается при первом выборе и потом доступно без интернета. Эффект к фото — рамка, тень, круг, отражение, чёрно-белое и другие — выбирается в «Картинках» у слайда; без выбора его подбирает сборка.</p>
      <h4>Свои фото</h4><p>«Ещё» → «Библиотека картинок» или «Картинки» у слайда: «🖼 Свои фото» берёт снимки из галереи, «📷 Снять фото» — с камеры. Фото хранятся в телефоне, находятся поиском и ставятся на слайды так же, как картинки конструктора. Нажмите своё фото, чтобы дать ему название и автора и включить «В библиотеке фото» — тогда оно само подбирается к подходящим слайдам.</p>
      <h4>Что умеет телефон</h4><p>Тот же движок, что и в Windows-версии: анализ документов, планы, макеты, диаграммы, картинки, свои шаблоны, справка Word. Всё считается в самом телефоне — документы никуда не отправляются, если не выбрана облачная модель ИИ.</p>
      <h4>Проверка, словарь, версии</h4><p>«✔ Проверить» на экране «План»: замечания рецензента с исправлением одной кнопкой, сверка чисел с материалами, текст по словарю Компании, проверка готового файла и сравнение с эталонами. «👥 Версии» собирает из плана версии для правления, рабочую и внешнюю. «📎 Свои слайды» вставляет слайды из своего файла PowerPoint как есть.</p>
      <h4>Библиотека материалов</h4><p>«Ещё» → «Библиотека материалов»: прежние доклады и презентации. Из них берутся готовые фразы («🔎 Подходящие фразы» у слайда, режим «+ поиск фраз»), образцы для «Плана по образцу» и эталоны для проверки.</p>
      <h4>Только в Windows-версии</h4><p>Автопилот (папка «Входящие»), поиск и установка моделей ИИ на компьютере, 3D-модели, проверка готового файла по картинкам слайдов, фирменный шрифт интерфейса (на телефоне — системный шрифт, он сделан для экрана). Подробности — в инструкции к мобильной версии.</p>
      <h4>Вид</h4><p>Кнопка 🎨 вверху или «Ещё» → «Вид»: семь тем (светлая, тёмная, фирменная синяя, графит, тёплая и две контрастные) или «Как в телефоне», и размер текста — обычный, крупный или очень крупный. В каждом окне справа вверху есть крестик ✕, он закрывает окно.</p>
      <h4>Перенос на компьютер</h4><p>«Сохранить план» даёт файл .plan.json — его открывает и Windows-версия, и наоборот.</p>`;
    openSheet({title: 'Как это работает', body});
  }

  /* ---------------------------------------------------------------- память */
  async function storage() {
    const body = h('<div></div>');
    const sh = openSheet({title: 'Память телефона', body});
    let est = {};
    try { est = await navigator.storage.estimate(); } catch (e) { /* нет */ }
    let persisted = false;
    try { persisted = await navigator.storage.persisted(); } catch (e) { /* нет */ }
    const n = (await DB.all().catch(() => [])).length;
    const mb = x => x ? (x / 1048576).toFixed(0) + ' МБ' : '—';
    body.appendChild(h(`<div class="kv"><span>Занято</span><b>${mb(est.usage)}</b><span>Доступно браузеру</span><b>${mb(est.quota)}</b><span>Планов сохранено</span><b>${n}</b><span>Защита от очистки</span><b>${persisted ? 'включена' : 'нет'}</b></div>`));
    body.appendChild(h('<p class="hint">Большую часть занимает сам конструктор (движок и корпоративный шаблон) — так он работает без интернета.</p>'));
    if (!persisted && navigator.storage && navigator.storage.persist) {
      const b = h('<button class="btn ghost wide" type="button">Не удалять мои данные при нехватке места</button>');
      b.addEventListener('click', async () => { const ok = await navigator.storage.persist().catch(() => false); toast(ok ? 'Готово: браузер не будет удалять данные конструктора' : 'Браузер не разрешил. Установите конструктор на экран «Домой» — тогда данные хранятся надёжнее.', !ok, 7000); sh.close(); });
      body.appendChild(b);
    }
    const upd = h('<button class="btn ghost wide" type="button" style="margin-top:10px">Проверить обновление</button>');
    upd.addEventListener('click', () => { sh.close(); App.checkUpdate(true); });
    body.appendChild(upd);
  }

  function init() {
    $$('[data-m]').forEach(b => b.addEventListener('click', () => {
      const m = b.dataset.m;
      if (m === 'ai') openAi();
      if (m === 'templates') templates();
      if (m === 'projects') projects();
      if (m === 'openPlan') Plan.openPlanFile();
      if (m === 'report') Materials.report();
      if (m === 'photos') Pictures.openLibrary();
      if (m === 'library') Library.open();
      if (m === 'dict') Dict.open();
      if (m === 'theme') theme();
      if (m === 'install') install();
      if (m === 'help') help();
      if (m === 'storage') storage();
    }));
    setTheme(curTheme());
    setFz(curFz());
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => setTheme(curTheme()));
  }
  function refresh() { $('#moreAiSub').textContent = aiSub(); }
  return {init, openAi, refresh, projects, theme, help, install, standalone, isIOS};
})();
