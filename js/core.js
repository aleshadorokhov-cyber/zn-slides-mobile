/* core.js — состояние, навигация, окна, сообщения, хранение планов в телефоне. */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const clone = o => JSON.parse(JSON.stringify(o));

const state = {
  files: [], spec: null, info: null, warnings: [], status: null,
  layouts: {}, layoutList: [], templates: [], tab: 'materials', projectId: null,
  mode: 'rules', aiLevel: 'fast', slides: 0, dirty: false,
};

/* ---------------------------------------------------------------- хранение мелочей */
function store(key, val) { try { localStorage.setItem('znm.' + key, JSON.stringify(val)); } catch (e) { /* нет места или запрещено */ } }
function restore(key, def) { try { const v = localStorage.getItem('znm.' + key); return v === null ? def : JSON.parse(v); } catch (e) { return def; } }

/* ---------------------------------------------------------------- сообщения */
function toast(msg, isError = false, ms = 4200) {
  const el = h(`<div class="toast${isError ? ' err' : ''}"><span></span></div>`);
  el.firstChild.textContent = msg;
  $('#toasts').appendChild(el);
  const kill = () => { el.style.transition = 'opacity .25s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 260); };
  el.addEventListener('click', kill);
  setTimeout(kill, ms);
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
}

/* ---------------------------------------------------------------- «Работаю…» */
const Busy = {
  on(text, opts = {}) {
    $('#busyText').textContent = text || 'Работаю…';
    $('#busyDetail').innerHTML = opts.detail || '';
    const c = $('#busyCancel');
    c.classList.toggle('hidden', !opts.cancel);
    c.disabled = false; c.textContent = 'Отменить';
    c.onclick = opts.cancel ? () => { c.disabled = true; c.textContent = 'Отменяю…'; opts.cancel(); } : null;
    $('#busy').classList.remove('hidden');
  },
  progress(view) {
    const p = (view && view.progress) || {};
    const [head, detail] = progressText(p, view && view.elapsed);
    $('#busyText').textContent = head;
    const bar = (p.phase === 'gen' || (p.phase === 'draw' && p.tokens)) ? `<div class="bar"><i style="width:${Math.min(96, 8 + (p.tokens || 0) / 20)}%"></i></div>`
      : (p.phase === 'wait' || p.phase === 'think' ? '<div class="bar wait"><i></i></div>' : '');
    $('#busyDetail').innerHTML = (detail || '') + bar;
  },
  text(t, d) { $('#busyText').textContent = t; if (d !== undefined) $('#busyDetail').innerHTML = d; },
  off() { $('#busy').classList.add('hidden'); },
};

/* ---------------------------------------------------------------- ответы движка */
async function apiJSON(method, path, body) {
  const r = await Engine.api(method, path, body === undefined ? {} : (body instanceof FormData ? {form: body} : {json: body}));
  const d = r.json();
  if (!r.ok) throw new Error(d.error || `Ошибка ${r.status}`);
  return d;
}
/* фоновое задание (анализ, справка): ход работы — в окне «Работаю…», отмена — перезапуск движка */
async function runJob(path, body, what) {
  const r = await Engine.api('POST', path, body instanceof FormData ? {form: body} : {json: body});
  const d = r.json();
  if (!r.ok) throw new Error(d.error || `Ошибка ${r.status}`);
  if (!d.job) return d;
  const view = await Engine.waitJob(d.job, v => Busy.progress(v));
  if (view.state === 'done') return view.result;
  if (view.state === 'cancelled') throw Object.assign(new Error(`${what} — отменено.`), {cancelled: true});
  throw new Error(view.error || `${what}: ошибка`);
}
function cancelEngine() { LocalLLM.stop(); Engine.cancelJob(); }

/* картинки из движка (библиотека, свои, значки) → адрес для <img> */
const IMG = new Map();
function engineImage(path) {
  if (IMG.has(path)) return IMG.get(path);
  const p = Engine.get(path).then(r => r.ok ? URL.createObjectURL(r.blob()) : '').catch(() => '');
  p.then(u => { if (!u) IMG.delete(path); });        // не вышло (например, без сети) — в следующий раз попробуем снова
  IMG.set(path, p);
  return p;
}
function setImg(img, path) { engineImage(path).then(u => { if (u) img.src = u; }); }
const lazyObs = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { lazyObs.unobserve(e.target); setImg(e.target, e.target.dataset.src); }
}), {rootMargin: '200px'}) : null;
function lazyImg(img, path) { img.dataset.src = path; if (lazyObs) lazyObs.observe(img); else setImg(img, path); }

