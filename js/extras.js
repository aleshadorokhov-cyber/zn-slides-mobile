/* extras.js — возможности Windows-версии 1.7: «📚 Библиотека материалов» (фразы и «План по образцу»),
   «🔎 Подходящие фразы» у слайда, свои слайды из PowerPoint, значки пунктов и их подложка. */
'use strict';
const plSlides = k => `${k} ${k % 10 === 1 && k % 100 !== 11 ? 'слайд' : (k % 10 >= 2 && k % 10 <= 4 && (k % 100 < 12 || k % 100 > 14) ? 'слайда' : 'слайдов')}`;

/* ---------------------------------------------------------------- библиотека материалов */
const Library = (() => {
  let last = null;                  // последний ответ /api/library: образцы для «Плана по образцу»
  async function load() { last = await apiJSON('GET', '/api/library'); Materials.examples(last.items || []); return last; }
  async function items() { return (await load()).items || []; }
  const size = n => n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' МБ' : Math.max(1, Math.round(n / 1024)) + ' КБ';
  const date = t => { try { return new Date(typeof t === 'number' ? t * 1000 : t).toLocaleDateString('ru-RU'); } catch (e) { return ''; } };

  /* файлы в библиотеку; ref — сразу эталоны. Возвращает, сколько добавлено */
  async function add(files, ref) {
    const list = files.filter(f => (ref ? ['pptx'] : OK_EXT).includes((f.name.split('.').pop() || '').toLowerCase()));
    const errs = [];
    if (files.length > list.length) errs.push(ref ? 'эталоном может быть только презентация PowerPoint (.pptx)' : `не подходят: ${files.length - list.length}`);
    let added = 0;
    for (let i = 0; i < list.length; i++) {
      Busy.on(`Читаю «${list[i].name}»…`, {detail: list.length > 1 ? `${i + 1} из ${list.length}` : ''});
      try {
        const fd = new FormData();
        fd.append('file', list[i], list[i].name);
        if (ref) fd.append('ref', '1');
        const r = await apiJSON('POST', '/api/library', fd);
        if (r.item && r.item.duplicate && !ref) errs.push(`«${list[i].name}» уже есть в библиотеке`);
        else if (ref && !(r.item && r.item.ref)) errs.push(`«${list[i].name}»: ${((r.item || {}).warnings || [])[0] || 'не стал эталоном'}`);
        else added++;
      } catch (e) { errs.push(e.message); }
    }
    Busy.off();
    if (errs.length) toast(errs.slice(0, 3).join('; ') + (errs.length > 3 ? ` и ещё ${errs.length - 3}` : ''), true, 10000);
    else if (added) toast(ref ? `Эталонов добавлено: ${added}` : `Добавлено в библиотеку: ${added}`);
    return added;
  }

  function open() {
    const body = h(`<div class="libm">
      <p class="hint" style="margin-top:0">Прежние доклады, справки, отчёты и презентации. Из них конструктор берёт готовые фразы для слайдов — они предлагаются у слайда в блоке «🔎 Подходящие фразы» с пометкой «библиотека» и сами на слайды не встают. Презентации PowerPoint — ещё и образцы для «Плана по образцу»: вид и порядок слайдов берутся из похожих слайдов. Тексты и числа остаются из материалов доклада.</p>
      <div class="libm-ready card"></div><div class="libm-list"></div></div>`);
    const add1 = h('<label class="btn primary upl">⇪ Добавить в библиотеку<input type="file" multiple accept=".docx,.pdf,.pptx,.xlsx,.xlsm,.csv,.json,.txt,.md"></label>');
    const sh = openSheet({title: '📚 Библиотека материалов', full: true, back: true, body, foot: add1});
    let timer = 0;
    async function draw() {
      clearTimeout(timer);
      let r;
      try { r = await load(); } catch (e) { $('.libm-list', body).innerHTML = `<p class="warn-txt">${esc(e.message)}</p>`; return; }
      const st = r.status || {}, list = r.items || [];
      const nref = list.filter(e => e.ref).length;
      const lines = [];
      if (st.phrases) {
        let t = `Фраз в библиотеке: <b>${fmtK(st.phrases)}</b>`;
        if (st.error || !st.model) t += '<br><small>Модель поиска не задана — фразы ищутся по совпадению слов. Задать её: «Ещё» → «Модель ИИ» → «Модели поиска и названий».</small>';
        else if (st.ready >= (st.texts || st.phrases)) t += ` · все готовы к поиску по смыслу (модель ${esc(st.model)})`;
        else t += ` · готово к поиску по смыслу: <b>${fmtK(st.ready)}</b> из ${fmtK(st.texts || st.phrases)}${st.warming ? ' — готовлю остальные…' : ''}`;
        lines.push(t);
      }
      if (st.decks) lines.push(`Презентаций-образцов для «Плана по образцу»: <b>${st.decks}</b>`);
      lines.push(nref ? `Эталонов ⭐: <b>${nref}</b> — с ними сравнивается презентация («✔ Проверить» → «⭐ Эталоны»)` : 'Отметьте ☆ лучшие презентации — они станут эталонами для сравнения («✔ Проверить» → «⭐ Эталоны»).');
      $('.libm-ready', body).innerHTML = lines.map(x => `<p>${x}</p>`).join('');
      const box = $('.libm-list', body);
      box.innerHTML = '';
      if (!list.length) box.appendChild(h('<p class="hint">Библиотека пуста. Нажмите «⇪ Добавить в библиотеку»: прежние доклады, справки, отчёты, презентации.</p>'));
      list.forEach(e => {
        const ext = (e.name.split('.').pop() || '').toLowerCase();
        const row = h(`<div class="libm-row"><span class="ftype ${esc(ext)}">${esc(ext.toUpperCase().slice(0, 4))}</span><span class="fname"><b></b><small></small></span></div>`);
        $('b', row).textContent = e.name;
        $('small', row).textContent = [date(e.added), size(e.size || 0), `фраз: ${fmtK(e.phrases || 0)}`, e.deck >= 2 ? `образец: ${plSlides(e.deck)}` : '', (e.warnings || [])[0] || ''].filter(Boolean).join(' · ');
        if (/\.pptx$/i.test(e.name)) {
          const star = h(`<button class="icon-btn star${e.ref ? ' on' : ''}" type="button" aria-label="${e.ref ? 'Эталон — снять отметку' : 'Сделать эталоном'}">${e.ref ? '★' : '☆'}</button>`);
          star.addEventListener('click', async () => {
            try { await apiJSON('PATCH', '/api/library/' + encodeURIComponent(e.id), {ref: !e.ref}); } catch (err) { toast(err.message, true); return; }
            toast(e.ref ? 'Отметка эталона снята' : 'Эталон: с ним сравнивается презентация в «✔ Проверить»');
            draw();
          });
          row.appendChild(star);
        }
        const del = h('<button class="icon-btn" type="button" aria-label="Убрать из библиотеки">🗑</button>');
        del.addEventListener('click', async () => {
          if (!await confirmSheet(`Убрать «${e.name}» из библиотеки? Фразы из него больше не будут предлагаться.`, 'Убрать', true)) return;
          try { await apiJSON('DELETE', '/api/library/' + encodeURIComponent(e.id)); } catch (err) { toast(err.message, true); return; }
          draw();
        });
        row.appendChild(del);
        box.appendChild(row);
      });
      if (st.warming && !sh.closed) timer = setTimeout(draw, 4000);
    }
    $('input', add1).addEventListener('change', async e => {
      const files = Array.from(e.target.files || []); e.target.value = '';
      if (files.length && await add(files, false)) draw();
    });
    $('.libm-list', body).innerHTML = '<p class="hint">Загружаю…</p>';
    draw();
  }
  return {open, add, items, load};
})();

