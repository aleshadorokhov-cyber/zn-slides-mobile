/* slides-view.js — слайды рисует сам браузер: движок собирает облегчённую презентацию (/api/m/preview_deck),
   её разбирает и показывает @aiden0z/pptx-renderer (Apache-2.0) — с корпоративным шрифтом из файла,
   таблицами и диаграммами. Без библиотеки (старый браузер) остаются схемы макетов. */
'use strict';
const SlidesView = (() => {
  let lib = null, loading = null, failed = false;
  const live = new Set();                       // показанные слайды: {box, handle, deck}
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(es => es.forEach(e => fit(e.target._sv))) : null;

  function load() {
    if (loading) return loading;
    // диаграммы рисуются с плотностью не выше 1,5: слайд всё равно уменьшен, а память телефона ограничена
    let restore = null;
    try {
      const own = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
      const real = window.devicePixelRatio || 1;
      if (real > 1.5) {
        Object.defineProperty(window, 'devicePixelRatio', {get: () => 1.5, configurable: true});
        restore = () => { try { if (own) Object.defineProperty(window, 'devicePixelRatio', own); else delete window.devicePixelRatio; } catch (e) { /* как есть */ } };
      }
    } catch (e) { /* нельзя — как есть */ }
    loading = import(new URL('vendor/pptx-renderer.min.js', document.baseURI).href)
      .then(m => { lib = m; })
      .catch(e => { failed = true; console.warn('pptx-renderer', e); })
      .finally(() => { if (restore) restore(); });
    return loading;
  }
  const available = () => !failed && !!ro && typeof WebAssembly === 'object';

  /* .pptx → {count, view(i)}; view(i).mount(el) показывает слайд i внутри el */
  async function deck(bytes) {
    await load();
    if (!lib) throw new Error('Просмотр слайдов недоступен в этом браузере.');
    const pres = lib.buildPresentation(await lib.parseZip(bytes, lib.RECOMMENDED_ZIP_LIMITS));
    const d = {pres, cache: new Map(), live: 0};
    return {count: pres.slides.length, width: pres.width, height: pres.height,
      view: i => (pres.slides[i] ? {mount: el => mount(d, i, el), deck: d} : null)};
  }

  function mount(d, i, el) {
    sweep();
    const handle = lib.renderSlide(d.pres, d.pres.slides[i], {pdfjs: false, mediaUrlCache: d.cache});
    const box = document.createElement('div');
    box.className = 'sv';
    box.style.aspectRatio = `${d.pres.width} / ${d.pres.height}`;
    handle.element.style.transformOrigin = '0 0';
    handle.element.style.position = 'absolute';
    handle.element.style.left = handle.element.style.top = '0';
    box.appendChild(handle.element);
    const old = el.querySelector(':scope > img, :scope > svg.thumb, :scope > .sv');
    if (old) { if (old._sv) drop(old._sv); old.replaceWith(box); } else el.prepend(box);
    el.querySelector('.thumb-load')?.remove();
    const rec = {box, handle, deck: d};
    box._sv = rec;
    live.add(rec); d.live++;
    ro.observe(box);
    requestAnimationFrame(() => fit(rec));
    return handle.ready;
  }
  function fit(rec) {
    if (!rec) return;
    const w = rec.box.clientWidth;
    if (w) rec.handle.element.style.transform = `scale(${w / rec.deck.pres.width})`;
  }
  function drop(rec) {
    if (!live.delete(rec)) return;
    try { rec.handle.dispose(); } catch (e) { /* уже */ }
    ro.unobserve(rec.box);
    if (--rec.deck.live <= 0) {                 // слайды этой презентации больше не показаны — картинки освобождаются
      for (const u of rec.deck.cache.values()) URL.revokeObjectURL(u);
      rec.deck.cache.clear();
    }
  }
  function sweep() { for (const r of live) if (!r.box.isConnected) drop(r); }
  setInterval(sweep, 10000);

  /* слайды плана → показываемые слайды. numbers — номера слайдов в плане (для нумерации страниц) */
  async function images(slides, meta, opts = {}) {
    const numbers = opts.numbers || slides.map((_, i) => i + 1);
    const out = new Array(slides.length).fill(null);
    // подряд идущие номера — одной презентацией
    let a = 0;
    while (a < slides.length) {
      let b = a + 1;
      while (b < slides.length && numbers[b] === numbers[b - 1] + 1) b++;
      const r = await Engine.post('/api/m/preview_deck', {slides: slides.slice(a, b), meta, number: numbers[a]});
      if (!r.ok) throw new Error(r.json().error || 'Слайды не подготовлены');
      let starts = [];
      try { starts = JSON.parse(r.headers['x-starts'] || '[]'); } catch (e) { /* по порядку */ }
      const dk = await deck(r.body);
      for (let k = a; k < b; k++) out[k] = dk.view(starts[k - a] ?? (k - a));
      a = b;
    }
    return out;
  }

  /* показать в элементе: адрес картинки или слайд из deck() */
  function put(el, v) {
    if (!v) return;
    if (typeof v === 'string') {
      const old = el.querySelector(':scope > img, :scope > svg.thumb, :scope > .sv');
      const img = document.createElement('img');
      img.alt = ''; img.src = v;
      if (old) { if (old._sv) drop(old._sv); old.replaceWith(img); } else el.prepend(img);
      el.querySelector('.thumb-load')?.remove();
      return;
    }
    v.mount(el);
  }

  // библиотека загружается заранее, пока человек выбирает файлы
  if (available()) setTimeout(load, 1500);
  return {available, images, deck, put, load};
})();