/* ---------------------------------------------------------------- файлы: сохранить / поделиться */
async function saveFile(blob, name) {
  const file = new File([blob], name, {type: blob.type});
  // на телефоне «Поделиться» — сразу в PowerPoint, Файлы, почту или мессенджер
  if (navigator.canShare && navigator.canShare({files: [file]}) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try { await navigator.share({files: [file], title: name}); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'aborted'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return 'saved';
}
function filenameFrom(r, fallback) {
  const cd = r.headers['content-disposition'] || '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
  return m ? decodeURIComponent(m[1]) : fallback;
}

/* ---------------------------------------------------------------- окна-листы */
const Sheets = [];
function openSheet({title, sub = '', body, foot, full = false, onClose, back = false}) {
  const wrap = h(`<div class="sheet-wrap"><div class="sheet-back"></div><div class="sheet${full ? ' full' : ''}" role="dialog" aria-modal="true">
    <div class="sheet-grip"></div>
    <div class="sheet-head">${back ? '<button class="icon-btn" data-x="1" aria-label="Назад"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>' : ''}
      <h3><span class="ttl"></span><span class="sub"></span></h3>
      ${back ? '' : '<button class="icon-btn" data-x="1" aria-label="Закрыть"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>'}</div>
    <div class="sheet-body"></div></div></div>`);
  $('.ttl', wrap).textContent = title || '';
  $('.sub', wrap).textContent = sub;
  if (!sub) $('.sub', wrap).remove();
  const bodyEl = $('.sheet-body', wrap);
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  if (foot) { const f = h('<div class="sheet-foot"></div>'); (Array.isArray(foot) ? foot : [foot]).forEach(x => f.appendChild(x)); $('.sheet', wrap).appendChild(f); }
  const sh = {wrap, body: bodyEl, onClose, closed: false,
    close(fromHistory) {
      if (sh.closed) return;
      sh.closed = true;
      const i = Sheets.indexOf(sh); if (i >= 0) Sheets.splice(i, 1);
      wrap.remove();
      if (!fromHistory) Hist.sync();
      if (onClose) onClose();
    },
    setTitle(t, s) { $('.ttl', wrap).textContent = t; },
  };
  $$('[data-x]', wrap).forEach(b => b.addEventListener('click', () => sh.close()));
  $('.sheet-back', wrap).addEventListener('click', () => sh.close());
  $('#sheetHost').appendChild(wrap);
  Sheets.push(sh);
  Hist.sync();
  return sh;
}
/* кнопка «Назад» в Android и жест в iPhone закрывают верхнее окно. Пока открыто хоть одно окно, в истории
   браузера ровно одна лишняя запись; history.back() срабатывает не сразу, поэтому ждём его (pending). */
const Hist = {
  pending: 0,
  want() { return Sheets.length > 0 || !!(typeof LB !== 'undefined' && LB.el); },
  sync() {
    if (this.pending) return;
    const has = !!(history.state && history.state.zn);
    if (this.want() && !has) history.pushState({zn: 1}, '');
    else if (!this.want() && has) { this.pending++; history.back(); }
  },
};
if (history.state && history.state.zn) history.replaceState(null, '');
window.addEventListener('popstate', () => {
  if (Hist.pending) { Hist.pending--; Hist.sync(); return; }
  const sh = Sheets[Sheets.length - 1];
  if (typeof LB !== 'undefined' && LB.el) LB.close(true);
  else if (sh) sh.close(true);
  Hist.sync();
});
function closeAllSheets() { while (Sheets.length) Sheets[Sheets.length - 1].close(); }

function confirmSheet(text, okText = 'Да', danger = false) {
  return new Promise(res => {
    const ok = h(`<button class="btn ${danger ? 'danger' : 'primary'}">${esc(okText)}</button>`);
    const no = h('<button class="btn ghost">Отмена</button>');
    let done = false;
    const sh = openSheet({title: text, body: '', foot: [no, ok], onClose: () => { if (!done) res(false); }});
    sh.body.remove();
    ok.onclick = () => { done = true; sh.close(); res(true); };
    no.onclick = () => { done = true; sh.close(); res(false); };
  });
}

/* поле, связанное со свойством объекта */
function field(label, obj, key, opts = {}) {
  const wrap = h(`<label class="fld"><span></span></label>`);
  $('span', wrap).textContent = label;
  const el = document.createElement(opts.area ? 'textarea' : (opts.select ? 'select' : 'input'));
  if (opts.select) el.innerHTML = opts.select.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
  if (opts.rows) el.rows = opts.rows;
  if (opts.placeholder) el.placeholder = opts.placeholder;
  if (opts.inputmode) el.inputMode = opts.inputmode;
  el.value = opts.get ? opts.get() : (obj[key] ?? '');
  el.addEventListener(opts.select ? 'change' : 'input', () => { opts.set ? opts.set(el.value) : (obj[key] = el.value); if (opts.onChange) opts.onChange(el.value); });
  wrap.appendChild(el);
  if (opts.hint) wrap.appendChild(h(`<div class="hint">${esc(opts.hint)}</div>`));
  return wrap;
}

/* ---------------------------------------------------------------- планы в телефоне (IndexedDB) */
const DB = {
  db: null,
  open() {
    if (this.db) return this.db;
    this.db = new Promise((res, rej) => {
      const r = indexedDB.open('znm-projects', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('p', {keyPath: 'id'});
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this.db;
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('p', mode); const st = t.objectStore('p');
      const out = fn(st);
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
      t.onerror = () => rej(t.error);
    });
  },
  put(p) { return this.tx('readwrite', st => st.put(p)); },
  get(id) { return this.tx('readonly', st => st.get(id)); },
  del(id) { return this.tx('readwrite', st => st.delete(id)); },
  all() { return this.tx('readonly', st => st.getAll()); },
};
let saveTimer = null;
function planChanged(opts = {}) {
  state.dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveProject, 800);
  if (!opts.quiet) { Plan.render(); }
  Check.soon();                       // рецензент и сверка чисел: значки ⚠ и 🔢 у слайдов
}
async function saveProject() {
  if (!state.spec) return;
  if (!state.projectId) state.projectId = 'p' + Date.now().toString(36);
  try {
    await DB.put({id: state.projectId, title: state.spec.meta.title || 'Презентация', updated: Date.now(),
      slides: state.spec.slides.length, spec: state.spec, info: state.info, warnings: state.warnings});
    store('lastProject', state.projectId);
    state.dirty = false;
  } catch (e) { console.warn('save', e); }
}