/* ---------------------------------------------------------------- подходящие фразы у слайда */
const Phrases = (() => {
  const cache = new WeakMap();
  function slidePart(s) {
    const c = {};
    ['layout', 'title', 'subtitle', 'lead', 'center', 'conclusion', 'items', 'paragraphs', 'left', 'right', 'insights'].forEach(k => { if (s[k] !== undefined) c[k] = s[k]; });
    return c;
  }
  function has(s, t) {
    const norm = x => String(x || '').toLowerCase().replace(/[^0-9a-zа-яё]+/g, ' ').trim();
    const n = norm(t);
    const all = [s.lead, s.subtitle, s.conclusion, s.notes].concat((s.items || []).map(it => it && typeof it === 'object' ? (it.text || '') + ' ' + (it.title || '') : it),
      s.paragraphs || [], s.insights || [], (s.left || {}).items || [], (s.right || {}).items || []);
    return all.some(x => norm(x).includes(n));
  }
  function targets(s) {
    const k = kindOf(s.layout);
    if (k === 'items' && !NUMERIC.includes(s.layout) && s.layout !== 'agenda') return [['item', '+ пунктом']];
    if (k === 'image') return [['item', '+ тезисом']];
    if (k === 'text') return [['para', s.lead ? '+ абзацем' : '+ тезисом']];
    if (k === 'chart') return [['insight', '+ выводом']];
    if (k === 'compare') return [['left', '+ слева'], ['right', '+ справа']];
    return [];
  }
  function put(s, t, where) {
    if (where === 'item') s.items = (s.items || []).concat([{title: '', text: t}]);
    else if (where === 'para') { if (!s.lead) s.lead = t; else s.paragraphs = (s.paragraphs || []).concat([t]); }
    else if (where === 'insight') s.insights = (s.insights || []).concat([t]).slice(-4);
    else if (where === 'left' || where === 'right') { s[where] = s[where] || {title: '', items: []}; s[where].items = (s[where].items || []).concat([t]); }
    else s.notes = (s.notes ? s.notes.trim() + '\n' : '') + t;
    toast(where === 'notes' ? 'Фраза добавлена в заметки докладчика' : 'Фраза добавлена на слайд');
  }
  /* блок для редактора слайда; onAdd — перерисовать редактор */
  function el(s, onAdd) {
    const c = cache.get(s);
    const box = h(`<details class="card more phr"${c || (s.found || []).length ? ' open' : ''}><summary>🔎 Подходящие фразы${s.found_n ? ` · добавлено ${s.found_n}` : ''}</summary>
      <p class="hint" style="margin-top:0">Готовые предложения из материалов доклада и «📚 Библиотеки материалов». Модель поиска только находит их, сама ничего не пишет.</p>
      <div class="search"><input type="search" placeholder="Свои слова для поиска…" enterkeyhint="search"></div>
      <div class="row2" style="margin-top:8px"><button class="btn ghost small" type="button" data-a="find">Найти</button><button class="btn ghost small" type="button" data-a="auto">К слайду</button></div>
      <p class="hint phr-note"></p><div class="phr-list"></div></details>`);
    const inp = $('input', box), note = $('.phr-note', box), list = $('.phr-list', box);
    function show(items, msg) {
      note.textContent = msg || '';
      list.innerHTML = '';
      const tg = targets(s);
      (items || []).forEach(f => {
        const on = has(s, f.t);
        const row = h(`<div class="phr-item${on ? ' on' : ''}"><div class="t"></div><small></small><div class="ex-row"></div></div>`);
        $('.t', row).textContent = f.t;
        $('small', row).textContent = [f.lib ? '📚 библиотека' : '', f.src || '', f.sec && f.sec !== f.src ? f.sec : ''].filter(Boolean).join(' · ') + (f.num && f.lib ? ' · ⚠ есть числа: числа на слайдах — только из материалов доклада' : '');
        const btns = $('.ex-row', row);
        if (on) btns.appendChild(h('<span class="hint" style="margin:0">✓ на слайде</span>'));
        else tg.concat([['notes', '+ в заметки']]).forEach(([w, l]) => {
          const b = h('<button type="button"></button>'); b.textContent = l;
          b.addEventListener('click', () => { put(s, f.t, w); onAdd(); });
          btns.appendChild(b);
        });
        list.appendChild(row);
      });
    }
    async function run(q) {
      note.textContent = 'Ищу…';
      try {
        const r = await apiJSON('POST', '/api/phrases', {pool: (state.spec.meta || {}).pool || '', query: q || '', slide: slidePart(s), k: 12});
        const msg = (r.note ? phoneNote(r.note) + ' ' : '') + (r.items.length ? '' : 'Ничего подходящего не нашлось — попробуйте другие слова или пополните «📚 Библиотеку материалов».');
        cache.set(s, {q, items: r.items, note: msg.trim()});
        show(r.items, msg.trim());
      } catch (e) { note.textContent = e.message; }
    }
    $('[data-a=find]', box).addEventListener('click', () => run(inp.value.trim()));
    $('[data-a=auto]', box).addEventListener('click', () => { inp.value = ''; run(''); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(inp.value.trim()); } });
    if (c) { inp.value = c.q || ''; show(c.items, c.note); }
    else if ((s.found || []).length) show(s.found, '');
    else show([], 'Нажмите «К слайду» — подберу готовые фразы к этому слайду, или напишите свои слова и нажмите «Найти».');
    return box;
  }
  // подсказки движка написаны для Windows («окно «⚙ Модель ИИ»») — на телефоне это «Ещё» → «Модель ИИ»
  const phoneNote = t => String(t).replace(/в окне «⚙ Модель ИИ»/g, 'в «Ещё» → «Модель ИИ» → «Модели поиска и названий»');
  return {el, phoneNote};
})();

