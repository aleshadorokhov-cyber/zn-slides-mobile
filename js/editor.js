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

  function open(s) {
    const body = h('<div class="ed"></div>');
    const sh = openSheet({title: '', full: true, back: true, body, onClose: () => { cur = null; planChanged(); }});
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
    // инструменты
    const meta = META.includes(s.layout);
    const tools = h(`<div class="ed-tools">
      <button class="ed-tool" data-t="lay"><i>▦</i>Макет</button>
      <button class="ed-tool" data-t="pic" ${meta ? 'disabled style="opacity:.4"' : ''}><i>🖼</i>Картинки</button>
      <button class="ed-tool" data-t="chart" ${meta ? 'disabled style="opacity:.4"' : ''}><i>📊</i>Диаграмма</button>
      <button class="ed-tool" data-t="more"><i>⋯</i>Ещё</button></div>`);
    $$('button', tools).forEach(x => x.addEventListener('click', () => {
      const t = x.dataset.t;
      if (t === 'lay') pickLayout();
      if (t === 'pic') Pictures.openSlide(cur.s, n => replace(n));
      if (t === 'chart') Chart.open(cur.s, n => replace(n));
      if (t === 'more') moreMenu();
    }));
    b.appendChild(tools);
    // варианты
    if ((s.alts || []).length > 1) b.appendChild(altsEl(s));
    // поля
    b.appendChild(h(`<div class="sec-h">${esc(layoutName(s.layout))}</div>`));
    const d = (state.layouts[s.layout] || {}).desc;
    if (d) b.appendChild(h(`<p class="hint" style="margin:-4px 2px 10px">${esc(d)}</p>`));
    fields(s, b);
    // замечание
    if (!['title', 'end', 'section'].includes(s.layout)) b.appendChild(remarkEl(s));
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
        const card = h(`<div class="item"><div class="item-head"><span class="n">${i + 1}</span><span class="sp"></span>
          <button class="icon-btn" data-a="up" aria-label="Выше">↑</button><button class="icon-btn" data-a="down" aria-label="Ниже">↓</button>
          <button class="icon-btn" data-a="del" aria-label="Удалить">✕</button></div></div>`);
        const numeric = flds.filter(f => f[2] === 'numeric' || f[0] === 'unit');
        if (numeric.length >= 2) {
          const r = h('<div class="row2"></div>');
          numeric.forEach(f => r.appendChild(itemInput(it, f)));
          card.appendChild(r);
        }
        flds.filter(f => !(numeric.length >= 2 && numeric.includes(f))).forEach(f => card.appendChild(itemInput(it, f)));
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

  /* варианты: другие способы показать этот материал */
  function altsEl(s) {
    const box = h(`<div><div class="sec-h">Варианты оформления · ${s.alts.length}</div><div class="alts-row"></div></div>`);
    const row = $('.alts-row', box), curI = s.alt_index || 0;
    s.alts.forEach((a, i) => {
      const c = h(`<button type="button" class="alt-card${i === curI ? ' cur' : ''}"><div class="apic">${thumbSvg(a.layout, a)}</div><b></b><small>${i === curI ? '✓ выбран' : 'выбрать'}</small></button>`);
      $('b', c).textContent = a.alt_label || layoutName(a.layout);
      Thumbs.attach($('.apic', c), Object.assign({}, a, {title: s.title || a.title}));
      c.addEventListener('click', () => { if (i !== curI) { replace(chooseAlt(s, i)); toast(`Вариант «${a.alt_label || layoutName(a.layout)}»`); } });
      row.appendChild(c);
    });
    Thumbs.schedule(100);
    return box;
  }

  /* выбор макета */
  function pickLayout() {
    const s = cur.s;
    const body = h('<div><div class="search"><input placeholder="Найти макет: процесс, SWOT, карта…" type="search"></div><div class="lay-grid" style="margin-top:12px"></div></div>');
    const grid = $('.lay-grid', body);
    const sh = openSheet({title: 'Макет слайда', full: true, back: true, body});
    function draw(q) {
      grid.innerHTML = '';
      state.layoutList.filter(l => !q || (l.name + ' ' + l.desc).toLowerCase().includes(q)).forEach(l => {
        const c = h(`<button type="button" class="lay-card${l.id === s.layout ? ' on' : ''}">${thumbSvg(l.id)}<b></b><small></small></button>`);
        $('b', c).textContent = l.name; $('small', c).textContent = l.desc;
        c.addEventListener('click', () => {
          if (l.id !== s.layout) { convert(s, l.id); toast(`Макет: ${l.name}`); }
          sh.close(); draw0();
          if (l.kind === 'chart' && !((s.chart || {}).series || []).some(x => (x.values || []).some(v => v !== null && v !== ''))) Chart.open(s, n => replace(n));
        });
        grid.appendChild(c);
      });
    }
    $('input', body).addEventListener('input', e => draw(e.target.value.trim().toLowerCase()));
    draw('');
  }
  function draw0() { if (cur) { draw(); changed(); } }

  function moreMenu() {
    const s = cur.s, arr = state.spec.slides;
    const body = h('<div class="menu-group" style="margin:0"></div>');
    const items = [['up', '↑', 'Выше'], ['down', '↓', 'Ниже'], ['dup', '⧉', 'Дублировать'], ['view', '👁', 'Смотреть крупно'], ['del', '🗑', 'Удалить слайд']];
    const sh = openSheet({title: 'Слайд', body});
    items.forEach(([a, ic, t]) => {
      const b = h(`<button class="menu-item" type="button"><i>${ic}</i><span><b>${esc(t)}</b></span></button>`);
      b.addEventListener('click', async () => {
        const k = arr.indexOf(s);
        sh.close();
        if (a === 'up' && k > 0) { [arr[k - 1], arr[k]] = [arr[k], arr[k - 1]]; draw(); }
        if (a === 'down' && k < arr.length - 1) { [arr[k + 1], arr[k]] = [arr[k], arr[k + 1]]; draw(); }
        if (a === 'dup') { const c = clone(s); arr.splice(k + 1, 0, c); cur.s = c; draw(); toast('Копия слайда добавлена'); }
        if (a === 'view') LB.open(k);
        if (a === 'del' && await confirmSheet('Удалить этот слайд?', 'Удалить', true)) { arr.splice(k, 1); cur.sh.close(); toast('Слайд удалён'); }
      });
      body.appendChild(b);
    });
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
