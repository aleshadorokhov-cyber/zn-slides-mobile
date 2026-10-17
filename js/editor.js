/* editor.js — правка слайда: макет, тексты, элементы, таблица, диаграмма, варианты, замечание. */
'use strict';
const ITEM_FIELDS = {          // какие поля у элемента в разных макетах
  numeric: [['value', 'Значение', 'numeric'], ['unit', 'Единица'], ['title', 'Подпись'], ['text', 'Пояснение', 'area']],
  labeled: [['label', 'Срок / статус'], ['title', 'Заголовок'], ['text', 'Текст', 'area']],
  risk: [['prob', 'Вероятность 1–3', 'numeric'], ['impact', 'Последствия 1–3', 'numeric'], ['title', 'Риск'], ['text', 'Пояснение', 'area']],
  agenda: [['text', 'Пункт содержания']],
  default: [['title', 'Заголовок'], ['text', 'Текст', 'area']],
};
const LABEL_NAMES = {checklist: 'Статус (выполнено, в работе, план)', well: 'Глубина, интервал или срок', gantt: 'Срок (2026, I кв. 2026…)', path: 'Год или срок'};
function itemFields(layout) {
  if (NUMERIC.includes(layout)) return ITEM_FIELDS.numeric;
  if (layout === 'risk') return ITEM_FIELDS.risk;
  if (layout === 'agenda') return ITEM_FIELDS.agenda;
  if (LABELED.includes(layout)) return ITEM_FIELDS.labeled.map(f => f[0] === 'label' && LABEL_NAMES[layout] ? [f[0], LABEL_NAMES[layout]] : f);
  return ITEM_FIELDS.default;
}

/* ---------------------------------------------------------------- смена макета (как в Windows-версии) */
function asItems(s) {
  const k = kindOf(s.layout);
  if (k === 'items') return s.items || [];
  if (k === 'text') return [s.lead].concat(s.paragraphs || []).filter(Boolean).map(t => ({title: '', text: t}));
  if (k === 'compare') return ((s.left || {}).items || []).concat((s.right || {}).items || []).map(t => ({title: '', text: t}));
  if (k === 'table') return (s.rows || []).map(r => {
    const cells = r.map(c => String(c ?? '').trim());
    const j = cells.findIndex(Boolean);
    return {title: j >= 0 ? cells[j] : '', text: cells.slice(j + 1).filter(Boolean).join(', ')};
  });
  if (k === 'chart') return ((s.chart || {}).categories || []).map((c, i) => ({title: c, text: '', value: String(((s.chart.series || [])[0] || {values: []}).values[i] ?? '')}));
  return [];
}
function convert(s, to) {
  const from = s.layout;
  if (from === to) return;
  const kf = kindOf(from), kt = kindOf(to);
  const items = asItems(s);
  s.layout = to;
  if (kt === 'items') {
    s.items = items;
    if (CENTERED.includes(to) && !s.center) s.center = s.title || '';
    if (NUMERIC.includes(to)) s.items = items.map(it => ({value: it.value || '', unit: it.unit || '', title: it.title || it.text || '', text: it.title ? it.text : ''}));
  } else if (kt === 'text') {
    s.lead = s.lead || (items[0] ? (items[0].title ? items[0].title + '. ' : '') + items[0].text : '');
    s.paragraphs = s.paragraphs || items.slice(1).map(it => (it.title ? it.title + '. ' : '') + (it.text || ''));
  } else if (kt === 'compare') {
    const half = Math.ceil(items.length / 2);
    const t = it => (it.title ? it.title + '. ' : '') + (it.text || '');
    s.left = s.left || {title: 'Было', items: items.slice(0, half).map(t)};
    s.right = s.right || {title: 'Стало', items: items.slice(half).map(t)};
    s.style = s.style || 'before_after';
  } else if (kt === 'table') {
    if (kf === 'chart' && s.chart) { s.columns = ['Категория'].concat(s.chart.series.map(x => x.name)); s.rows = s.chart.categories.map((c, i) => [c].concat(s.chart.series.map(x => x.values[i] ?? ''))); }
    else if (kf === 'compare' && s.left && s.right) {
      const n = Math.max(s.left.items.length, s.right.items.length);
      s.columns = [s.left.title || 'Было', s.right.title || 'Стало'];
      s.rows = Array.from({length: n}, (_, i) => [s.left.items[i] || '', s.right.items[i] || '']);
    } else if (!s.columns) { s.columns = ['Пункт', 'Описание']; s.rows = items.map(it => [it.title || '', it.text || '']); }
  } else if (kt === 'chart') {
    if (kf === 'table' && s.columns) s.chart = tsvToChart(tableToTSV(s.columns, s.rows), {type: (s.chart || {}).type || 'column', unit: (s.chart || {}).unit || ''});
    else if (!s.chart) s.chart = {type: 'column', unit: '', categories: items.map(it => it.title || it.text), series: [{name: 'Значение', values: items.map(it => num(it.value))}]};
    s.insights = s.insights || [];
  }
}

