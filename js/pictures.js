/* pictures.js — картинки к слайду, картинки ко всей презентации, фото библиотеки, свои фото, рисунок модели ИИ. */
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

  // фото библиотеки лежат на сайте и скачиваются в телефон, когда их выбирают; без сети нового не взять
  async function photosLocal(s, images) {
    const had = new Set(curPics(s).map(im => im.picture));
    for (const im of images) {
      if (!im.picture || !isPhotoId(im.picture) || had.has(im.picture)) continue;
      let ok = false;
      try { ok = (await Engine.get('/api/photo/' + encodeURIComponent(im.picture))).ok; } catch (e) { ok = false; }
      if (!ok) throw new Error('Это фото ещё не скачано в телефон, а сети сейчас нет. Подключитесь к интернету и поставьте его снова — дальше оно будет работать и без сети.');
    }
  }
  async function setSlidePictures(s, images, full) {
    if (!images.length) return dropPictures(s);
    await photosLocal(s, images);
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

  /* ---------------------------------------------------------------- библиотека, фото и свои картинки
     Фото (1.7) — в каталоге движка: {id: 'ph_…', photo: true, credit}; на слайде — {picture: 'ph_…'}, автор фото
     попадает в заметки слайда при сборке (движок). Миниатюры /api/photo/<id>?w=360 отдаёт сам сайт (worker.js),
     снимок скачивается при первом использовании и дальше хранится в телефоне. Свои фото, добавленные в библиотеку, —
     тоже фото каталога (mine: true, upload). */
  async function ensureData() {
    if (!LIB.data) {
      LIB.data = await apiJSON('GET', '/api/pictures');
      LIB.byId = new Map(LIB.data.items.map(e => [e.id, e]));
    }
    if (!LIB.mine) LIB.mine = (await apiJSON('GET', '/api/uploads')).items || [];
    return LIB.data;
  }
  async function refreshData() {           // после загрузки, правки или удаления своих картинок
    const [d, m] = await Promise.all([apiJSON('GET', '/api/pictures'), apiJSON('GET', '/api/uploads')]);
    LIB.data = d; LIB.byId = new Map(d.items.map(e => [e.id, e])); LIB.mine = m.items || [];
  }
  const isPhotoId = id => /^ph_/.test(id || '');
  const photoUrl = (id, w) => `/api/photo/${encodeURIComponent(id)}${w ? '?w=' + w : ''}`;
  // свои фото с именем встроенного (так телефон 1.6.2 ставил фото библиотеки) — под названием фото
  const legacyPhoto = u => { const id = u && u.name ? u.name.replace(/\.[^.]+$/, '') : ''; return isPhotoId(id) ? LIB.byId.get(id) : null; };
  const myTitle = u => {
    const p = legacyPhoto(u);
    return p ? p.name : ((u && (u.title || (u.name ? u.name.replace(/\.[^.]+$/, '') : ''))) || 'Своя картинка');
  };
  const libPhotoOf = name => LIB.data && LIB.data.items.find(e => e.mine && e.upload === name);
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
    if (im.picture && isPhotoId(im.picture)) { lazyImg(img, photoUrl(im.picture, 360)); img.className = 'ph'; }
    else if (im.svg) { try { img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(im.svg))); } catch (e) { /* пусто */ } }
    else if (im.picture) lazyImg(img, `/api/pictures/${encodeURIComponent(im.picture)}.svg`);
    else if (im.path) { lazyImg(img, docImageUrl(im.path, 360)); img.className = 'ph'; }
    else if (im.upload) {
      const u = (LIB.mine || []).find(x => x.upload === im.upload), lp = legacyPhoto(u);
      if (lp) lazyImg(img, photoUrl(lp.id, 360));
      else lazyImg(img, `/api/upload/${encodeURIComponent(im.upload)}${/\.svg$/i.test(im.upload) ? '' : '?w=360'}`);
      if (lp || !/\.svg$/i.test(im.upload)) img.className = 'ph';
    }
    return img;
  }
  // список для вкладки: ★ подходящие, фото, свои, раздел библиотеки; при поиске — свои, фото, рисунки, карты
  function list(cat, q, suggest) {
    const mine = (LIB.mine || []).map(u => ({upload: u.upload, name: myTitle(u), cat: 'своя'}));
    const items = LIB.data.items.filter(e => !e.mine);             // свои фото из библиотеки — во «Мои»
    if (q) {
      const words = q.toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean);
      const hit = t => { t = t.toLowerCase().replace(/ё/g, 'е'); return words.every(w => t.includes(w)); };
      const found = items.filter(e => hit(e.name + ' ' + e.cat));
      if (cat === 'photos') found.sort((a, b) => !!b.photo - !!a.photo);   // на вкладке «Фото» — сначала фото
      return mine.filter(e => hit(e.name)).concat(found)
        .concat(LIB.data.countries.filter(c => hit(c.name)).map(c => ({id: c.id, name: 'Карта: ' + c.name, cat: 'Карты стран'})));
    }
    if (cat === 'photos') return items.filter(e => e.photo);
    if (cat === 'mine') return mine;
    if (cat === 'maps') return LIB.data.countries.map(c => ({id: c.id, name: c.name, cat: 'Карты стран'}));
    if (cat === '★') return suggest;
    if (!cat) return items.filter(e => !e.photo);
    return items.filter(e => e.cat === cat);
  }
  const tileKey = e => e.upload ? 'u:' + e.upload : 'p:' + e.id;
  const docImageUrl = (path, w) => `/api/docimage/${encodeURIComponent(String(path).split(/[\\/]/).pop())}${w ? '?w=' + w : ''}`;
  // адрес миниатюры растровой картинки слайда (для эффектов)
  function rasterUrl(im) {
    if (im.picture && isPhotoId(im.picture)) return photoUrl(im.picture, 360);
    if (im.path) return docImageUrl(im.path, 360);
    if (im.upload) {
      const lp = legacyPhoto((LIB.mine || []).find(x => x.upload === im.upload));
      return lp ? photoUrl(lp.id, 360) : `/api/upload/${encodeURIComponent(im.upload)}?w=360`;
    }
    return '';
  }

  /* ---------------------------------------------------------------- эффекты фото (1.7), как в Windows-версии
     Эффект и цвет хранятся в самой картинке слайда (images[i].effect, tone). Не выбран — движок подберёт
     его по снимку при сборке. «✨ Предложить» — модель, которая видит изображения, или правила по снимку. */
  const FX = {effects: null, tones: null};
  async function loadFx() {
    if (FX.effects) return;
    const r = await apiJSON('GET', '/api/photofx');
    FX.effects = r.effects || []; FX.tones = r.tones || [];
  }
  const isRaster = im => !!im && !im.svg && (im.upload ? !/\.svg$/i.test(im.upload) : (im.picture ? isPhotoId(im.picture) : !!im.path));
  function fxDir(s, i) {                  // куда «светлеет» снимок — как ставит макет: к тезисам или книзу
    const n = (s.images || []).length, items = (s.items || []).some(it => it && (it.text || it.title));
    if (s.illustration && items && i === 0) return 'left';
    if (items) return n === 1 ? 'right' : 'bottom';
    return 'bottom';
  }
  const fxName = id => ((FX.effects || []).find(e => e.id === id) || {}).name || '';
  const toneName = id => ((FX.tones || []).find(t => t.id === (id || '')) || {}).name || '';
  function fxWho(im) {
    if (!im.effect) return '';
    if (im.effect_by === 'model') return '✨ предложила модель' + (im.effect_why ? ': ' + im.effect_why : '');
    if (im.effect_by === 'rules') return 'подобрано по снимку' + (im.effect_why ? ': ' + im.effect_why : '');
    return 'выбрано вами';
  }
  async function fxSuggest(s, i) {
    const im = (s.images || [])[i];
    if (!im) return null;
    const slide = {title: s.title || '', items: s.items || [], illustration: !!s.illustration,
      images: (s.images || []).map(x => { const c = Object.assign({}, x); delete c.svg; return c; })};
    const r = await apiJSON('POST', '/api/photofx/suggest', {slide, index: i});
    if (!r.effect) return null;
    im.effect = r.effect;
    if (r.tone) im.tone = r.tone; else delete im.tone;
    im.effect_by = r.by === 'model' ? 'model' : 'rules';
    im.effect_why = r.why || '';
    // несколько снимков на слайде — одной серией: тот же эффект соседям (кроме выбранных вами)
    (s.images || []).forEach(o => {
      if (o === im || !isRaster(o) || (o.effect && o.effect_by === 'user')) return;
      o.effect = im.effect;
      if (im.tone) o.tone = im.tone; else delete o.tone;
      o.effect_by = im.effect_by;
      o.effect_why = 'как у соседнего снимка — серия выглядит одинаково';
    });
    if (r.note) toast(r.note, true, 8000);
    return r;
  }
  /* блок «Эффект» одной картинки слайда; getSlide — текущий слайд (после замены картинок он другой) */
  function fxEl(getSlide, i, onChange) {
    const box = h('<div class="fx-box"></div>');
    const draw = async () => {
      const s = getSlide(), im = (s.images || [])[i];
      if (!im || !isRaster(im)) { box.remove(); return; }
      if (!FX.effects) {
        box.innerHTML = '<span class="hint">Загружаю эффекты…</span>';
        try { await loadFx(); } catch (e) { box.innerHTML = ''; return; }
      }
      const many = (s.images || []).filter(isRaster).length > 1, dir = fxDir(s, i), tone = im.tone || '';
      const cur = im.effect ? fxName(im.effect) + (tone ? ' · ' + toneName(tone).toLowerCase() : '') : 'подберётся при сборке';
      box.innerHTML = `<div class="fx-head"><b>Эффект${many ? ' фото ' + (i + 1) : ''}:</b> <span class="fx-cur"></span></div>
        <p class="hint fx-why"></p>
        <div class="fx-gal">${FX.effects.map(e => `<button type="button" class="fx-opt${e.id === im.effect ? ' on' : ''}" data-e="${esc(e.id)}" aria-pressed="${e.id === im.effect}">
          <span class="fxv fx-${esc(e.id)} tone-${esc(tone || 'none')}" data-dir="${dir}"><img alt=""></span><small>${esc(e.name)}</small></button>`).join('')}</div>
        <div class="fx-tones"><span class="hint">Цвет:</span>${FX.tones.map(t => `<button type="button" class="chip${t.id === tone ? ' on' : ''}" data-t="${esc(t.id)}">${esc(t.name)}</button>`).join('')}</div>
        <button type="button" class="btn ghost small wide fx-ask">✨ Предложить эффект</button>`;
      $('.fx-cur', box).textContent = cur;
      $('.fx-why', box).textContent = fxWho(im);
      const url = rasterUrl(im);
      if (url) engineImage(url).then(u => { if (u) $$('.fxv img', box).forEach(x => { x.src = u; }); });
      $$('.fx-opt', box).forEach(b => b.addEventListener('click', () => {
        im.effect = b.dataset.e; im.effect_by = 'user'; delete im.effect_why; onChange(); draw();
      }));
      $$('.fx-tones .chip', box).forEach(b => b.addEventListener('click', () => {
        if (b.dataset.t) im.tone = b.dataset.t; else delete im.tone;
        if (!im.effect) im.effect = 'frame';
        im.effect_by = 'user'; delete im.effect_why; onChange(); draw();
      }));
      $('.fx-ask', box).addEventListener('click', async ev => {
        ev.currentTarget.disabled = true;
        $('.fx-why', box).textContent = 'Смотрю на снимок…';
        try { if (await fxSuggest(getSlide(), i)) onChange(); } catch (e) { toast(e.message, true, 8000); }
        draw();
      });
    };
    draw();
    return box;
  }
  const nPhotos = () => LIB.data.items.filter(e => e.photo && !e.mine).length;

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
      const nMine = (LIB.mine || []).length, nPh = nPhotos();
      const cats = (suggest.length ? ['★'] : []).concat(nPh ? ['photos'] : []).concat(['mine', '', 'maps'])
        .concat(LIB.data.categories.filter(c => c !== 'Карты стран' && c !== LIB.data.my_cat));
      const label = c => c === '★' ? starLabel : (c === 'photos' ? `📷 Фото · ${nPh}` : (c === 'mine' ? `Мои${nMine ? ' · ' + nMine : ''}` : (c === 'maps' ? '🗺 Карты стран' : (c || 'Рисунки'))));
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
    try { await refreshData(); } catch (e) { /* обновится позже */ }
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
    try { await refreshData(); } catch (err) { /* обновится позже */ }
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
      <div class="sec-h" style="margin-top:0">На слайде сейчас</div><div class="now-row"></div><div class="fx-list"></div>
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
      const row = $('.now-row', body), cur = curPics(s), fl = $('.fx-list', body);
      row.innerHTML = ''; fl.innerHTML = '';
      if (s.layout === 'image') (s.images || []).forEach((im, i) => {
        if (isRaster(im)) fl.appendChild(fxEl(() => s, i, () => planChanged({quiet: true})));
      });
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

  /* ---------------------------------------------------------------- библиотека (из «Ещё»): фото, свои фото и картинки конструктора */
  async function openLibrary() {
    const body = h(`<div><p class="hint" style="margin-top:0">Нажмите картинку, чтобы посмотреть её крупно и поставить на слайд.
      Свои фото из галереи или с камеры хранятся на этом телефоне.</p>
      <div class="chooser"><p class="hint">Загружаю библиотеку…</p></div></div>`);
    const sh = openSheet({title: 'Библиотека картинок', full: true, back: true, body});
    try {
      await ensureData();
      if (sh.closed) return;
      const ch = chooser({starLabel: '', suggest: [], start: nPhotos() ? 'photos' : 'mine', isOn: () => false,
        onToggle: k => openPicture(k, () => ch.redraw()), onUploaded: async () => {}});
      $('.chooser', body).replaceWith(ch);
    } catch (e) { $('.chooser', body).innerHTML = `<p class="warn-txt">${esc(e.message)}</p>`; }
  }
  /* одна картинка: крупно, автор фото, на какой слайд поставить; своё фото — название, библиотека, удалить */
  function openPicture(k, onChange) {
    const im = keyToImage(k), mine = !!im.upload;
    const u = mine ? (LIB.mine || []).find(x => x.upload === im.upload) : null;
    const photo = !mine && isPhotoId(im.picture) ? LIB.byId.get(im.picture) : (mine ? legacyPhoto(u) : null);
    const body = h('<div><div class="pic-big"></div><p class="pic-big-name"></p></div>');
    const big = h('<img alt="">');
    $('.pic-big', body).appendChild(big);
    if (photo) {
      engineImage(photoUrl(photo.id, 360)).then(x => { if (x && !big.src) big.src = x; });
      engineImage(photoUrl(photo.id)).then(x => { if (x) big.src = x; });       // крупное — когда скачается
    } else if (mine && !/\.svg$/i.test(im.upload)) engineImage(`/api/upload/${encodeURIComponent(im.upload)}?w=800`).then(x => { if (x) big.src = x; });
    else $('.pic-big', body).replaceChildren(imgEl(im));
    $('.pic-big-name', body).textContent = photo ? photo.name : picName(im);
    if (photo && photo.credit) {
      const cr = h('<p class="pic-credit"><span></span><br>Подпись автора сама добавится в заметки слайда.</p>');
      $('span', cr).textContent = photo.credit;
      body.appendChild(cr);
    }
    // своё фото в библиотеке (1.7): название, раздел и автор — как «✎» в Windows-версии
    let saveLib = null, gone = false;
    if (mine && u && !legacyPhoto(u) && !/\.svg$/i.test(im.upload)) {
      const cats = [LIB.data.my_cat || 'Мои фото'].concat((LIB.data.photo_cats || []).filter(c => c !== LIB.data.my_cat));
      const f = h(`<div class="lib-box">
        <label class="fld"><span>Название — что на снимке</span><input type="text" maxlength="90" placeholder="Например: Буровая на Харьяге"></label>
        <label class="sw"><input type="checkbox"><span>В библиотеке фото: подбирается к слайдам по названию</span></label>
        <div class="lib-more">
          <label class="fld"><span>Раздел</span><select>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
          <label class="fld"><span>Автор снимка (попадёт в заметки слайда)</span><input type="text" maxlength="120" placeholder="Например: И. Петров"></label>
        </div></div>`);
      const [title, author] = $$('input[type=text]', f), lib = $('input[type=checkbox]', f), cat = $('select', f), more = $('.lib-more', f);
      title.value = u.title || myTitle(u);
      lib.checked = !!u.lib;
      cat.value = cats.includes(u.cat) ? u.cat : cats[0];
      author.value = u.author || '';
      const drawMore = () => more.classList.toggle('hidden', !lib.checked);
      lib.addEventListener('change', drawMore); drawMore();
      title.addEventListener('input', () => { $('.pic-big-name', body).textContent = title.value.trim() || myTitle(u); });
      // название по содержанию снимка — модель для названий картинок («Модель ИИ» → «Модели поиска и названий»)
      if (state.status && state.status.llm && state.status.llm.vision_model) {
        const nm = h('<button class="btn ghost small wide" type="button">🏷 Назвать по содержанию</button>');
        nm.addEventListener('click', async () => {
          Busy.on('Модель смотрит на снимок…', {detail: 'Первый запрос загружает модель в память — до пары минут.', cancel: cancelEngine});
          try {
            const r = await apiJSON('POST', '/api/upload/' + encodeURIComponent(im.upload) + '/autoname', {});
            title.value = r.title || title.value;
            title.dispatchEvent(new Event('input'));
            toast(`Название: «${r.title}»${(r.tags || []).length ? ' · слова для поиска: ' + r.tags.slice(0, 6).join(', ') : ''}`, false, 6000);
          } catch (e) { toast(e.message, true, 8000); } finally { Busy.off(); }
        });
        title.closest('.fld').after(nm);
      }
      body.appendChild(f);
      saveLib = async () => {
        const want = {title: title.value.trim(), lib: lib.checked, cat: cat.value, author: author.value.trim()};
        if (want.title === (u.title || myTitle(u)) && want.lib === !!u.lib && (!want.lib || (want.cat === u.cat && want.author === (u.author || '')))) return true;
        try {
          await apiJSON('PATCH', '/api/upload/' + encodeURIComponent(im.upload), want.lib ? want : {title: want.title, lib: false});
          Object.assign(u, want);
          await refreshData();
          toast(want.lib ? 'Фото в библиотеке: оно подбирается к слайдам' : 'Сохранено');
          return true;
        } catch (e) { toast(e.message, true, 8000); return false; }
      };
    }
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
        if (saveLib && !await saveLib()) return;
        Busy.on('Ставлю картинку на слайд…');
        try {
          await setSlidePictures(s, cur.concat([im]), isPicAlt(s) && isFullPic(s));
          planChanged();
          sh.close();
          onChange();
          toast(`Картинка на слайде ${j + 1}. Прежний вид слайда остаётся в «Вариантах».`, false, 6000);
        } catch (e) { toast(e.message, true, 8000); } finally { Busy.off(); }
      });
    } else body.appendChild(h('<p class="hint">Чтобы поставить картинку на слайд, сначала постройте или откройте план.</p>'));
    if (mine) {
      const del = h('<button class="btn danger" type="button">Удалить</button>');
      del.addEventListener('click', async () => { if (await deleteUpload(im.upload)) { gone = true; sh.close(); onChange(); } });
      foot.push(del);
    }
    if (saveLib && !put) {
      const sv = h('<button class="btn primary" type="button">Сохранить</button>');
      sv.addEventListener('click', async () => { if (await saveLib()) { sh.close(); onChange(); } });
      foot.push(sv);
    }
    if (put) foot.push(put);
    sh = openSheet({title: photo ? 'Фото' : (mine ? 'Своё фото' : 'Картинка'), back: true, body, foot: foot.length ? foot : undefined,
      onClose: () => { if (saveLib && put && !gone) saveLib().then(onChange); }});
  }

  return {openSlide, openBulk, openLibrary, isPicAlt, curPics};
})();
