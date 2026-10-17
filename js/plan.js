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
  function open(spec, data, msg, opts) {
    if (!spec.meta || typeof spec.meta !== 'object') spec.meta = {};
    state.spec = spec;
    state.info = data ? data.info : null;
    state.warnings = data ? (data.warnings || []) : [];
    Icons.sync(spec.meta);
    Materials.syncGrad(spec.meta);                   // градиент в фигурах (1.9)
    Check.reset();
    if (spec.meta.template === undefined) spec.meta.template = Materials.template();
    else if (spec.meta.template !== Materials.template() && state.templates.some(t => t.id === spec.meta.template)) {
      $('#optTpl').value = spec.meta.template; store('tpl', spec.meta.template);
    }
    Thumbs.reset();
    render();
    if (!(opts && opts.nosave)) saveProject();
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
    Materials.sums();
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
    KW.renderBar();                                   // тема доклада и ключевые слова материалов (1.8)
    const notes = $('#planNotes');
    const w = state.warnings || [];
    notes.classList.toggle('hidden', !w.length);
    notes.innerHTML = w.length ? `<details><summary>Замечания конструктора: ${w.length}</summary><ul>${w.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : '';
    // список меняется целиком за раз: без пустого промежутка страница не прыгает наверх (после перетаскивания, удаления)
    const ol = $('#slideList'), y = scrollY, frag = document.createDocumentFragment();
    sp.slides.forEach((s, i) => frag.appendChild(slideEl(s, i)));
    ol.replaceChildren(frag);
    if (state.tab === 'plan' && Math.abs(scrollY - y) > 2) scrollTo(0, y);
    Thumbs.schedule();
  }
  function plural(n, a, b, c) { const m = n % 100, k = n % 10; return m > 10 && m < 20 ? c : k === 1 ? a : (k > 1 && k < 5 ? b : c); }

  const GRIP = '<svg viewBox="0 0 12 20" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="4" r="1.7"/><circle cx="9" cy="4" r="1.7"/><circle cx="3" cy="10" r="1.7"/><circle cx="9" cy="10" r="1.7"/><circle cx="3" cy="16" r="1.7"/><circle cx="9" cy="16" r="1.7"/></g></svg>';
  function slideEl(s, i) {
    const li = h(`<li class="slide" role="button" tabindex="0">
      <button type="button" class="grip" aria-label="Переместить слайд ${i + 1}: перетащите вверх или вниз">${GRIP}</button>
      <div class="pic">${thumbSvg(s.layout, s)}<span class="num">${i + 1}</span></div>
      <div class="info"><div class="t"></div><div class="lay"></div></div>
      <span class="go"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></span></li>`);
    $('.t', li).textContent = slideTitle(s);
    // 1.9: «Вид: Карточки ▾» — нажатие открывает варианты и все виды; у титула, раздела, финала и своего слайда — просто подпись
    if (s.layout === 'own' || META.includes(s.layout)) $('.lay', li).appendChild(h(`<span class="tag">${esc(s.layout === 'own' ? `📎 Свой слайд · ${(s.own || {}).n || ''}` : layoutName(s.layout))}</span>`));
    else {
      const vb = h(`<button type="button" class="tag view-tag">${viewLabel(s)}</button>`);
      vb.addEventListener('click', e => {
        e.stopPropagation();
        ViewPick.open(s, n => { const arr = state.spec.slides, k = arr.indexOf(s); if (n !== s && k >= 0) arr[k] = n; planChanged(); });
      });
      $('.lay', li).appendChild(vb);
    }
    if ((s.remarks || []).length) $('.lay', li).appendChild(h(`<span class="tag">💬 ${s.remarks.length}</span>`));
    if (s.found_n) $('.lay', li).appendChild(h(`<span class="tag">🔎 +${s.found_n}</span>`));
    if (s.example) $('.lay', li).appendChild(h(`<span class="tag">📐 по образцу</span>`));
    badgeEls(s, i).forEach(b => $('.lay', li).appendChild(b));
    const pic = $('.pic', li);
    Thumbs.attach(pic, s);
    li.addEventListener('click', () => Editor.open(s));
    $('.grip', li).addEventListener('click', e => e.stopPropagation());    // ручка только перетаскивает
    return li;
  }

  /* 1.9: порядок слайдов — перетаскиванием за ⋮⋮ (палец, мышь, перо); у края экрана список прокручивается сам */
  const DRAG = {on: false};
  function bindDrag() {
    const ol = $('#slideList');
    ol.addEventListener('pointerdown', e => {
      const g = e.target.closest('.grip');
      if (!g || e.button > 0 || !state.spec) return;
      const li = g.closest('li.slide'), from = [...ol.children].indexOf(li);
      if (from < 0) return;
      e.preventDefault();
      try { g.setPointerCapture(e.pointerId); } catch (err) { /* старый браузер */ }
      Object.assign(DRAG, {on: true, started: false, li, from, to: from, y0: e.clientY, y: e.clientY, mark: null, raf: 0,
        maxY: document.scrollingElement.scrollHeight - innerHeight});   // дальше конца плана не прокручивать
    });
    ol.addEventListener('pointermove', e => {
      if (!DRAG.on) return;
      DRAG.y = e.clientY;
      if (!DRAG.started) {
        if (Math.abs(e.clientY - DRAG.y0) < 6) return;
        DRAG.started = true;
        DRAG.li.classList.add('dragging');
        document.body.classList.add('dragging-slide');
        if (navigator.vibrate) try { navigator.vibrate(8); } catch (err) { /* нет */ }
        DRAG.raf = requestAnimationFrame(dragScroll);
      }
      dragPlace();
    });
    const end = e => {
      if (!DRAG.on) return;
      const {started, from, to, li} = DRAG;
      DRAG.on = false;
      cancelAnimationFrame(DRAG.raf);
      document.body.classList.remove('dragging-slide');
      if (li) { li.classList.remove('dragging'); li.style.transform = ''; }
      dragMark(null, '');
      if (!started || e.type === 'pointercancel') return;
      moveSlide(from, to);
    };
    ol.addEventListener('pointerup', end);
    ol.addEventListener('pointercancel', end);
    ol.addEventListener('keydown', e => {             // с клавиатуры: ↑ ↓ на ручке
      const g = e.target.closest('.grip');
      if (!g || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const from = [...ol.children].indexOf(g.closest('li.slide')), to = from + (e.key === 'ArrowUp' ? -1 : 1);
      if (to < 0 || to >= state.spec.slides.length) return;
      moveSlide(from, to > from ? to + 1 : to);
      const li = $('#slideList').children[to];
      if (li) $('.grip', li).focus();
    });
  }
  function dragMark(el, cls) {                        // куда встанет слайд — линия над слайдом (или под последним)
    if (DRAG.mark && (DRAG.mark[0] !== el || DRAG.mark[1] !== cls)) DRAG.mark[0].classList.remove(DRAG.mark[1]);
    DRAG.mark = el ? [el, cls] : null;
    if (el) el.classList.add(cls);
  }
  function dragPlace() {
    const items = [...$('#slideList').children];
    DRAG.li.style.transform = `translateY(${DRAG.y - DRAG.y0}px)`;
    let to = items.length;
    for (let k = 0; k < items.length; k++) {
      if (items[k] === DRAG.li) continue;
      const r = items[k].getBoundingClientRect();
      if (DRAG.y < r.top + r.height / 2) { to = k; break; }
    }
    DRAG.to = to;
    if (to === DRAG.from || to === DRAG.from + 1) dragMark(null, '');
    else if (to < items.length) dragMark(items[to], 'drop-before');
    else dragMark(items[items.length - 1], 'drop-after');
  }
  function dragScroll() {
    if (!DRAG.on) return;
    const top = $('.appbar').getBoundingClientRect().bottom + 60, bottom = $('#cta').getBoundingClientRect().top - 40;
    let dy = DRAG.y < top ? -Math.min(22, (top - DRAG.y) / 2 + 4) : (DRAG.y > bottom ? Math.min(22, (DRAG.y - bottom) / 2 + 4) : 0);
    dy = Math.round(Math.max(-scrollY, Math.min(dy, DRAG.maxY - scrollY)));
    if (dy) { window.scrollBy(0, dy); DRAG.y0 -= dy; dragPlace(); }
    DRAG.raf = requestAnimationFrame(dragScroll);
  }
  function moveSlide(from, to) {                      // to — «перед каким слайдом» в прежнем порядке
    const arr = state.spec.slides;
    if (to === from || to === from + 1) return;
    const [s] = arr.splice(from, 1);
    const at = to > from ? to - 1 : to;
    arr.splice(at, 0, s);
    planChanged();
    toast(`Слайд ${from + 1} теперь ${at + 1}-й`);
    if (!restore('dragged', 0)) { store('dragged', 1); $('#planDragHint').classList.add('hidden'); }   // подсказка больше не нужна
  }
  /* удалённый слайд можно вернуть */
  function undoDelete(s, k) {
    planChanged();
    const name = slideTitle(s);
    undoToast(`Слайд «${name.length > 40 ? name.slice(0, 39) + '…' : name}» удалён`, () => {
      const arr = state.spec.slides;
      arr.splice(Math.min(k, arr.length), 0, s);
      planChanged();
      toast('Слайд возвращён');
    });
  }

  /* «⋯ Ещё» над планом: замечания ко всему плану, версии, свои слайды, план в файл */
  function planMore() {
    const body = h('<div class="menu-group" style="margin:0"></div>');
    const sh = openSheet({title: 'План: ещё', body});
    [['remarks', '💬', 'Замечания ко всему плану', '«сделай короче», «без содержания»…'],
     ['versions', '👥', 'Версии для слушателей', 'Короче для руководства, подробнее для экспертов'],
     ['own', '📎', 'Свои слайды из PowerPoint', 'Вставить готовые слайды из своей презентации'],
     ['save', '⇩', 'Сохранить план в файл', 'Файл .plan.json — открывается и в Windows-версии'],
     ['open', '📂', 'Открыть план из файла', 'Файл .plan.json']].forEach(([a, ic, t, sub]) => {
      const b = h(`<button class="menu-item" type="button"><i>${ic}</i><span><b>${esc(t)}</b><small>${esc(sub)}</small></span></button>`);
      b.addEventListener('click', () => {
        sh.close();
        if (a === 'remarks') planRemarks();
        if (a === 'versions') Versions.open();
        if (a === 'own') Own.open();
        if (a === 'save') savePlan();
        if (a === 'open') openPlanFile();
      });
      body.appendChild(b);
    });
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
      state.built = {name, at: Date.now()}; saveSoon(300);          // в «Моих презентациях» видно, что собрана
      if (w.length) { state.warnings = w; render(); }
    } catch (e) { toast(e.message, true, 9000); } finally { Busy.off(); }
  }

  function init() {
    $('#btnAddSlide').addEventListener('click', addSlide);
    $('#btnBulkPics').addEventListener('click', () => Pictures.openBulk());
    $('#btnCheck').addEventListener('click', () => Check.open());
    if (restore('dragged', 0)) $('#planDragHint').classList.add('hidden');
    $('#btnPlanMore').addEventListener('click', planMore);
    $('#planInput').addEventListener('change', onPlanFile);
    bindDrag();
  }
  return {init, open, render, build, savePlan, openPlanFile, addSlide, badges, undoDelete, planRemarks};
})();

/* ---------------------------------------------------------------- картинки слайдов (миниатюры) */
const Thumbs = (() => {
  const cache = new Map();          // ключ слайда → адрес картинки
  const waiting = new Map();        // ключ → [элементы .pic]
  let timer = null, running = false;
  const key = s => JSON.stringify([stripAlts(s), state.spec && state.spec.meta.title, state.spec && state.spec.meta.template,
    state.spec && state.spec.meta.icon_shape, state.spec && state.spec.meta.icon_3d, state.spec && state.spec.meta.gradients, state.spec && state.spec.slides.indexOf(s)]);
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
      const big = document.documentElement.getAttribute('data-thumb') !== 's' && document.documentElement.getAttribute('data-thumb') !== 'm';
      const urls = await SlidesView.images(slides, state.spec.meta, {width: big ? 720 : 480, numbers});   // крупные миниатюры — чётче
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
