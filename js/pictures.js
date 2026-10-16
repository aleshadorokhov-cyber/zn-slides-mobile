/* pictures.js — картинки к слайду, картинки ко всей презентации, свои фото, рисунок модели ИИ. */
'use strict';
const Pictures = (() => {
  const LIB = {data: null, byId: new Map(), mine: null};
  const IMG_EXT = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tif', 'tiff', 'svg'];

  /* ---------------------------------------------------------------- как в Windows-версии: вариант слайда «с картинкой» */
  const isPicAlt = a => !!a && a.layout === 'image' && !!(a.pic_alt || a.illustration || (a.images || []).some(im => im.picture || im.upload || im.svg));
  const curPics = s => isPicAlt(s) ? (s.images || []).filter(im => im.picture || im.upload || im.svg) : [];
  const isFullPic = s => isPicAlt(s) && !s.illustration && !(s.items || []).length;
  function picBase(s) {
    if (!isPicAlt(s)) return s;
    const alts = s.alts || [], b = alts[s.pic_base];
    return (b && !isPicAlt(b)) ? b : (alts.find(a => !isPicAlt(a)) || s);
  }
  function leanSlide(s) {
    const b = picBase(s);
    return {layout: b.layout, title: s.title || b.title || '', lead: b.lead || '', center: b.center || '',
      paragraphs: (b.paragraphs || []).slice(0, 2),
      items: (b.items || []).slice(0, 8).map(it => (it && typeof it === 'object') ? {title: it.title || '', text: it.text || ''} : {title: String(it || '')})};
  }
  function swapSlide(s, a) { const arr = state.spec.slides, k = arr.indexOf(s); if (k >= 0) arr[k] = a; }
  function pick(s, i) { const a = chooseAlt(s, i); swapSlide(s, a); return a; }

  async function setSlidePictures(s, images, full) {
    if (!images.length) return dropPictures(s);
    const base = clone(picBase(s)); delete base.alts;
    const r = await apiJSON('POST', '/api/picture', {slide: base, images: images.slice(0, PIC_MAX), full: !!full});
    return addPictureAlt(s, r.alt);
  }
  function addPictureAlt(s, alt) {
    let alts = (s.alts && s.alts.length) ? s.alts.slice() : [];
    let bi;
    if (isPicAlt(s)) bi = alts.indexOf(picBase(s));
    else {
      const cur = clone(s); delete cur.alts; delete cur.alt_index; delete cur.notes;
      bi = alts.length ? Math.min(s.alt_index || 0, alts.length - 1) : 0;
      cur.alt_label = cur.alt_label || (alts[bi] && alts[bi].alt_label) || 'Текущий';
      if (alts.length) alts[bi] = cur; else alts = [cur];
    }
    const idx = alts.findIndex((a, i) => i !== bi && isPicAlt(a));
    if (idx >= 0) alts[idx] = alt;
    else {
      if (alts.length >= 5) {
        const r = alts.length - 1 === bi ? alts.length - 2 : alts.length - 1;
        alts.splice(r, 1);
        if (r < bi) bi--;
      }
      alts.push(alt);
    }
    alt.pic_base = bi >= 0 ? bi : undefined;
    s.alts = alts.slice(0, 5);
    const k = s.alts.indexOf(alt);
    return pick(s, k >= 0 ? k : s.alts.length - 1);
  }
  function dropPictures(s) {
    if (!isPicAlt(s)) return s;
    const base = picBase(s);
    const keep = (s.alts || []).filter(a => !isPicAlt(a));
    if (base !== s && keep.length > 1) { s.alts = keep; return pick(s, keep.indexOf(base)); }
    let a;
    if (base !== s) a = clone(base);
    else { a = clone(s); a.layout = 'list'; delete a.images; delete a.illustration; }
    ['alts', 'alt_index', 'pic_alt', 'pic_base'].forEach(k => delete a[k]);
    a.notes = s.notes || a.notes || '';
    if (s.section) a.section = s.section;
    if (s.title) a.title = s.title;
    swapSlide(s, a);
    return a;
  }

  /* ---------------------------------------------------------------- библиотека и свои картинки */
  async function ensureData() {
    if (!LIB.data) {
      LIB.data = await apiJSON('GET', '/api/pictures');
      LIB.byId = new Map(LIB.data.items.map(e => [e.id, e]));
    }
    if (!LIB.mine) LIB.mine = (await apiJSON('GET', '/api/uploads')).items || [];
    return LIB.data;
  }
  const myTitle = u => (u && u.name ? u.name.replace(/\.[^.]+$/, '') : '') || 'Своя картинка';
  function picName(im) {
    if (!im) return '';
    if (im.picture) {
      if (/^map_[A-Z0-9]{3}$/.test(im.picture)) {
        const c = LIB.data && LIB.data.countries.find(x => x.id === im.picture);
        return 'Карта: ' + (c ? c.name : im.picture.slice(4));
      }
      const e = LIB.byId.get(im.picture);
      return e ? e.name : im.picture;
    }
    if (im.upload) return myTitle((LIB.mine || []).find(x => x.upload === im.upload));
    if (im.svg) return im.ai ? 'Иллюстрация модели ИИ' : 'Векторный рисунок';
    return 'Рисунок из документа';
  }
  function imgEl(im) {
    const img = h('<img alt="" loading="lazy">');
    if (im.svg) { try { img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(im.svg))); } catch (e) { /* пусто */ } }
    else if (im.picture) lazyImg(img, `/api/pictures/${encodeURIComponent(im.picture)}.svg`);
    else if (im.upload) lazyImg(img, `/api/upload/${encodeURIComponent(im.upload)}`);
    return img;
  }
  // список для вкладки: ★ подходящие, свои, раздел библиотеки; при поиске — вся библиотека, карты и свои
  function list(cat, q, suggest) {
    const mine = (LIB.mine || []).map(u => ({upload: u.upload, name: myTitle(u), cat: 'своя'}));
    if (q) {
      const words = q.split(/\s+/).filter(Boolean);
      const hit = t => words.every(w => t.toLowerCase().includes(w));
      return mine.filter(e => hit(e.name)).concat(LIB.data.items.filter(e => hit(e.name + ' ' + e.cat)))
        .concat(LIB.data.countries.filter(c => hit(c.name)).map(c => ({id: c.id, name: 'Карта: ' + c.name, cat: 'Карты стран'})));
    }
    if (cat === 'mine') return mine;
    if (cat === 'maps') return LIB.data.countries.map(c => ({id: c.id, name: c.name, cat: 'Карты стран'}));
    if (cat === '★') return suggest;
    return LIB.data.items.filter(e => !cat || e.cat === cat);
  }
  const tileKey = e => e.upload ? 'u:' + e.upload : 'p:' + e.id;

  /* общий выбор картинок: поиск, вкладки, сетка плиток, загрузка своих */
  function chooser({starLabel, suggest, isOn, onToggle, onUploaded, start}) {
    const box = h(`<div>
      <div class="search"><input type="search" placeholder="Найти: нефть, скважина, команда, Вьетнам…"></div>
      <div class="tabs-row"></div>
      <div class="row2 add-pics">
        <label class="btn ghost small">🖼 Свои фото<input type="file" accept="image/*,.svg" multiple></label>
        <label class="btn ghost small">📷 Снять фото<input type="file" accept="image/*" capture="environment"></label></div>
      <div class="pic-grid"></div></div>`);
    const q = $('input[type=search]', box), tabs = $('.tabs-row', box), grid = $('.pic-grid', box);
    let cat = start !== undefined ? start : (suggest.length ? '★' : '');
    function drawTabs() {
      const cats = (suggest.length ? ['★'] : []).concat(['mine', '', 'maps']).concat(LIB.data.categories.filter(c => c !== 'Карты стран'));
      const label = c => c === '★' ? starLabel : (c === 'mine' ? `Мои${LIB.mine.length ? ' · ' + LIB.mine.length : ''}` : (c === 'maps' ? '🗺 Карты стран' : (c || 'Все')));
      const query = q.value.trim();
      tabs.innerHTML = cats.map(c => `<button type="button" data-c="${esc(c)}" class="${c === cat && !query ? 'on' : ''}">${esc(label(c))}</button>`).join('');
      $$('button', tabs).forEach(b => b.addEventListener('click', () => { cat = b.dataset.c; q.value = ''; draw(); }));
    }
    function draw() {
      drawTabs();
      const query = q.value.trim().toLowerCase();
      const arr = list(cat, query, suggest).slice(0, 180);
      grid.innerHTML = '';
      if (!arr.length) {
        grid.appendChild(h(`<p class="hint" style="grid-column:1/-1">${cat === 'mine' && !query ? 'Своих фото пока нет — нажмите «🖼 Свои фото» (галерея телефона) или «📷 Снять фото».' : 'Ничего не найдено. Попробуйте другое слово или карту страны.'}</p>`));
        return;
      }
      arr.forEach(e => {
        const k = tileKey(e), on = isOn(k);
        const t = h(`<div class="pic-tile${on ? ' on' : ''}" role="button" tabindex="0" aria-pressed="${on}"><span class="ok">✓</span><div class="im"></div><span></span></div>`);
        $('.im', t).appendChild(imgEl(e.upload ? {upload: e.upload} : {picture: e.id}));
        $('span:last-child', t).textContent = e.name;
        if (e.upload) {
          const del = h('<button class="del" type="button" aria-label="Удалить картинку">🗑</button>');
          del.addEventListener('click', async ev => { ev.stopPropagation(); if (await deleteUpload(e.upload)) draw(); });
          t.appendChild(del);
        }
        t.addEventListener('click', async () => { await onToggle(k); draw(); });
        grid.appendChild(t);
      });
    }
    q.addEventListener('input', draw);
    $$('.add-pics input[type=file]', box).forEach(inp => inp.addEventListener('change', async e => {
      const files = Array.from(e.target.files || []); e.target.value = '';
      const done = await uploadFiles(files);
      if (done.length) { cat = 'mine'; q.value = ''; await onUploaded(done); }
      draw();
    }));
    draw();
    box.redraw = draw;
    return box;
  }

  /* фото с телефона: HEIC и большие снимки пережимаются в JPEG до 2560 точек — быстрее и меньше памяти */
  async function prepare(f) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    const raster = /^image\//.test(f.type) && ext !== 'svg' && ext !== 'gif';
    if (!raster || (IMG_EXT.includes(ext) && f.size < 2.5e6 && ext !== 'tif' && ext !== 'tiff')) return f;
    try {
      const bmp = await createImageBitmap(f);
      const k = Math.min(1, 2560 / Math.max(bmp.width, bmp.height));
      if (k === 1 && IMG_EXT.includes(ext) && (ext === 'png' || f.size < 6e6)) return f;     // прозрачность PNG сохраняем
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
      if (!blob) return f;
      return new File([blob], f.name.replace(/\.[^.]+$/, '') + '.jpg', {type: 'image/jpeg'});
    } catch (e) { return f; }
  }
  async function uploadFiles(files) {
    const done = [], errs = [];
    const arr = files.filter(f => /^image\//.test(f.type) || IMG_EXT.includes((f.name.split('.').pop() || '').toLowerCase()));
    if (files.length > arr.length) errs.push(`не картинки: ${files.length - arr.length}`);
    for (let i = 0; i < arr.length; i++) {
      Busy.on(arr.length > 1 ? `Загружаю картинки: ${i + 1} из ${arr.length}…` : 'Загружаю картинку…');
      try {
        const f = await prepare(arr[i]);
        const fd = new FormData(); fd.append('file', f, f.name);
        const r = await apiJSON('POST', '/api/upload_image', fd);
        if (r.image && r.image.upload) done.push({image: {upload: r.image.upload, caption: ''}, name: f.name});
      } catch (e) { errs.push(`${arr[i].name}: ${e.message.replace(/^Картинка не загружена: /, '')}`); }
    }
    Busy.off();
    try { LIB.mine = (await apiJSON('GET', '/api/uploads')).items || []; } catch (e) { /* обновится позже */ }
    if (errs.length) toast('Не загружено — ' + errs.slice(0, 3).join('; ') + (errs.length > 3 ? ` и ещё ${errs.length - 3}` : ''), true, 9000);
    else if (done.length > 1) toast(`Загружено картинок: ${done.length}`);
    return done;
  }
  const usesUpload = (a, name) => (a.images || []).some(im => im.upload === name);
  async function deleteUpload(name) {
    const e = (LIB.mine || []).find(x => x.upload === name);
    const used = state.spec ? state.spec.slides.filter(s => usesUpload(s, name)).length : 0;
    if (!await confirmSheet(`Удалить картинку «${myTitle(e)}» из телефона?` + (used ? ` Она стоит на слайдах (${used}) — с них тоже уберётся.` : ''), 'Удалить', true)) return false;
    try { await apiJSON('DELETE', '/api/upload/' + encodeURIComponent(name)); } catch (err) { toast(err.message, true); return false; }
    LIB.mine = (LIB.mine || []).filter(x => x.upload !== name);
    IMG.delete('/api/upload/' + encodeURIComponent(name));
    if (state.spec) {
      for (const s of state.spec.slides.slice()) {
        if (isPicAlt(s) && usesUpload(s, name)) {
          try { await setSlidePictures(s, curPics(s).filter(im => im.upload !== name), isFullPic(s)); } catch (err) { toast(err.message, true); }
        } else if (s.layout === 'image' && usesUpload(s, name)) s.images = s.images.filter(im => im.upload !== name);
      }
      planChanged({quiet: true});
    }
    toast('Картинка удалена' + (used ? `; убрана со слайдов: ${used}` : ''));
    return true;
  }

  /* ---------------------------------------------------------------- картинки к одному слайду */
  async function openSlide(s0, onDone) {
    if (!state.spec) return;
    let s = s0, busy = false;
    const ai = !!(state.status && state.status.llm && state.status.llm.model);
    const body = h(`<div>
      <div class="sec-h" style="margin-top:0">На слайде сейчас</div><div class="now-row"></div>
      <div class="seg small" role="radiogroup" style="margin-top:10px"><button type="button" data-v="side">Рядом с тезисами</button><button type="button" data-v="full">На весь слайд</button></div>
      ${ai ? '<button class="btn ghost small wide" type="button" data-a="ai" style="margin-top:10px">✨ Нарисовать моделью ИИ</button>' : ''}
      <div class="sec-h">Выбрать картинку · до ${PIC_MAX}</div><div class="chooser"><p class="hint">Загружаю библиотеку…</p></div></div>`);
    const sh = openSheet({title: 'Картинки к слайду', sub: s.title || '', full: true, back: true, body, onClose: () => onDone(s)});
    let full = isPicAlt(s) ? isFullPic(s) : false;
    const segBtns = $$('.seg button', body);
    const drawSeg = () => segBtns.forEach(b => b.classList.toggle('on', (b.dataset.v === 'full') === full));
    segBtns.forEach(b => b.addEventListener('click', async () => {
      const f = b.dataset.v === 'full';
      if (f === full) return;
      full = f; drawSeg();
      if (curPics(s).length) await set(curPics(s));
    }));
    drawSeg();
    function drawNow() {
      const row = $('.now-row', body), cur = curPics(s);
      row.innerHTML = '';
      if (!cur.length) { row.appendChild(h('<p class="hint" style="margin:0">Картинок нет — нажмите картинку ниже, и она встанет на слайд.</p>')); return; }
      cur.forEach((im, i) => {
        const c = h('<div class="now-chip"><span></span><button class="icon-btn" type="button" aria-label="Убрать со слайда">✕</button></div>');
        c.prepend(imgEl(im));
        $('span', c).textContent = picName(im);
        $('button', c).addEventListener('click', () => set(curPics(s).filter((_, k) => k !== i)));
        row.appendChild(c);
      });
    }
    async function set(next) {
      if (busy) return;
      busy = true;
      Busy.on(next.length ? 'Ставлю картинку на слайд…' : 'Убираю картинки…');
      try { s = await setSlidePictures(s, next, full); planChanged({quiet: true}); }
      catch (e) { toast(e.message, true, 8000); }
      finally { Busy.off(); busy = false; }
      drawNow();
      if (ch) ch.redraw();
    }
    let ch = null;
    drawNow();
    if (ai) $('[data-a=ai]', body).addEventListener('click', async () => {
      Busy.on('Модель ИИ рисует иллюстрацию…', {detail: 'Обычно до минуты; у облачных моделей — быстрее.', cancel: cancelEngine});
      try {
        const base = clone(picBase(s)); delete base.alts;
        const r = await apiJSON('POST', '/api/illustrate', {slide: base});
        s = addPictureAlt(s, r.alt); planChanged({quiet: true});
        drawNow(); toast('Иллюстрация добавлена вариантом слайда');
      } catch (e) { toast(e.message, true, 9000); } finally { Busy.off(); }
    });
    try {
      await ensureData();
      const sg = await apiJSON('POST', '/api/pictures/suggest', {slide: leanSlide(s)}).catch(() => ({items: []}));
      if (sh.closed) return;
      ch = chooser({starLabel: '★ Подходят', suggest: sg.items || [],
        isOn: k => curPics(s).some(im => picKey(im) === k),
        onToggle: async k => {
          const cur = curPics(s), at = cur.findIndex(im => picKey(im) === k);
          if (at >= 0) return set(cur.filter((_, i) => i !== at));
          if (cur.length >= PIC_MAX) { toast(`На слайде уже ${PIC_MAX} картинки — уберите одну вверху, чтобы поставить другую.`, true, 6000); return; }
          return set(cur.concat([keyToImage(k)]));
        },
        onUploaded: async done => {
          const cur = curPics(s);
          const add = done.map(d => d.image).filter(im => !cur.some(c => picKey(c) === picKey(im))).slice(0, Math.max(0, PIC_MAX - cur.length));
          if (add.length) await set(cur.concat(add));
        }});
      $('.chooser', body).replaceWith(ch);
    } catch (e) { $('.chooser', body).innerHTML = `<p class="warn-txt">${esc(e.message)}</p>`; }
  }

  /* ---------------------------------------------------------------- картинки ко всей презентации: отметить и разложить */
  async function openBulk() {
    if (!state.spec || !state.spec.slides.length) { toast('Сначала постройте или откройте план.', true); return; }
    const rows = [];          // {key, image, slide (номер или null), why}
    state.spec.slides.forEach((s, j) => curPics(s).forEach(im => { if (picKey(im)) rows.push({key: picKey(im), image: clone(im), slide: j, why: 'стоит сейчас'}); }));
    const start = rows.map(r => Object.assign({}, r));
    let full = false, modeTouched = false, step = 'pick';
    const body = h(`<div>
      <div class="seg" role="tablist"><button type="button" data-st="pick" class="on">1. Отметить</button><button type="button" data-st="place">2. Разложить</button></div>
      <div data-p="pick"><p class="hint">Отметьте картинки — потом на шаге 2 конструктор разложит их по подходящим слайдам.</p><div class="chooser"><p class="hint">Загружаю библиотеку…</p></div></div>
      <div data-p="place" class="hidden">
        <div class="row2" style="margin-top:12px"><button class="btn ghost small" type="button" data-a="auto">✨ По смыслу</button><button class="btn ghost small" type="button" data-a="order">По порядку</button></div>
        <div class="seg small" style="margin-top:10px"><button type="button" data-v="side" class="on">Рядом с тезисами</button><button type="button" data-v="full">На весь слайд</button></div>
        <p class="hint" data-sum></p><div data-list></div>
        <button class="link-btn" type="button" data-a="reset">Вернуть, как было</button></div></div>`);
    const apply = h('<button class="btn primary" type="button">Поставить на слайды</button>');
    const sh = openSheet({title: 'Картинки к слайдам', full: true, back: true, body, foot: apply});
    const ticked = () => new Set(rows.map(r => r.key)).size;
    function setStep(v) {
      step = v;
      $$('[data-st]', body).forEach(b => b.classList.toggle('on', b.dataset.st === v));
      $$('[data-p]', body).forEach(p => p.classList.toggle('hidden', p.dataset.p !== v));
      $('[data-st=pick]', body).textContent = `1. Отметить${ticked() ? ' · ' + ticked() : ''}`;
      if (v === 'place') drawList();
      updApply();
    }
    $$('[data-st]', body).forEach(b => b.addEventListener('click', () => setStep(b.dataset.st)));
    $$('[data-v]', body).forEach(b => b.addEventListener('click', () => {
      full = b.dataset.v === 'full'; modeTouched = true;
      $$('[data-v]', body).forEach(x => x.classList.toggle('on', x === b)); drawList();
    }));
    const picSlides = () => state.spec.slides.map((s, j) => ({s, j})).filter(({s}) => !NO_PIC.includes(picBase(s).layout));
    function plan() {
      const want = new Map();
      rows.forEach(r => { if (r.slide !== null) { if (!want.has(r.slide)) want.set(r.slide, []); want.get(r.slide).push(r.image); } });
      const touched = new Set([...want.keys(), ...start.map(r => r.slide)]);
      const out = [];
      [...touched].sort((a, b) => a - b).forEach(j => {
        const s = state.spec.slides[j];
        if (!s) return;
        const cur = curPics(s), lib = cur.filter(im => picKey(im)), other = cur.filter(im => !picKey(im));
        const after = want.get(j) || [];
        const fin = other.concat(after);
        const same = lib.map(picKey).join('|') === after.map(picKey).join('|');
        if (same && (!fin.length || !modeTouched || isFullPic(s) === full)) return;
        out.push({j, images: fin});
      });
      return out;
    }
    function over() {
      const count = {};
      rows.forEach(r => { if (r.slide !== null) count[r.slide] = (count[r.slide] || 0) + 1; });
      state.spec.slides.forEach((s, j) => { const o = curPics(s).filter(im => !picKey(im)).length; if (o && count[j]) count[j] += o; });
      return {count, over: Object.keys(count).filter(j => count[j] > PIC_MAX).map(Number)};
    }
    function updApply() {
      const p = plan(), o = over().over;
      apply.disabled = !p.length || o.length > 0;
      apply.textContent = p.length ? `Поставить на слайды (${p.length})` : 'Поставить на слайды';
      $('[data-st=pick]', body).textContent = `1. Отметить${ticked() ? ' · ' + ticked() : ''}`;
    }
    function drawList() {
      const box = $('[data-list]', body), {count, over: ov} = over();
      const slides = picSlides();
      box.innerHTML = '';
      if (!rows.length) box.appendChild(h('<p class="hint">Сначала отметьте картинки на шаге 1.</p>'));
      rows.forEach((r, i) => {
        const el = h(`<div class="item${r.slide !== null && ov.includes(r.slide) ? ' bad' : ''}"><div class="item-head"><span class="now-chip" style="border:0;background:none;padding:0"><span></span></span><span class="sp"></span>
          <button class="icon-btn" type="button" aria-label="Убрать">✕</button></div><select aria-label="Слайд для картинки"></select><small class="hint"></small></div>`);
        $('.now-chip', el).prepend(imgEl(r.image));
        $('.now-chip span', el).textContent = picName(r.image);
        $('small', el).textContent = r.why || '';
        const sel = $('select', el);
        sel.innerHTML = '<option value="">— не ставить —</option>' + slides.map(({s, j}) =>
          `<option value="${j}"${r.slide === j ? ' selected' : ''}>${j + 1}. ${esc(slideTitle(s).slice(0, 44))}${count[j] ? ` · 🖼 ${count[j]}` : ''}</option>`).join('');
        sel.addEventListener('change', () => { r.slide = sel.value === '' ? null : +sel.value; r.why = r.slide === null ? '' : 'вручную'; drawList(); });
        $('.icon-btn', el).addEventListener('click', () => { rows.splice(i, 1); drawList(); if (ch) ch.redraw(); });
        box.appendChild(el);
      });
      const p = plan(), placed = rows.filter(r => r.slide !== null).length;
      $('[data-sum]', body).innerHTML = ov.length
        ? `<span class="warn-txt">На слайде ${ov.map(j => j + 1).join(', ')} больше ${PIC_MAX} картинок — выберите для лишних другой слайд.</span>`
        : (rows.length ? `Картинок: <b>${rows.length}</b> · на слайдах: <b>${placed}</b>` + (p.length ? ` · изменится слайдов: <b>${p.length}</b>` : ' · изменений нет') : '');
      updApply();
    }
    async function distribute(mode) {
      if (!rows.length) { toast('Сначала отметьте картинки на шаге 1.', true); return; }
      let todo = rows.filter(r => r.slide === null);
      const all = !todo.length;
      if (all) todo = rows.slice();
      const load = {}, busyIdx = [];
      if (!all) rows.forEach(r => { if (r.slide !== null) load[r.slide] = (load[r.slide] || 0) + 1; });
      state.spec.slides.forEach((s, j) => { if (s.layout === 'image' && (s.images || []).length && !curPics(s).some(im => picKey(im))) busyIdx.push(j); });
      Busy.on(mode === 'order' ? 'Раскладываю по порядку…' : 'Подбираю слайды по смыслу…');
      try {
        const r = await apiJSON('POST', '/api/pictures/distribute', {slides: state.spec.slides.map(leanSlide), images: todo.map(x => keyToImage(x.key)), busy: busyIdx, load, mode});
        (r.places || []).forEach((p, t) => { if (todo[t]) { todo[t].slide = (p.slide === null || p.slide === undefined) ? null : p.slide; todo[t].why = p.why || ''; } });
        rows.sort((a, b) => (a.slide === null ? 1e9 : a.slide) - (b.slide === null ? 1e9 : b.slide));
        toast((all ? 'Разложил заново: ' : 'Разложил: ') + `${todo.filter(x => x.slide !== null).length} из ${todo.length}`);
      } catch (e) { toast(e.message, true); } finally { Busy.off(); }
      drawList();
    }
    $('[data-a=auto]', body).addEventListener('click', () => distribute('auto'));
    $('[data-a=order]', body).addEventListener('click', () => distribute('order'));
    $('[data-a=reset]', body).addEventListener('click', () => { rows.splice(0, rows.length, ...start.map(r => Object.assign({}, r))); drawList(); if (ch) ch.redraw(); toast('Вернул, как было'); });
    apply.addEventListener('click', async () => {
      const p = plan();
      if (!p.length) return;
      let put = 0, dropped = 0; const errs = [];
      for (let t = 0; t < p.length; t++) {
        Busy.on(`Ставлю картинки: слайд ${t + 1} из ${p.length}…`);
        try { await setSlidePictures(state.spec.slides[p[t].j], p[t].images, full); if (p[t].images.length) put++; else dropped++; }
        catch (e) { errs.push(`слайд ${p[t].j + 1}: ${e.message}`); }
      }
      Busy.off();
      planChanged();
      if (errs.length) { toast('Не получилось — ' + errs.slice(0, 2).join('; '), true, 9000); drawList(); return; }
      sh.close();
      toast(`Готово: картинки на слайдах — ${put}` + (dropped ? `, убраны — ${dropped}` : '') + '. Прежний вид слайда остаётся в «Вариантах».', false, 7000);
    });
    let ch = null;
    updApply();
    try {
      await ensureData();
      const sg = await apiJSON('POST', '/api/pictures/suggest', {slides: state.spec.slides.map(leanSlide)}).catch(() => ({items: []}));
      if (sh.closed) return;
      ch = chooser({starLabel: '★ К презентации', suggest: sg.items || [],
        isOn: k => rows.some(r => r.key === k),
        onToggle: k => {
          const i = rows.findIndex(r => r.key === k);
          if (i >= 0) rows.splice(i, 1); else rows.push({key: k, image: keyToImage(k), slide: null, why: ''});
          updApply();
        },
        onUploaded: done => {
          const have = new Set(rows.map(r => r.key));
          done.forEach(d => { const k = picKey(d.image); if (!have.has(k)) { have.add(k); rows.push({key: k, image: d.image, slide: null, why: 'загружена'}); } });
          updApply();
        }});
      $('.chooser', body).replaceWith(ch);
    } catch (e) { $('.chooser', body).innerHTML = `<p class="warn-txt">${esc(e.message)}</p>`; }
  }

  /* ---------------------------------------------------------------- библиотека (из «Ещё»): свои фото и картинки конструктора */
  async function openLibrary() {
    const body = h(`<div><p class="hint" style="margin-top:0">Свои фото из галереи или с камеры хранятся на этом телефоне.
      Они находятся поиском и ставятся на слайды так же, как картинки конструктора. Нажмите картинку, чтобы поставить её на слайд.</p>
      <div class="chooser"><p class="hint">Загружаю библиотеку…</p></div></div>`);
    const sh = openSheet({title: 'Библиотека картинок', full: true, back: true, body});
    try {
      await ensureData();
      if (sh.closed) return;
      const ch = chooser({starLabel: '', suggest: [], start: 'mine', isOn: () => false,
        onToggle: k => openPicture(k, () => ch.redraw()), onUploaded: async () => {}});
      $('.chooser', body).replaceWith(ch);
    } catch (e) { $('.chooser', body).innerHTML = `<p class="warn-txt">${esc(e.message)}</p>`; }
  }
  /* одна картинка: крупно, на какой слайд поставить; свою — удалить */
  function openPicture(k, onChange) {
    const im = keyToImage(k), mine = !!im.upload;
    const body = h('<div><div class="pic-big"></div><p class="pic-big-name"></p></div>');
    $('.pic-big', body).appendChild(imgEl(im));
    $('.pic-big-name', body).textContent = picName(im);
    const slides = state.spec ? state.spec.slides.map((s, j) => ({s, j})).filter(({s}) => !NO_PIC.includes(picBase(s).layout)) : [];
    const foot = [];
    let sel = null, put = null, sh = null;
    if (slides.length) {
      const f = h('<label class="fld"><span>Поставить на слайд</span><select></select></label>');
      sel = $('select', f);
      sel.innerHTML = '<option value="">— выберите слайд —</option>' + slides.map(({s, j}) => {
        const n = curPics(s).length;
        return `<option value="${j}">${j + 1}. ${esc(slideTitle(s).slice(0, 44))}${n ? ` · 🖼 ${n}` : ''}</option>`;
      }).join('');
      body.appendChild(f);
      put = h('<button class="btn primary" type="button" disabled>Поставить</button>');
      sel.addEventListener('change', () => { put.disabled = sel.value === ''; });
      put.addEventListener('click', async () => {
        const j = +sel.value, s = state.spec.slides[j], cur = curPics(s);
        if (cur.some(c => picKey(c) === k)) { toast(`Эта картинка уже стоит на слайде ${j + 1}.`); return; }
        if (cur.length >= PIC_MAX) { toast(`На слайде ${j + 1} уже ${PIC_MAX} картинки — выберите другой слайд или уберите одну в редакторе слайда.`, true, 7000); return; }
        Busy.on('Ставлю картинку на слайд…');
        try {
          await setSlidePictures(s, cur.concat([im]), isPicAlt(s) && isFullPic(s));
          planChanged();
          sh.close();
          toast(`Картинка на слайде ${j + 1}. Прежний вид слайда остаётся в «Вариантах».`, false, 6000);
        } catch (e) { toast(e.message, true, 8000); } finally { Busy.off(); }
      });
    } else body.appendChild(h('<p class="hint">Чтобы поставить картинку на слайд, сначала постройте или откройте план.</p>'));
    if (mine) {
      const del = h('<button class="btn danger" type="button">Удалить</button>');
      del.addEventListener('click', async () => { if (await deleteUpload(im.upload)) { sh.close(); onChange(); } });
      foot.push(del);
    }
    if (put) foot.push(put);
    sh = openSheet({title: mine ? 'Своё фото' : 'Картинка', back: true, body, foot: foot.length ? foot : undefined});
  }

  return {openSlide, openBulk, openLibrary, isPicAlt, curPics};
})();
