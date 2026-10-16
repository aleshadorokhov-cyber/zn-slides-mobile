/* plan.js — экран «План» (список слайдов), экран «Просмотр», полноэкранный просмотр, сборка .pptx. */
'use strict';
function kindOf(l) { return (state.layouts[l] || {}).kind; }
function layoutName(l) { return l === 'own' ? 'Свой слайд из PowerPoint' : ((state.layouts[l] || {}).name || l); }
function thumbSvg(layout, s) {
  return `<svg class="thumb" viewBox="0 0 72 40" xmlns="http://www.w3.org/2000/svg"><rect width="72" height="40" fill="#fff"/>${TH[layout] || TH.cards}</svg>`;
}
function slideTitle(s) {
  if (s.layout === 'title') return state.spec.meta.title || 'Титульный слайд';
  if (s.layout === 'end') return s.title || 'Спасибо за внимание!';
  return s.title || layoutName(s.layout);
}

const Plan = (() => {
  function open(spec, data, msg) {
    if (!spec.meta || typeof spec.meta !== 'object') spec.meta = {};
    state.spec = spec;
    state.info = data ? data.info : null;
    state.warnings = data ? (data.warnings || []) : [];
    Icons.sync(spec.meta);
    Check.reset();
    if (spec.meta.template === undefined) spec.meta.template = Materials.template();
    else if (spec.meta.template !== Materials.template() && state.templates.some(t => t.id === spec.meta.template)) {
      $('#optTpl').value = spec.meta.template; store('tpl', spec.meta.template);
    }
    Thumbs.reset();
    render();
    saveProject();
    Check.soon();
    if (msg) { toast(msg); App.go('plan'); }
  }

  function render() {
    const sp = state.spec;
    $('#planEmpty').classList.toggle('hidden', !!sp);
    $('#planBox').classList.toggle('hidden', !sp);
    $('#planBadge').classList.toggle('hidden', !sp);
    App.updateCta();
    View.render();
    if (!sp) return;
    $('#planBadge').textContent = sp.slides.length;
    $('#planTitle').textContent = sp.meta.title || 'Презентация';
    const info = state.info || {};
    const parts = [`${sp.slides.length} ${plural(sp.slides.length, 'слайд', 'слайда', 'слайдов')}`];
    if (info.mode_used === 'ai') parts.push(info.llm_cloud ? `☁ ${info.llm_provider_name || 'облачная модель'}` : 'модель ИИ');
    else if (info.mode_used === 'search') parts.push('по правилам + поиск фраз');
    else if (info.mode_used) parts.push('по правилам');
    if (info.seconds) parts.push(`${String(info.seconds).replace('.', ',')} с`);
    $('#planMeta').textContent = parts.join(' · ');
    const notes = $('#planNotes');
    const w = state.warnings || [];
    notes.classList.toggle('hidden', !w.length);
    notes.innerHTML = w.length ? `<details><summary>Замечания конструктора: ${w.length}</summary><ul>${w.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : '';
    const ol = $('#slideList');
    ol.innerHTML = '';
    sp.slides.forEach((s, i) => ol.appendChild(slideEl(s, i)));
    Thumbs.schedule();
  }
  function plural(n, a, b, c) { const m = n % 100, k = n % 10; return m > 10 && m < 20 ? c : k === 1 ? a : (k > 1 && k < 5 ? b : c); }

  function slideEl(s, i) {
    const li = h(`<li class="slide" role="button" tabindex="0">
      <div class="pic">${thumbSvg(s.layout, s)}<span class="num">${i + 1}</span></div>
      <div class="info"><div class="t"></div><div class="lay"><span class="tag"></span></div></div>
      <span class="go"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></span></li>`);
    $('.t', li).textContent = slideTitle(s);
    $('.tag', li).textContent = s.layout === 'own' ? `📎 Свой слайд · ${(s.own || {}).n || ''}` : layoutName(s.layout);
    if ((s.alts || []).length > 1) $('.lay', li).appendChild(h(`<span class="tag alt">вариантов: ${s.alts.length}</span>`));
    if ((s.remarks || []).length) $('.lay', li).appendChild(h(`<span class="tag">💬 ${s.remarks.length}</span>`));
    if (s.found_n) $('.lay', li).appendChild(h(`<span class="tag">🔎 +${s.found_n}</span>`));
    if (s.example) $('.lay', li).appendChild(h(`<span class="tag">📐 по образцу</span>`));
    badgeEls(s, i).forEach(b => $('.lay', li).appendChild(b));
    const pic = $('.pic', li);
    Thumbs.attach(pic, s);
    li.addEventListener('click', () => Editor.open(s));
    return li;
  }

  // значки проверки у слайда: ⚠ N — важные замечания рецензента, 🔢 N — числа, которых нет в материалах
  function badgeEls(s, i) {
    return Check.badges(s).map(([tab, text, title]) => {
      const b = h(`<button type="button" class="tag chk-tag" aria-label="${esc(title)}"></button>`);
      b.textContent = text;
      b.addEventListener('click', e => { e.stopPropagation(); Check.open(tab, state.spec.slides.indexOf(s)); });
      return b;
    });
  }
  function badges() {
    if (!state.spec) return;
    $$('#slideList > li').forEach((li, i) => {
      const s = state.spec.slides[i];
      $$('.chk-tag', li).forEach(x => x.remove());
      if (s) badgeEls(s, i).forEach(b => $('.lay', li).appendChild(b));
    });
  }

  function addSlide() {
    const s = {layout: 'cards', title: 'Новый слайд', subtitle: '', items: [{title: 'Тезис', text: 'Пояснение'}], notes: ''};
    const arr = state.spec.slides;
    const at = arr.length && arr[arr.length - 1].layout === 'end' ? arr.length - 1 : arr.length;
    arr.splice(at, 0, s);
    planChanged();
    Editor.open(s);
  }

  function savePlan() {
    const blob = new Blob([JSON.stringify(state.spec, null, 2)], {type: 'application/json'});
    const name = (state.spec.meta.title || 'план').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 60) + '.plan.json';
    saveFile(blob, name).then(r => { if (r !== 'aborted') toast('План сохранён в файл ' + name); });
  }
  function openPlanFile() { $('#planInput').click(); }
  function onPlanFile(e) {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    f.text().then(t => {
      try {
        const sp = JSON.parse(String(t).replace(/^﻿/, ''));
        if (!sp || !Array.isArray(sp.slides)) throw new Error('в файле нет плана презентации');
        state.projectId = null;
        open(sp, null, 'План открыт');
      } catch (err) { toast('Не удалось открыть план: ' + err.message, true); }
    });
  }

  function planRemarks() {
    const o = {text: ''};
    const body = h('<div></div>');
    body.appendChild(h('<p class="hint" style="margin-top:0">Правилами для всего плана выполняются: «сделай короче», «без анимации», «без пояснений», «убери раздел «…»», «без содержания», «без разделителей». Замечание к одному слайду пишите в самом слайде.</p>'));
    body.appendChild(field('Замечания', o, 'text', {area: true, rows: 4, placeholder: 'Например: сделай короче; без содержания'}));
    const go = h('<button class="btn primary">Выполнить</button>');
    const sh = openSheet({title: 'Замечания к плану', body, foot: go});
    go.onclick = async () => {
      if (!o.text.trim()) { toast('Напишите замечания.', true); return; }
      sh.close();
      Busy.on('Выполняю замечания…');
      try {
        const r = await apiJSON('POST', '/api/revise_plan', {spec: state.spec, remarks: o.text.trim()});
        state.spec = r.spec;
        planChanged();
        toast(r.done.length ? `Сделано: ${r.done.join(', ')}` : 'Этих замечаний правила не знают — учтите их при построении плана или напишите замечание к слайду.', !r.done.length, 8000);
      } catch (e) { toast(e.message, true, 8000); } finally { Busy.off(); }
    };
  }

  async function build() {
    if (!state.spec) return;
    Busy.on('Собираю презентацию…', {detail: 'Корпоративный шаблон, слайды, диаграммы и картинки'});
    try {
      const r = await Engine.post('/api/build', {spec: state.spec});
      if (!r.ok) throw new Error(r.json().error || 'Не удалось собрать презентацию');
      let w = [];
      try { w = JSON.parse(r.headers['x-warnings'] || '[]'); } catch (e) { /* нет */ }
      const name = filenameFrom(r, 'Презентация.pptx');
      Busy.off();
      const how = await saveFile(r.blob('application/vnd.openxmlformats-officedocument.presentationml.presentation'), name);
      if (how !== 'aborted') toast(`Готово: ${r.headers['x-slides'] || ''} слайдов · ${name}` + (w.length ? ` · ${w[0]}` : ''), false, 6000);
      if (w.length) { state.warnings = w; render(); }
    } catch (e) { toast(e.message, true, 9000); } finally { Busy.off(); }
  }

  function init() {
    $('#btnAddSlide').addEventListener('click', addSlide);
    $('#btnSavePlan').addEventListener('click', savePlan);
    $('#btnPlanRemarks').addEventListener('click', planRemarks);
    $('#btnBulkPics').addEventListener('click', () => Pictures.openBulk());
    $('#btnCheck').addEventListener('click', () => Check.open());
    $('#btnVersions').addEventListener('click', () => Versions.open());
    $('#btnOwn').addEventListener('click', () => Own.open());
    $('#planInput').addEventListener('change', onPlanFile);
  }
  return {init, open, render, build, savePlan, openPlanFile, addSlide, badges};
})();

/* ---------------------------------------------------------------- картинки слайдов (миниатюры) */
const Thumbs = (() => {
  const cache = new Map();          // ключ слайда → адрес картинки
  const waiting = new Map();        // ключ → [элементы .pic]
  let timer = null, running = false;
  const key = s => JSON.stringify([stripAlts(s), state.spec && state.spec.meta.title, state.spec && state.spec.meta.template,
    state.spec && state.spec.meta.icon_shape, state.spec && state.spec.meta.icon_3d, state.spec && state.spec.slides.indexOf(s)]);
  function stripAlts(s) { const c = Object.assign({}, s); ['alts', 'remarks', 'alt_index', 'found', 'found_n', 'example'].forEach(k => delete c[k]); return c; }
  function reset() { cache.clear(); waiting.clear(); }
  const put = (el, v) => SlidesView.put(el, v);
  /* не больше 80 слайдов и 8 подготовленных презентаций в памяти телефона: старые забываются
     (каждая правка готовит маленькую презентацию; в каждой — фоны шаблона) */
  function remember(k, v) {
    cache.delete(k); cache.set(k, v);
    const decks = () => new Set(Array.from(cache.values(), x => x && x.deck)).size;
    while (cache.size > 80 || (cache.size > 1 && decks() > 8)) cache.delete(cache.keys().next().value);
  }
  function attach(el, s) {
    const k = key(s);
    if (cache.has(k)) { put(el, cache.get(k)); return; }
    if (!SlidesView.available()) return;
    if (!el.querySelector('.thumb-load')) el.appendChild(h('<span class="thumb-load"></span>'));
    if (!waiting.has(k)) waiting.set(k, []);
    waiting.get(k).push({el, s});
  }
  function schedule(ms = 400) { clearTimeout(timer); timer = setTimeout(run, ms); }
  async function run() {
    if (running) { schedule(600); return; }
    if (!waiting.size || !state.spec) return;
    running = true;
    try {
      // по 8 слайдов за раз: первые картинки появляются быстро, длинный план не держит движок
      const batch = Array.from(waiting.entries()).slice(0, 8);
      batch.forEach(([k]) => waiting.delete(k));
      const slides = batch.map(([, list]) => list[0].s);
      const numbers = slides.map(s => Math.max(1, state.spec.slides.indexOf(s) + 1));
      const urls = await SlidesView.images(slides, state.spec.meta, {width: 480, numbers});
      batch.forEach(([k, list], i) => {
        if (!urls[i]) { list.forEach(x => x.el.querySelector('.thumb-load')?.remove()); return; }
        remember(k, urls[i]);
        list.forEach(x => { if (x.el.isConnected) put(x.el, urls[i]); });
      });
    } catch (e) { console.warn('thumbs', e); }
    running = false;
    if (waiting.size) schedule(50);
  }
  function get(s) { return cache.get(key(s)); }
  return {attach, schedule, reset, get, key};
})();

/* ---------------------------------------------------------------- экран «Просмотр» */
const View = (() => {
  function render() {
    const sp = state.spec;
    $('#viewEmpty').classList.toggle('hidden', !!sp);
    $('#viewList').classList.toggle('hidden', !sp);
    if (!sp || state.tab !== 'view') return;
    const box = $('#viewList');
    box.innerHTML = '';
    sp.slides.forEach((s, i) => {
      const it = h(`<div class="view-item"><div class="pic">${thumbSvg(s.layout, s)}</div>
        <div class="cap"><b>${i + 1}</b><span></span><button class="icon-btn" aria-label="Изменить слайд">✎</button></div></div>`);
      $('span', it).textContent = slideTitle(s);
      $('.pic', it).addEventListener('click', () => LB.open(i));
      $('button', it).addEventListener('click', () => Editor.open(s));
      Thumbs.attach($('.pic', it), s);
      box.appendChild(it);
    });
    Thumbs.schedule(50);
  }
  return {render};
})();

/* полноэкранный просмотр: листать пальцем */
const LB = {
  el: null,
  open(i) {
    const sp = state.spec;
    const el = h(`<div class="lightbox"><div class="lb-top"><div class="t"></div>
      <button class="icon-btn" data-a="edit" aria-label="Изменить слайд">✎</button>
      <button class="icon-btn" data-a="x" aria-label="Закрыть"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="lb-track"></div>
      <div class="lb-bot"><button class="btn ghost small" data-a="prev">‹ Назад</button><span class="lb-count"></span><button class="btn ghost small" data-a="next">Вперёд ›</button></div></div>`);
    const track = $('.lb-track', el);
    sp.slides.forEach(s => {
      const sl = h(`<div class="lb-slide"><div class="pic">${thumbSvg(s.layout, s)}</div></div>`);
      Thumbs.attach($('.pic', sl), s);
      track.appendChild(sl);
    });
    Thumbs.schedule(0);
    document.body.appendChild(el);
    this.el = el;
    Hist.sync();
    const cur = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    const upd = () => { const k = cur(); $('.lb-count', el).textContent = `${k + 1} / ${sp.slides.length}`; $('.t', el).textContent = slideTitle(sp.slides[k] || {}); };
    track.addEventListener('scroll', () => requestAnimationFrame(upd));
    const go = k => track.scrollTo({left: k * track.clientWidth, behavior: 'smooth'});
    $$('[data-a]', el).forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.a;
      if (a === 'x') this.close();
      if (a === 'prev') go(Math.max(0, cur() - 1));
      if (a === 'next') go(Math.min(sp.slides.length - 1, cur() + 1));
      if (a === 'edit') { const s = sp.slides[cur()]; this.close(); Editor.open(s); }
    }));
    requestAnimationFrame(() => { track.scrollLeft = i * track.clientWidth; upd(); });
  },
  close(fromHistory) {
    if (!this.el) return;
    this.el.remove(); this.el = null;
    if (!fromHistory) Hist.sync();
  },
};