const Editor = (() => {
  let cur = null;                 // {s, sh, prevTimer}

  function open(s, after) {
    const body = h('<div class="ed"></div>');
    const sh = openSheet({title: '', full: true, back: true, body, onClose: () => { cur = null; planChanged(); if (after) after(); }});
    cur = {s, sh};
    draw();
  }
  function idx() { return state.spec.slides.indexOf(cur.s); }
  function redraw() { if (cur) draw(); }
  function changed() { if (!cur) return; planChanged({quiet: true}); schedulePreview(); }
  function replace(n) {                   // слайд заменён другим объектом (вариант, правка по замечанию)
    const k = idx();
    if (k >= 0) state.spec.slides[k] = n;
    cur.s = n;
    draw();
  }

  function draw() {
    const s = cur.s, b = cur.sh.body, k = idx();
    cur.sh.setTitle(`Слайд ${k + 1} из ${state.spec.slides.length}`);
    b.innerHTML = '';
    // картинка слайда
    const pv = h(`<div class="ed-preview">${thumbSvg(s.layout, s)}</div>`);
    pv.addEventListener('click', () => LB.open(k));
    b.appendChild(pv);
    cur.pv = pv;
    showPreview();
    // 1.9: «Вид: Карточки ▾» — варианты под содержание слайда и все виды по группам; дальше крупные кнопки
    const meta = META.includes(s.layout) || s.layout === 'own';
    if (!meta) {
      const vb = h(`<button type="button" class="view-btn">${viewLabel(s)}</button>`);
      vb.addEventListener('click', () => ViewPick.open(cur.s, n => { if (n !== cur.s) replace(n); else draw(); changed(); }));
      b.appendChild(vb);
    }
    const tools = h(`<div class="ed-tools">
      ${meta ? '' : `<button class="ed-tool" data-t="pic"><i>${PIC_ICON}</i>Картинки</button>`}
      ${s.layout === 'chart' ? '<button class="ed-tool" data-t="chart"><i>📊</i>Данные</button>' : ''}
      <button class="ed-tool" data-t="dup"><i>⧉</i>Копия</button>
      <button class="ed-tool danger" data-t="del"><i>🗑</i>Удалить</button></div>`);
    $$('button', tools).forEach(x => x.addEventListener('click', () => {
      const t = x.dataset.t;
      if (t === 'pic') Pictures.openSlide(cur.s, n => replace(n));
      if (t === 'chart') Chart.open(cur.s, n => replace(n));
      if (t === 'dup') duplicate();
      if (t === 'del') remove();
    }));
    b.appendChild(tools);
    // поля
    b.appendChild(h(`<div class="sec-h">${esc(layoutName(s.layout))}</div>`));
    const d = (state.layouts[s.layout] || {}).desc;
    if (d) b.appendChild(h(`<p class="hint" style="margin:-4px 2px 10px">${esc(d)}</p>`));
    fields(s, b);
    // готовые фразы из материалов и библиотеки (1.7)
    if (!META.includes(s.layout) && s.layout !== 'own') b.appendChild(Phrases.el(s, () => { draw(); changed(); }));
    // замечание
    if (!['title', 'end', 'section', 'own'].includes(s.layout)) b.appendChild(remarkEl(s));
    b.appendChild(h('<div style="height:24px"></div>'));
  }

  function fields(s, b) {
    const meta = state.spec.meta;
    const on = {onChange: changed};
    if (s.layout === 'title') {
      b.appendChild(field('Название презентации', meta, 'title', {area: true, rows: 2, ...on}));
      b.appendChild(field('Подзаголовок', meta, 'subtitle', {area: true, rows: 2, ...on}));
      b.appendChild(field('Мероприятие', meta, 'event', on));
      b.appendChild(field('Дата', meta, 'date', {placeholder: 'пусто — сегодняшняя', ...on}));
      return;
    }
    if (s.layout === 'end') {
      b.appendChild(field('Текст', s, 'title', {placeholder: 'Спасибо за внимание!', ...on}));
      b.appendChild(field('Подпись', s, 'subtitle', {placeholder: 'пусто — название презентации', ...on}));
      return;
    }
    if (s.layout === 'own') {
      const o = s.own || {};
      b.appendChild(h(`<p class="hint" style="margin:0 2px 12px">Слайд ${o.n || '?'} из файла «${esc(o.name || '')}» переносится как есть: текст, картинки, диаграммы, таблицы. Поправить содержимое можно в PowerPoint и вставить слайд заново («📎 Свои слайды» на экране «План»).</p>`));
      b.appendChild(field('Заголовок', s, 'title', {area: true, rows: 2, hint: 'При фирменном фоне — в заголовке шаблона, иначе — вместо заголовка слайда.', ...on}));
      b.appendChild(field('Фон', s, 'bg', {select: Own.BG, get: () => s.bg || 'corporate', ...on}));
      b.appendChild(field('Заметки докладчика', s, 'notes', {area: true, rows: 3}));
      return;
    }
    b.appendChild(field('Заголовок', s, 'title', {area: true, rows: 2, ...on}));
    if (s.layout === 'section') {
      b.appendChild(field('Подзаголовок', s, 'subtitle', on));
      b.appendChild(field('Номер раздела', s, 'number', {placeholder: '01', inputmode: 'numeric', ...on}));
      b.appendChild(field('Заметки докладчика', s, 'notes', {area: true, rows: 3}));
      return;
    }
    b.appendChild(field('Подзаголовок', s, 'subtitle', {placeholder: 'одна фраза под заголовком', ...on}));
    const k = kindOf(s.layout);
    if (k === 'items') {
      if (CENTER_LABEL[s.layout]) b.appendChild(field(CENTER_LABEL[s.layout], s, 'center', on));
      if (s.layout === 'iceberg') b.appendChild(field('Сколько первых элементов «над водой»', s, 'visible', {inputmode: 'numeric', placeholder: '1 или 2',
        get: () => s.visible || '', set: v => { const n = parseInt(v, 10); if (n > 0) s.visible = n; else delete s.visible; }, ...on}));
      if (s.layout === 'matrix') {
        s.axes = s.axes || {};
        const r = h('<div class="row2"></div>');
        r.appendChild(field('Ось X', s.axes, 'x', on)); r.appendChild(field('Ось Y', s.axes, 'y', on));
        b.appendChild(r);
      }
      b.appendChild(itemsEditor(s));
    } else if (k === 'table') {
      b.appendChild(h('<div class="sec-h">Таблица</div>'));
      b.appendChild(Grid.table(s, changed));
    } else if (k === 'chart') {
      if (!s.chart) s.chart = {type: 'column', unit: '', categories: [], series: []};
      const c = s.chart;
      const kind = CHART_KINDS.find(x => x[0] === c.type) || CHART_KINDS[0];
      const btn = h(`<button class="lay-btn" type="button">${kind[2].replace('<svg ', '<svg class="thumb" style="stroke:none" ')}<span><b>${esc(kind[1])}</b><small>${(c.categories || []).length} подписей · ${(c.series || []).length} ${(c.series || []).length === 1 ? 'ряд' : 'ряда(ов)'}${c.unit ? ' · ' + esc(c.unit) : ''}</small></span><span style="flex:none">›</span></button>`);
      btn.addEventListener('click', () => Chart.open(s, n => replace(n)));
      b.appendChild(btn);
      b.appendChild(field('Выводы справа от диаграммы (по одному в строке, до 4)', s, 'insights', {area: true, rows: 3,
        get: () => (s.insights || []).join('\n'), set: v => { s.insights = v.split('\n').map(x => x.trim()).filter(Boolean); }, ...on}));
    } else if (k === 'compare') {
      b.appendChild(field('Стиль', s, 'style', {select: [['before_after', 'Было → стало'], ['pros_cons', 'Плюсы / минусы'], ['neutral', 'Вариант А / Б']], ...on}));
      ['left', 'right'].forEach(side => {
        s[side] = s[side] || {title: '', items: []};
        b.appendChild(h(`<div class="sec-h">${side === 'left' ? 'Левая колонка' : 'Правая колонка'}</div>`));
        b.appendChild(field('Заголовок колонки', s[side], 'title', on));
        b.appendChild(field('Пункты — по одному в строке', s[side], 'items', {area: true, rows: 5,
          get: () => (s[side].items || []).join('\n'), set: v => { s[side].items = v.split('\n').map(x => x.trim()).filter(Boolean); }, ...on}));
      });
    } else if (k === 'text') {
      b.appendChild(field('Ключевой тезис (крупно)', s, 'lead', {area: true, rows: 3, ...on}));
      b.appendChild(field('Абзацы — через пустую строку, до 4', s, 'paragraphs', {area: true, rows: 7,
        get: () => (s.paragraphs || []).join('\n\n'), set: v => { s.paragraphs = v.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean); }, ...on}));
    } else if (k === 'image') {
      (s.images || []).forEach((im, i) => b.appendChild(field(`Подпись к рисунку ${i + 1}`, im, 'caption', on)));
      b.appendChild(h('<div class="sec-h">Тезисы рядом с рисунком</div>'));
      b.appendChild(itemsEditor(s, 'list'));
    }
    b.appendChild(field('Вывод внизу слайда', s, 'conclusion', {placeholder: 'необязательно', ...on}));
    b.appendChild(field('Заметки докладчика', s, 'notes', {area: true, rows: 3}));
  }

  function itemsEditor(s, asLayout) {
    const lay = asLayout || s.layout;
    const box = h('<div></div>');
    const max = (state.layouts[s.layout] || {}).max;
    box.appendChild(h(`<div class="sec-h">Элементы${max ? ` · до ${max} на слайде` : ''}</div>`));
    const list = h('<div class="items"></div>');
    box.appendChild(list);
    const flds = itemFields(lay);
    const hint = ITEM_HINT[lay];
    function draw() {
      list.innerHTML = '';
      s.items = s.items || [];
      s.items.forEach((it, i) => {
        if (typeof it !== 'object' || !it) s.items[i] = it = {title: '', text: String(it || '')};
        const card = h(`<div class="item"><div class="item-head"><span class="n">${i + 1}</span><span class="ic-slot"></span><span class="sp"></span>
          <button class="icon-btn" data-a="up" aria-label="Выше">↑</button><button class="icon-btn" data-a="down" aria-label="Ниже">↓</button>
          <button class="icon-btn" data-a="del" aria-label="Удалить">✕</button></div></div>`);
        const numeric = flds.filter(f => f[2] === 'numeric' || f[0] === 'unit');
        if (numeric.length >= 2) {
          const r = h('<div class="row2"></div>');
          numeric.forEach(f => r.appendChild(itemInput(it, f)));
          card.appendChild(r);
        }
        flds.filter(f => !(numeric.length >= 2 && numeric.includes(f))).forEach(f => card.appendChild(itemInput(it, f)));
        if (lay !== 'agenda') $('.ic-slot', card).replaceWith(Icons.button(it, i, () => { draw(); changed(); }));
        $$('[data-a]', card).forEach(x => x.addEventListener('click', () => {
          const a = x.dataset.a;
          if (a === 'del') s.items.splice(i, 1);
          if (a === 'up' && i > 0) [s.items[i - 1], s.items[i]] = [s.items[i], s.items[i - 1]];
          if (a === 'down' && i < s.items.length - 1) [s.items[i + 1], s.items[i]] = [s.items[i], s.items[i + 1]];
          draw(); changed();
        }));
        list.appendChild(card);
      });
    }
    function itemInput(it, [key, label, type]) {
      const el = document.createElement(type === 'area' ? 'textarea' : 'input');
      el.placeholder = label;
      if (type === 'area') el.rows = 2;
      if (type === 'numeric') el.inputMode = 'decimal';
      el.value = it[key] ?? '';
      el.setAttribute('aria-label', label);
      el.addEventListener('input', () => { it[key] = el.value; changed(); });
      return el;
    }
    draw();
    const add = h('<button class="add-btn" type="button">＋ Добавить элемент</button>');
    add.addEventListener('click', () => {
      const n = {}; flds.forEach(f => { n[f[0]] = ''; });
      s.items.push(n); draw(); changed();
      const ins = list.lastElementChild && list.lastElementChild.querySelector('input, textarea');
      if (ins) ins.focus();
    });
    box.appendChild(add);
    if (hint && !['agenda'].includes(lay) && /;/.test(hint)) box.appendChild(h(`<p class="hint">Формат: ${esc(hint)}</p>`));
    return box;
  }

  /* копия слайда — сразу под ним; удалить — с «Вернуть» (1.9: «Выше», «Ниже», «Крупно» убраны — порядок
     меняется перетаскиванием в плане, крупно — нажатием на картинку слайда) */
  function duplicate() {
    const arr = state.spec.slides, k = arr.indexOf(cur.s);
    const c = clone(cur.s);
    arr.splice(k + 1, 0, c);
    cur.s = c;
    draw(); changed();
    toast(`Копия слайда ${k + 1} — это слайд ${k + 2}`);
  }
  function remove() {
    const arr = state.spec.slides, s = cur.s, k = arr.indexOf(s);
    arr.splice(k, 1);
    cur.sh.close();
    Plan.undoDelete(s, k);
  }

  /* замечание к слайду: правилами или моделью ИИ */
  const DRAFTS = new WeakMap();
  const EXAMPLES = ['Сделай короче', 'Покажи таблицей', 'Убери пункт 2', 'Добавь картинку', 'Заголовок: …', 'Добавь пункт: …'];
  function remarkEl(s) {
    const ai = !!(state.status && state.status.llm && state.status.llm.model);
    const box = h(`<div><div class="sec-h">💬 Замечание к слайду</div><div class="remark-box">
      <textarea rows="2" placeholder="Например: заголовок: Итоги года; убери пункт 3; сделай короче; покажи процессом"></textarea>
      <div class="ex-row">${EXAMPLES.map(x => `<button type="button">${esc(x)}</button>`).join('')}</div>
      ${ai ? `<label class="sw" style="border:0"><input type="checkbox" data-ai ${state.mode === 'ai' ? 'checked' : ''}><span>С помощью модели ИИ</span></label>` : '<p class="hint" style="margin:0 0 8px">Без модели ИИ выполняются типовые правки.</p>'}
      <button class="btn primary wide" type="button">Исправить слайд</button></div></div>`);
    const ta = $('textarea', box);
    ta.value = DRAFTS.get(s) || '';
    ta.addEventListener('input', () => DRAFTS.set(s, ta.value));
    $$('.ex-row button', box).forEach(x => x.addEventListener('click', () => {
      const v = x.textContent.replace(/…$/, '');
      ta.value = ta.value ? ta.value.replace(/[;\s]*$/, '') + '; ' + v : v;
      DRAFTS.set(s, ta.value); ta.focus();
    }));
    $('.btn', box).addEventListener('click', () => revise(s, ta.value.trim(), ai && $('[data-ai]', box) && $('[data-ai]', box).checked));
    const hist = s.remarks || [];
    if (hist.length) box.appendChild(h(`<ul class="rem-list">${hist.slice().reverse().map(x => `<li><span class="st">${x.mode === 'ai' ? 'ИИ' : (x.mode === 'rules' ? 'правила' : 'не выполнено')}</span><b>${esc(x.text)}</b>${x.done ? ` — ${esc(x.done)}` : ''}</li>`).join('')}</ul>`));
    return box;
  }
  async function revise(s, remark, useAi) {
    if (!remark) { toast('Напишите, что исправить.', true); return; }
    Busy.on(useAi ? 'Модель ИИ исправляет слайд…' : 'Исправляю слайд…', {cancel: useAi ? cancelEngine : null});
    try {
      const spec = {meta: state.spec.meta, slides: state.spec.slides.map(x => { const c = Object.assign({}, x); delete c.alts; return c; })};
      const base = clone(s);
      const r = await apiJSON('POST', '/api/revise', {slide: base, remark, use_ai: !!useAi, spec});
      DRAFTS.delete(s);
      const n = r.slide;
      if (s.notes && !n.notes) n.notes = s.notes;
      replace(n);
      toast((r.done ? `Исправлено: ${r.done}` : 'Замечание не выполнено.') + ((r.warnings || []).length ? ` ${r.warnings[0]}` : ''), !r.done, 8000);
    } catch (e) { toast(e.message, true, 8000); } finally { Busy.off(); }
  }

  /* картинка слайда в редакторе: обновляется через секунду после правки */
  function schedulePreview() { clearTimeout(cur.prevTimer); cur.prevTimer = setTimeout(showPreview, 1200); if (cur.pv && !cur.pv.querySelector('.stale') && SlidesView.available()) cur.pv.appendChild(h('<span class="stale">обновляю…</span>')); }
  async function showPreview() {
    if (!cur || !SlidesView.available()) return;
    const s = cur.s, pv = cur.pv;
    const k = Thumbs.key(s);
    const ready = Thumbs.get(s);
    if (ready) { setPv(pv, ready); return; }
    try {
      const [u] = await SlidesView.images([s], state.spec.meta, {width: 960, numbers: [idx() + 1]});
      if (u && cur && cur.pv === pv && Thumbs.key(cur.s) === k) setPv(pv, u);
    } catch (e) { console.warn(e); }
  }
  function setPv(pv, u) {
    SlidesView.put(pv, u);
    pv.querySelector('.stale')?.remove();
  }

  return {open, redraw};
})();