/* ---------------------------------------------------------------- свои слайды из PowerPoint */
const Own = (() => {
  const BG = [['corporate', 'Фирменный, как у остальных'], ['white', 'Белый'], ['source', 'Как в файле']];
  function slide(info, n, bg) {
    const s = info.slides[n - 1];
    return {layout: 'own', title: s.title || '', notes: s.notes || '', bg,
      own: {file: info.id, n, title_ph: !!s.title_ph, title_id: s.title_id || null, title0: s.title || '', name: info.name || '', dark: !!s.dark}};
  }
  async function open() {
    if (!state.spec) return;
    let info = null, pick = new Set(), run = 0;
    const o = {bg: 'corporate', at: ''};
    const body = h(`<div class="own">
      <label class="btn primary wide">⇪ Выбрать файл PowerPoint<input type="file" accept=".pptx,.potx,.ppsx,.ppt"></label>
      <label class="fld own-recent hidden"><span>…или файл, загруженный раньше</span><select></select></label>
      <p class="hint own-st"></p>
      <button class="btn ghost small own-all hidden" type="button">Выбрать все</button>
      <div class="own-grid"></div><div class="own-opts hidden"></div>
      <p class="hint">Переносится всё: текст, картинки, диаграммы с данными, таблицы. Содержимое такого слайда правится в PowerPoint; заголовок и фон — в плане.</p></div>`);
    const grid = $('.own-grid', body), st = $('.own-st', body), all = $('.own-all', body), opts = $('.own-opts', body);
    const go = h('<button class="btn primary" type="button" disabled>Вставить</button>');
    const sh = openSheet({title: '📎 Свои слайды из PowerPoint', full: true, back: true, body, foot: go, onClose: () => { run++; }});
    st.textContent = 'Выберите файл PowerPoint: здесь появятся его слайды. Нажмите нужные и «Вставить».';
    const arr = state.spec.slides;
    const endIdx = arr.length && arr[arr.length - 1].layout === 'end' ? arr.length - 1 : arr.length;
    const short = t => (t || '').length > 34 ? t.slice(0, 33) + '…' : (t || '');
    o.at = String(endIdx);
    opts.appendChild(field('Фон', o, 'bg', {select: BG}));
    opts.appendChild(field('Куда', o, 'at', {select: [[String(endIdx), `в конец${endIdx < arr.length ? ' (перед финальным слайдом)' : ''}`]]
      .concat(arr.slice(0, endIdx).map((s, i) => [String(i + 1), `после слайда ${i + 1}${s.title || s.layout === 'title' ? ' «' + short(s.layout === 'title' ? state.spec.meta.title : s.title) + '»' : ''}`]))}));
    try {
      const r = await apiJSON('GET', '/api/own');
      if (r.items.length) {
        const sel = $('.own-recent select', body);
        sel.innerHTML = '<option value="">— выберите —</option>' + r.items.map(f => `<option value="${esc(f.id)}">${esc(f.name)} · ${plSlides(f.n)}</option>`).join('');
        $('.own-recent', body).classList.remove('hidden');
        sel.addEventListener('change', async () => { if (sel.value) try { showInfo(await apiJSON('GET', '/api/own/' + encodeURIComponent(sel.value))); } catch (e) { toast(e.message, true); } });
      }
    } catch (e) { /* без списка — только новый файл */ }
    $('input[type=file]', body).addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      Busy.on(`Читаю «${f.name}»…`);
      try { const fd = new FormData(); fd.append('file', f, f.name); showInfo(await apiJSON('POST', '/api/own', fd)); }
      catch (err) { toast(err.message, true, 9000); } finally { Busy.off(); }
    });
    function showInfo(i) {
      info = i; pick = new Set();
      st.textContent = `«${info.name}»: ${plSlides(info.n)}${info.wide ? '' : ' (формат 4:3 — слайды встанут по центру)'}`;
      all.classList.remove('hidden'); opts.classList.remove('hidden');
      draw();
      thumbs(info);
    }
    function draw() {
      grid.innerHTML = '';
      info.slides.forEach(s => {
        const on = pick.has(s.n);
        const t = h(`<button type="button" class="own-tile${on ? ' on' : ''}" aria-pressed="${on}"><div class="pic"><span class="own-txt"><b></b><span></span></span></div><span class="own-n">${s.n}${s.hidden ? ' · скрытый' : ''}</span><span class="own-check">✓</span></button>`);
        $('.own-txt b', t).textContent = s.title || 'Без заголовка';
        $('.own-txt span', t).textContent = s.text || '';
        t.dataset.n = s.n;
        t.addEventListener('click', () => {
          if (pick.has(s.n)) pick.delete(s.n); else pick.add(s.n);
          t.classList.toggle('on', pick.has(s.n)); t.setAttribute('aria-pressed', pick.has(s.n));
          count();
        });
        grid.appendChild(t);
      });
      count();
    }
    // слайды файла — картинками, как в файле (рисует браузер, по шесть)
    async function thumbs(i) {
      if (!SlidesView.available()) return;
      const my = ++run;
      for (let a = 0; a < i.slides.length; a += 6) {
        if (my !== run || sh.closed) return;
        const part = i.slides.slice(a, a + 6);
        try {
          const views = await SlidesView.images(part.map(s => slide(i, s.n, 'source')), state.spec.meta, {numbers: part.map((_, k) => a + k + 1)});
          if (my !== run) return;
          views.forEach((v, k) => { const tile = grid.querySelector(`.own-tile[data-n="${part[k].n}"] .pic`); if (v && tile) SlidesView.put(tile, v); });
        } catch (e) { console.warn('own thumbs', e); return; }
      }
    }
    function count() {
      const k = pick.size;
      go.disabled = !k;
      go.textContent = k ? `Вставить ${plSlides(k)}` : 'Вставить';
      all.textContent = info && k === info.n ? 'Снять все' : 'Выбрать все';
    }
    all.addEventListener('click', () => { pick = pick.size === info.n ? new Set() : new Set(info.slides.map(s => s.n)); draw(); thumbs(info); });
    go.addEventListener('click', () => {
      if (!info || !pick.size) return;
      const at = Math.min(+o.at || 0, state.spec.slides.length);
      const add = [...pick].sort((a, b) => a - b).map(n => slide(info, n, o.bg));
      state.spec.slides.splice(at, 0, ...add);
      sh.close();
      planChanged();
      toast(`Вставлено: ${plSlides(add.length)} из «${info.name}». Фон каждого можно поменять, открыв слайд.`, false, 6000);
    });
  }
  return {open, BG};
})();