/* выбрать вариант оформления (как в Windows-версии): заголовок и заметки сохраняются */
function chooseAlt(s, i) {
  const a = clone(s.alts[i]);
  a.notes = s.notes || a.notes || '';
  if (s.section) a.section = s.section;
  if (s.title) a.title = s.title;
  a.alts = s.alts;
  a.alt_index = i;
  return a;
}

/* ---------------------------------------------------------------- 1.9: «Вид слайда» вместо длинного списка макетов */
/* значок картинок: рамка, горы, солнце — понятнее, чем 🖼 */
const PIC_ICON = '<svg class="ico-pic" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4" width="19" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="16.5" cy="9" r="2" fill="#F2B947"/><path d="M3.6 18.6 L9 12.2 L12.6 16 L15 13.6 L20.4 18.6 Z" fill="#4BAF46"/></svg>';
/* подпись кнопки «Вид»: «Вид: Карточки · 3 варианта ▾» */
function viewLabel(s) {
  const n = (s.alts || []).length;
  return `<span class="vb-l">Вид:</span> <b>${esc(layoutName(s.layout))}</b>${n > 1 ? `<span class="vb-n">${n} ${plural(n, 'вариант', 'варианта', 'вариантов')}</span>` : ''}<span class="vb-c" aria-hidden="true">▾</span>`;
}
// все виды по понятным группам (как «Другой вид…» в Windows-версии)
const LAYOUT_GROUPS = [
  ['Список и текст', ['list', 'cards', 'checklist', 'conclusions', 'text', 'hero', 'pillars', 'layers', 'agenda']],
  ['Шаги и время', ['process', 'timeline', 'roadmap', 'stairs', 'path', 'gantt', 'cycle']],
  ['Числа и диаграммы', ['kpi', 'chart', 'table', 'bars', 'gauge', 'bubbles', 'funnel']],
  ['Сравнение и оценка', ['compare', 'balance', 'shift', 'swot', 'matrix', 'risk', 'venn']],
  ['Структура и связи', ['hub', 'tree', 'mindmap', 'pyramid', 'target', 'honeycomb', 'puzzle', 'gears', 'petals', 'converge', 'fishbone', 'iceberg', 'value_chain']],
  ['Картинка и карта', ['image', 'map']],
  ['Нефтегаз', ['well', 'field']],
];
const ViewPick = (() => {
  /* окно «Вид слайда»: сверху варианты под содержание этого слайда (с картинками), ниже — все виды по группам.
     onPick(n): n — новый объект слайда (вариант) или тот же слайд с другим видом */
  function open(s, onPick) {
    const body = h('<div class="vp"></div>');
    const k = state.spec.slides.indexOf(s);
    const sh = openSheet({title: 'Вид слайда', sub: `Слайд ${k + 1}${s.title ? ` «${s.title.length > 40 ? s.title.slice(0, 39) + '…' : s.title}»` : ''}`, full: true, body});
    const alts = s.alts || [];
    if (alts.length > 1) {
      const curI = s.alt_index || 0;
      body.appendChild(h(`<h4 class="vp-h">Подходят к этому материалу</h4>`));
      const row = h('<div class="alts-row"></div>');
      alts.forEach((a, i) => {
        const c = h(`<button type="button" class="alt-card${i === curI ? ' cur' : ''}"><div class="apic">${thumbSvg(a.layout, a)}</div><b></b><small>${i === curI ? '✓ сейчас' : 'выбрать'}</small></button>`);
        $('b', c).textContent = a.alt_label || layoutName(a.layout);
        Thumbs.attach($('.apic', c), Object.assign({}, a, {title: s.title || a.title}));
        c.addEventListener('click', () => {
          sh.close();
          if (i === curI) return;
          onPick(chooseAlt(s, i));
          toast(`Вид слайда: «${a.alt_label || layoutName(a.layout)}»`);
        });
        row.appendChild(c);
      });
      body.appendChild(row);
      Thumbs.schedule(100);
    }
    body.appendChild(h(`<h4 class="vp-h">${alts.length > 1 ? 'Другой вид' : 'Все виды'}</h4>`));
    body.appendChild(h('<div class="search"><input placeholder="Найти вид: процесс, SWOT, карта…" type="search" aria-label="Найти вид слайда"></div>'));
    const groupsEl = h('<div class="vp-groups"></div>');
    body.appendChild(groupsEl);
    const known = new Set(LAYOUT_GROUPS.flatMap(g => g[1]));
    const rest = state.layoutList.map(l => l.id).filter(id => !known.has(id) && !['title', 'end', 'section', 'own'].includes(id));
    const groups = rest.length ? LAYOUT_GROUPS.concat([['Другие', rest]]) : LAYOUT_GROUPS;
    function draw(q) {
      groupsEl.innerHTML = '';
      groups.forEach(([name, ids]) => {
        const list = ids.map(id => state.layouts[id] ? Object.assign({id}, state.layouts[id]) : null).filter(Boolean)
          .filter(l => !q || (l.name + ' ' + (l.desc || '')).toLowerCase().includes(q));
        if (!list.length) return;
        const sec = h(`<section class="vp-group"><h5></h5><div class="lay-grid"></div></section>`);
        $('h5', sec).textContent = name;
        list.forEach(l => {
          const cur = l.id === s.layout;
          const c = h(`<button type="button" class="lay-card${cur ? ' on' : ''}"${cur ? ' aria-current="true"' : ''}>${thumbSvg(l.id)}<b></b><small></small></button>`);
          $('b', c).textContent = l.name;
          if (cur) $('b', c).appendChild(h('<span class="gal-cur">сейчас</span>'));
          $('small', c).textContent = l.desc || '';
          c.addEventListener('click', () => {
            sh.close();
            if (l.id === s.layout) return;
            convert(s, l.id);
            onPick(s);
            const noData = l.kind === 'chart' && !((s.chart || {}).series || []).some(x => (x.values || []).some(v => v !== null && v !== ''));
            if (noData) Chart.open(s, n => onPick(n));       // диаграмме нужны числа
            else toast(`Вид слайда: «${l.name}». Тексты перенесены — проверьте их.`);
          });
          $('.lay-grid', sec).appendChild(c);
        });
        groupsEl.appendChild(sec);
      });
      if (!groupsEl.children.length) groupsEl.appendChild(h('<p class="hint">Такого вида нет — попробуйте другое слово.</p>'));
    }
    $('input', body).addEventListener('input', e => draw(e.target.value.trim().toLowerCase()));
    draw('');
    requestAnimationFrame(() => { const c = $('.vp-group .lay-card.on', body); if (c && alts.length < 2) c.scrollIntoView({block: 'center'}); });
    return sh;
  }
  return {open};
})();