/* ---------------------------------------------------------------- значки пунктов и их подложка */
const Icons = (() => {
  let list = null;
  const SHAPES = [
    ['circle', 'Круг', '<circle cx="13" cy="13" r="10" fill="#00326E"/>'],
    ['hexagon', 'Шестиугольник', '<polygon points="3,13 8,4 18,4 23,13 18,22 8,22" fill="#00326E"/>'],
    ['rounded', 'Скруглённый квадрат', '<rect x="3" y="3" width="20" height="20" rx="5" fill="#00326E"/>'],
    ['drop', 'Капля', '<path d="M13 3 H23 V13 A10 10 0 1 1 13 3 Z" fill="#00326E"/>'],
    ['ring', 'Кольцо', '<circle cx="13" cy="13" r="9" fill="none" stroke="#00326E" stroke-width="2.6"/>'],
  ];
  const VOL = [['flat', 'Плоско'], ['bevel', 'Рельеф'], ['tilt', 'Рельеф и поворот']];
  const cur = () => ({shape: restore('iconShape', 'circle'), vol: restore('iconVol', 'flat')});
  async function load() {
    if (list) return list;
    try { list = await apiJSON('GET', '/api/icons'); } catch (e) { list = []; }
    return list;
  }
  const low = t => String(t || '').toLowerCase().replace(/ё/g, 'е');
  function matches(e, q) {
    const words = q.split(/[\s,.;:!?«»"()—–-]+/).filter(w => w.length >= 3);
    if (!words.length) return true;
    const hay = [low(e.ru), low(e.id.slice(2))].concat((e.words || []).map(low));
    return words.every(w => { const p = w.slice(0, Math.max(4, Math.min(w.length, 6))); return hay.some(x => x.includes(p) || (x.length >= 4 && w.startsWith(x))); });
  }
  function suggest(text, limit = 12) {
    const t = ' ' + low(text) + ' ';
    const out = [];
    (list || []).forEach(e => {
      let best = -1;
      (e.words || []).forEach(w => { const i = t.search(new RegExp('[^а-яa-z]' + low(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); if (i >= 0 && (best < 0 || i < best)) best = i; });
      if (best >= 0) out.push([best, e]);
    });
    return out.sort((a, b) => a[0] - b[0]).slice(0, limit).map(x => x[1]);
  }
  const url = id => `/api/icon/${encodeURIComponent(id)}.png`;
  function img(id) { const i = document.createElement('img'); i.alt = ''; lazyImg(i, url(id)); return i; }

  /* окно выбора значка для пункта it; onPick — после выбора */
  async function pick(it, n, onPick) {
    await load();
    const body = h(`<div class="icp"><p class="hint icp-item" style="margin-top:0"></p><div class="search"><input type="search" placeholder="Поиск: нефть, безопасность, рост, документ…"></div>
      <label class="fld"><span>Раздел</span><select></select></label><div class="sec-h icp-sh"></div><div class="ic-grid icp-sugg"></div><div class="sec-h icp-ah"></div><div class="ic-grid icp-all"></div></div>`);
    const auto = h('<button class="btn ghost" type="button">Подобрать автоматически</button>');
    const sh = openSheet({title: 'Значок', full: true, back: true, body, foot: auto});
    $('.icp-item', body).textContent = `Пункт ${n + 1}${it.title || it.text ? ` «${String(it.title || it.text).slice(0, 60)}»` : ''}. Без выбора значок подбирается сам по словам пункта.`;
    const cats = [...new Set(list.map(x => x.cat))];
    const sel = $('select', body);
    sel.innerHTML = '<option value="">Все разделы</option>' + cats.map(c => `<option>${esc(c)}</option>`).join('');
    const tile = e => {
      const b = h(`<button type="button" class="ic-tile${e.id === it.icon ? ' on' : ''}"><span></span></button>`);
      b.prepend(img(e.id)); $('span', b).textContent = e.ru;
      b.addEventListener('click', () => { it.icon = e.id; sh.close(); onPick(); });
      return b;
    };
    function draw() {
      const q = low($('input', body).value.trim()), c = sel.value;
      const found = list.filter(e => (!c || e.cat === c) && matches(e, q));
      const sg = q || c ? [] : suggest(`${it.title || ''} ${it.text || ''} ${it.label || ''}`);
      $('.icp-sh', body).textContent = sg.length ? 'Подходят по словам пункта' : '';
      $('.icp-sugg', body).replaceChildren(...sg.map(tile));
      $('.icp-ah', body).textContent = `Значков: ${found.length} из ${list.length}`;
      const all = $('.icp-all', body);
      all.replaceChildren(...found.slice(0, 240).map(tile));
      if (found.length > 240) all.appendChild(h('<p class="hint">Показаны первые 240 — уточните поиск или раздел.</p>'));
      if (!found.length) all.appendChild(h('<p class="hint">Ничего не нашлось — попробуйте другое слово.</p>'));
    }
    $('input', body).addEventListener('input', draw);
    sel.addEventListener('change', draw);
    auto.addEventListener('click', () => { delete it.icon; sh.close(); onPick(); });
    draw();
  }
  /* кнопка значка в карточке пункта */
  function button(it, n, onPick) {
    const b = h('<button class="icon-btn ic-btn" type="button" aria-label="Значок пункта"></button>');
    if (it.icon) b.appendChild(img(it.icon)); else b.appendChild(h('<span class="ic-auto">авто</span>'));
    b.addEventListener('click', () => pick(it, n, onPick));
    return b;
  }

  /* подложка значков — одна на всю презентацию (в «Дополнительно» на экране «Материалы») */
  function shapesEl() {
    const box = h(`<div class="fld ish"><span>Подложка значков</span><div class="ish-row"></div></div>`);
    const row = $('.ish-row', box);
    const vol = field('Объём подложки', {}, 'v', {select: VOL, get: () => cur().vol, set: v => set(null, v),
      hint: 'Рельеф и поворот видны в PowerPoint; в просмотре на телефоне подложка может выглядеть плоской.'});
    function draw() {
      const c = cur().shape;
      row.innerHTML = SHAPES.map(([id, name, svg]) => `<button type="button" class="ish-btn${id === c ? ' on' : ''}" data-s="${id}" aria-pressed="${id === c}" aria-label="${esc(name)}"><svg viewBox="0 0 26 26" aria-hidden="true">${svg}<path d="M9 13.5 l3 3 l5.5 -6" fill="none" stroke="${id === 'ring' ? '#00326E' : '#fff'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`).join('');
      $$('.ish-btn', row).forEach(b => b.addEventListener('click', () => { set(b.dataset.s, null); draw(); }));
    }
    draw();
    box.appendChild(vol);
    box.redraw = () => { draw(); $('select', vol).value = cur().vol; };
    return box;
  }
  function set(shape, vol) {
    const c = cur();
    if (shape && shape !== c.shape) { store('iconShape', shape); if (state.spec) { state.spec.meta.icon_shape = shape; Thumbs.reset(); planChanged(); } toast(`Подложка значков: ${SHAPES.find(x => x[0] === shape)[1].toLowerCase()}`); }
    if (vol && vol !== c.vol) { store('iconVol', vol); if (state.spec) { state.spec.meta.icon_3d = vol; Thumbs.reset(); planChanged(); } }
  }
  /* план следует выбранной подложке; план со своей подложкой (из файла) переключает выбор на неё */
  function sync(meta) {
    const c = cur();
    if (meta.icon_shape && SHAPES.some(x => x[0] === meta.icon_shape) && meta.icon_shape !== 'circle') store('iconShape', meta.icon_shape);
    else meta.icon_shape = c.shape;
    if (['bevel', 'tilt'].includes(meta.icon_3d)) store('iconVol', meta.icon_3d);
    else meta.icon_3d = c.vol;
    const el = document.querySelector('.ish');
    if (el && el.redraw) el.redraw();
  }
  return {pick, button, shapesEl, sync, load};
})();
