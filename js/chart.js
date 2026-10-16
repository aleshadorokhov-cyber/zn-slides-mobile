/* chart.js — диаграмма слайда (вид, данные, единицы, выводы, загрузка из файла) и таблица слайда. */
'use strict';
const cellStr = v => (v === null || v === undefined) ? '' : String(v).replace('.', ',');
function firstNum(t) {
  const m = String(t ?? '').match(/[−–-]?\d[\d\s ]*(?:[.,]\d+)?/);
  return m ? num(m[0]) : null;
}

/* таблица-сетка: шапка + строки, удаление строк и столбцов, вставка диапазона из Excel */
function gridEditor(g, {corner = 'Подписи', colPh = j => `Ряд ${j + 1}`, rowPh = i => `Подпись ${i + 1}`, numeric = true, onChange}) {
  // g = {head, names[], cats[], vals[][]}
  const wrap = h('<div><div class="grid-wrap"><table class="grid-tbl"></table></div><div class="row2" style="margin-top:8px"><button class="btn ghost small" type="button" data-a="row">＋ Строка</button><button class="btn ghost small" type="button" data-a="col">＋ Столбец</button></div></div>');
  const tbl = $('table', wrap);
  function set(r, c, v) {
    while (c >= g.names.length) { g.names.push(''); g.vals.forEach(row => row.push('')); }
    while (r >= g.cats.length) { g.cats.push(''); g.vals.push(g.names.map(() => '')); }
    if (r < 0 && c < 0) g.head = v; else if (r < 0) g.names[c] = v; else if (c < 0) g.cats[r] = v; else g.vals[r][c] = v;
  }
  function bad(v) { return numeric && String(v ?? '').trim() && num(v) === null; }
  function draw() {
    let t = `<thead><tr><th><input data-r="-1" data-c="-1" placeholder="${esc(corner)}"></th>` +
      g.names.map((n, j) => `<th><input data-r="-1" data-c="${j}" placeholder="${esc(colPh(j))}"></th>`).join('') + '<th class="x"></th></tr>' +
      `<tr><td class="x"></td>${g.names.map((_, j) => `<td class="x"><button type="button" data-dc="${j}" aria-label="Удалить столбец">✕</button></td>`).join('')}<td class="x"></td></tr></thead><tbody>`;
    g.cats.forEach((c, i) => {
      t += `<tr><th><input data-r="${i}" data-c="-1" placeholder="${esc(rowPh(i))}"></th>` +
        g.names.map((_, j) => `<td><input data-r="${i}" data-c="${j}"${numeric ? ' inputmode="decimal"' : ''}></td>`).join('') +
        `<td class="x"><button type="button" data-dr="${i}" aria-label="Удалить строку">✕</button></td></tr>`;
    });
    tbl.innerHTML = t + '</tbody>';
    $$('input', tbl).forEach(el => {
      const r = +el.dataset.r, c = +el.dataset.c;
      el.value = r < 0 && c < 0 ? g.head : (r < 0 ? g.names[c] : (c < 0 ? g.cats[r] : (g.vals[r][c] ?? '')));
      if (r >= 0 && c >= 0) el.classList.toggle('bad', !!bad(el.value));
      el.addEventListener('input', () => { set(r, c, el.value); if (r >= 0 && c >= 0) el.classList.toggle('bad', !!bad(el.value)); onChange(); });
      el.addEventListener('paste', e => {
        const txt = (e.clipboardData || window.clipboardData).getData('text') || '';
        if (!/[\t\n;]/.test(txt.trim())) return;
        e.preventDefault();
        const lines = txt.replace(/\r/g, '').split('\n');
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
        const sep = txt.includes('\t') ? '\t' : ';';
        lines.forEach((l, i) => l.split(sep).forEach((v, j) => set(r + i, c + j, v.trim())));
        draw(); onChange();
        toast(`Вставлено строк: ${lines.length}`);
      });
    });
    $$('[data-dc]', tbl).forEach(b => b.addEventListener('click', () => {
      const j = +b.dataset.dc; g.names.splice(j, 1); g.vals.forEach(r => r.splice(j, 1));
      if (!g.names.length) { g.names = ['']; g.vals.forEach(r => r.push('')); }
      draw(); onChange();
    }));
    $$('[data-dr]', tbl).forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.dr; g.cats.splice(i, 1); g.vals.splice(i, 1);
      if (!g.cats.length) { g.cats = ['']; g.vals = [g.names.map(() => '')]; }
      draw(); onChange();
    }));
  }
  $('[data-a=row]', wrap).addEventListener('click', () => {
    g.cats.push(''); g.vals.push(g.names.map(() => '')); draw(); onChange();
    $(`input[data-r="${g.cats.length - 1}"][data-c="-1"]`, tbl)?.focus();
  });
  $('[data-a=col]', wrap).addEventListener('click', () => {
    g.names.push(''); g.vals.forEach(r => r.push('')); draw(); onChange();
    $(`input[data-r="-1"][data-c="${g.names.length - 1}"]`, tbl)?.focus();
  });
  draw();
  wrap.redraw = draw;
  return wrap;
}

/* таблица слайда: первая колонка — как обычная, текст во всех ячейках */
const Grid = {
  table(s, changed) {
    const cols = (s.columns && s.columns.length) ? s.columns.map(String) : ['Пункт', 'Описание'];
    const g = {head: cols[0], names: cols.slice(1), cats: (s.rows || []).map(r => String(r[0] ?? '')),
      vals: (s.rows || []).map(r => cols.slice(1).map((_, j) => String(r[j + 1] ?? '')))};
    if (!g.cats.length) { g.cats = ['', '']; g.vals = [g.names.map(() => ''), g.names.map(() => '')]; }
    const save = () => {
      s.columns = [g.head].concat(g.names);
      s.rows = g.cats.map((c, i) => [c].concat(g.vals[i] || [])).filter(r => r.some(x => String(x ?? '').trim()));
      changed();
    };
    const box = gridEditor(g, {corner: 'Столбец 1', colPh: j => `Столбец ${j + 2}`, rowPh: i => `Строка ${i + 1}`, numeric: false, onChange: save});
    box.appendChild(h('<p class="hint">Первая строка — заголовки столбцов. Можно вставить диапазон, скопированный из Excel: нажмите в ячейку и «Вставить».</p>'));
    return box;
  },
};

/* окно «Диаграмма» */
const Chart = (() => {
  let st = null;                 // {s, onDone, grid, type, unit, unit2, ins, tables, hint, sh, ...}

  function gridFrom(s) {
    const blank = {head: 'Категория', names: ['Ряд 1'], cats: ['', '', ''], vals: [[''], [''], ['']]};
    let g = blank, type = 'column', unit = '', unit2 = '', ins = [];
    if (s.layout === 'chart' && s.chart) {
      const c = s.chart;
      type = c.type || 'column'; unit = c.unit || ''; unit2 = c.unit2 || ''; ins = s.insights || [];
      if ((c.series || []).length) g = {head: 'Категория', names: c.series.map(x => x.name || ''), cats: (c.categories || []).map(String),
        vals: (c.categories || []).map((_, i) => c.series.map(x => cellStr((x.values || [])[i])))};
      else if ((c.categories || []).length) g = {head: 'Категория', names: ['Значение'], cats: c.categories.map(String), vals: c.categories.map(() => [''])};
    } else if (kindOf(s.layout) === 'table' && (s.columns || []).length >= 2) {
      g = {head: String(s.columns[0] || 'Категория'), names: s.columns.slice(1).map(String), cats: (s.rows || []).map(r => String(r[0] ?? '')),
        vals: (s.rows || []).map(r => s.columns.slice(1).map((_, j) => String(r[j + 1] ?? '')))};
    } else {
      const items = asItems(s).filter(it => it.title || it.text);
      if (items.length) {
        const vals = items.map(it => firstNum(it.value !== undefined && it.value !== '' ? it.value : (it.text || it.title)));
        const units = [...new Set((s.items || []).map(it => (it && it.unit || '').trim()).filter(Boolean))];
        if (units.length === 1) unit = units[0];
        g = {head: 'Категория', names: ['Значение'], cats: items.map(it => String(it.title || it.text).slice(0, 60)), vals: vals.map(v => [cellStr(v)])};
      }
    }
    if (!g.names.length) { g.names = ['Ряд 1']; g.vals = g.cats.map(() => ['']); }
    if (!g.cats.length) { g.cats = ['', '', '']; g.vals = g.cats.map(() => g.names.map(() => '')); }
    return {grid: g, type: chartKnown(type) ? type : 'column', unit, unit2, ins: ins.join('\n')};
  }

  function toChart(quiet) {
    const g = st.grid;
    const rows = g.cats.map((c, i) => ({c: String(c).trim(), v: g.vals[i] || []})).filter(r => r.c || r.v.some(x => String(x ?? '').trim()));
    let series = g.names.map((n, j) => ({name: String(n).trim() || `Ряд ${j + 1}`, values: rows.map(r => num(r.v[j]))}));
    const empty = series.filter(x => x.values.every(v => v === null)).map(x => x.name);
    series = series.filter(x => x.values.some(v => v !== null));
    const bad = rows.reduce((k, r) => k + r.v.filter(x => String(x ?? '').trim() && num(x) === null).length, 0);
    if (!quiet && ['pie', 'doughnut'].includes(st.type) && series.length > 1) series = series.slice(0, 1);
    const chart = {type: st.type, unit: st.unit.trim(), categories: rows.map((r, i) => r.c || String(i + 1)), series};
    if (st.type === 'combo') chart.unit2 = st.unit2.trim();
    return {chart, empty, bad};
  }
  const insLines = () => st.ins.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 4);
  function note() {
    const t = st.type, {chart} = toChart(true), n = chart.series.length, nc = chart.categories.length;
    const info = chartInfo(t);
    if (info && !info.base) {                     // виды 1.7 — подсказки как в Windows-версии
      const ser = k => `${k} ${k === 1 ? 'ряд' : k < 5 ? 'ряда' : 'рядов'}`;
      const how = info.how === 'image' ? ' Это картинка: в PowerPoint её не поправить, данные — в заметках докладчика.'
        : info.how === 'shapes' ? ' Собрана из фигур PowerPoint: подписи и цвета правятся в PowerPoint.' : '';
      if (info.ok === false) return `Вид «${info.name}» на телефоне не рисуется — в презентации будет обычная диаграмма.`;
      if (n && n < info.min) return `Для вида «${info.name}» нужно хотя бы ${ser(info.min)} — сейчас ${n}. Иначе будет обычная диаграмма.`;
      if (info.xy && chart.categories.some(c => num(c) === null)) return `${info.hint} Подписи (первый столбец) должны быть числами — это ось X.`;
      if (n > info.max) return `${info.hint} На диаграмму попадут первые ${ser(info.max)} из ${n}.${how}`;
      return info.hint + how;
    }
    if (['stacked', 'stacked100', 'bar_stacked', 'combo'].includes(t) && n < 2) return 'Для этого вида нужно хотя бы два ряда — с одним рядом будет обычная гистограмма.';
    if (['pie', 'doughnut'].includes(t) && n > 1) return `Круговая показывает один ряд — будет взят первый («${chart.series[0].name}»).`;
    if (t === 'radar' && nc < 3) return 'Лепестковой нужно хотя бы 3 подписи (оси).';
    if (t === 'radar' && n > 4) return 'Лепестковая — не больше 4 рядов, иначе будет линейчатая.';
    if (n > 6) return `${CHART_HELP[t]} На диаграмме — первые 6 рядов из ${n}.`;
    return CHART_HELP[t] || '';
  }
  function validate() {
    const {chart, empty, bad} = toChart(true);
    const msg = [];
    if (!chart.series.length) msg.push('Нет чисел: впишите значения, вставьте диапазон из Excel или загрузите файл.');
    if (bad) msg.push(`Не числа в ${bad} ячейк${bad === 1 ? 'е' : 'ах'} (подсвечены) — на диаграмму они не попадут.`);
    if (empty.length && chart.series.length) msg.push(`Ряды без чисел пропускаются: ${empty.join(', ')}.`);
    if (st.hint) msg.push(st.hint);
    st.warn.textContent = msg.join(' ');
    st.note.textContent = note();
  }
  function changed(ms = 900) {
    validate();
    clearTimeout(st.timer);
    st.timer = setTimeout(preview, ms);
  }
  async function preview() {
    if (!st || st.sh.closed) return;
    const box = st.pv, {chart} = toChart();
    const icon = chartIcon(st.type);
    if (!chart.series.length || !SlidesView.available()) {
      box.innerHTML = `<div class="ch-empty">${icon}<span>${chart.series.length ? esc(note()) : 'Заполните данные — здесь появится слайд с диаграммой.'}</span></div>`;
      return;
    }
    const my = ++st.req, s = st.s;
    const slide = {layout: 'chart', title: s.title || 'Диаграмма', subtitle: s.subtitle || '', chart, insights: insLines()};
    box.querySelector('.stale') || box.appendChild(h('<span class="stale">обновляю…</span>'));
    try {
      const [u] = await SlidesView.images([slide], state.spec.meta, {width: 960, numbers: [Math.max(1, state.spec.slides.indexOf(s) + 1)]});
      if (my !== st.req || !u) return;
      box.querySelector('.ch-empty')?.remove();
      SlidesView.put(box, u);
      box.querySelector('.stale')?.remove();
    } catch (e) { if (my === st.req) box.innerHTML = `<div class="ch-empty">${icon}<span>${esc(e.message)}</span></div>`; }
  }

  function open(s, onDone) {
    const f = gridFrom(s);
    st = Object.assign(f, {s, onDone, tables: [], hint: '', timer: null, req: 0});
    const body = h('<div></div>');
    const apply = h('<button class="btn primary" type="button">Готово</button>');
    st.sh = openSheet({title: 'Диаграмма', sub: s.title || '', full: true, back: true, body, foot: apply, onClose: () => { clearTimeout(st && st.timer); }});
    st.pv = h('<div class="ed-preview"></div>');
    body.appendChild(st.pv);

    body.appendChild(h('<div class="sec-h">Вид диаграммы</div>'));
    const types = h('<div class="ch-types"></div>');
    body.appendChild(types);
    st.note = h('<p class="hint"></p>');
    body.appendChild(st.note);
    let all = !CHART_KINDS.some(k => k[0] === st.type);
    const drawTypes = () => {
      const btn = (id, name, svg) => `<button type="button" class="ch-type${id === st.type ? ' on' : ''}" data-t="${id}">${svg}<span>${esc(name)}</span></button>`;
      let html = CHART_KINDS.map(([id, name, svg]) => btn(id, name, svg)).join('');
      const ext = (CHART_CAT || []).filter(k => !k.base && k.ok !== false);
      if (ext.length) {
        html += `<button type="button" class="ch-more" aria-expanded="${all}">${all ? '▴ Свернуть' : `▾ Все виды: ещё ${ext.length}`}</button>`;
        if (all) [...new Set(ext.map(k => k.family))].forEach(f => {
          html += `<div class="ch-fam">${esc(f)}</div>` + ext.filter(k => k.family === f).map(k => btn(k.id, k.name, chartIcon(k.id))).join('');
        });
      }
      types.innerHTML = html;
      $$('.ch-type', types).forEach(b => b.addEventListener('click', () => { st.type = b.dataset.t; drawTypes(); u2.classList.toggle('hidden', st.type !== 'combo'); changed(200); }));
      const more = $('.ch-more', types);
      if (more) more.addEventListener('click', () => { all = !all; drawTypes(); });
    };
    loadChartTypes().then(() => { if (!st.sh.closed) drawTypes(); });

    body.appendChild(h('<div class="sec-h">Данные</div>'));
    const fileRow = h(`<div class="row2"><label class="btn ghost small" style="position:relative">📄 Из файла<input type="file" accept=".xlsx,.xlsm,.csv,.json,.txt,.docx,.pdf,.pptx" style="position:absolute;inset:0;opacity:0"></label>
      <button class="btn ghost small" type="button" data-a="swap">⇄ Строки ↔ ряды</button></div>`);
    body.appendChild(fileRow);
    const tables = h('<label class="fld hidden"><span>Таблица из файла</span><select></select></label>');
    body.appendChild(tables);
    let grid = gridEditor(st.grid, {onChange: () => changed()});
    body.appendChild(grid);
    body.appendChild(h('<p class="hint">Первая колонка — подписи (годы, объекты), дальше — ряды чисел. Диапазон из Excel можно вставить в любую ячейку.</p>'));
    st.warn = h('<p class="warn-txt"></p>');
    body.appendChild(st.warn);

    const units = h('<div class="row2"></div>');
    units.appendChild(field('Единица', st, 'unit', {placeholder: 'тыс. т, %, млн руб.', onChange: () => changed()}));
    const u2 = field('Единица линии (правая ось)', st, 'unit2', {placeholder: '%', onChange: () => changed()});
    u2.classList.toggle('hidden', st.type !== 'combo');
    units.appendChild(u2);
    body.appendChild(units);

    body.appendChild(h('<div class="sec-h">Выводы справа</div>'));
    body.appendChild(field('По одному в строке, до четырёх', st, 'ins', {area: true, rows: 4, onChange: () => changed()}));
    const calc = h('<button class="btn ghost small" type="button">✨ Посчитать выводы по данным</button>');
    body.appendChild(calc);
    body.appendChild(h('<div style="height:20px"></div>'));

    const regrid = () => { const n = gridEditor(st.grid, {onChange: () => changed()}); grid.replaceWith(n); grid = n; changed(150); };
    $('input[type=file]', fileRow).addEventListener('change', async e => {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      const fd = new FormData(); fd.append('file', file, file.name);
      Busy.on(`Читаю «${file.name}»…`);
      try {
        const d = await apiJSON('POST', '/api/chart_data', fd);
        st.tables = d.tables || [];
        const sel = $('select', tables);
        sel.innerHTML = st.tables.map((t, i) => `<option value="${i}">${esc(t.name || 'Таблица ' + (i + 1))} · ${t.categories.length} × ${t.series.length}</option>`).join('');
        tables.classList.toggle('hidden', st.tables.length < 2);
        useTable(0);
        toast(`Данные из «${d.file}»` + (st.tables.length > 1 ? `: таблиц ${st.tables.length} — нужную выберите в списке` : ''), false, 6000);
      } catch (err) { toast(err.message, true, 8000); } finally { Busy.off(); }
    });
    $('select', tables).addEventListener('change', e => useTable(+e.target.value));
    function useTable(i) {
      const t = st.tables[i];
      if (!t) return;
      st.grid = {head: 'Категория', names: t.series.map(x => x.name), cats: t.categories.map(String), vals: t.categories.map((_, r) => t.series.map(x => cellStr(x.values[r])))};
      st.type = t.type || st.type; st.hint = t.hint || '';
      st.unit = t.unit || ''; st.unit2 = t.unit2 || '';
      $('input', units.children[0]).value = st.unit; $('input', u2).value = st.unit2;
      drawTypes(); u2.classList.toggle('hidden', st.type !== 'combo');
      regrid();
    }
    $('[data-a=swap]', fileRow).addEventListener('click', () => {
      const g = st.grid;
      st.grid = {head: g.head, names: g.cats.slice(), cats: g.names.slice(), vals: g.names.map((_, j) => g.cats.map((_, i) => g.vals[i][j] ?? ''))};
      regrid();
    });
    calc.addEventListener('click', async () => {
      const {chart} = toChart();
      if (!chart.series.length) { toast('Для выводов нужны числа в данных.', true); return; }
      try {
        const d = await apiJSON('POST', '/api/chart_insights', {chart});
        if ((d.insights || []).length) { st.ins = d.insights.join('\n'); $('textarea', calc.previousElementSibling).value = st.ins; changed(100); }
        else toast('По этим данным выводов не нашлось — напишите их сами или оставьте поле пустым.', true, 6000);
      } catch (err) { toast(err.message, true); }
    });
    apply.addEventListener('click', () => {
      const {chart} = toChart();
      if (!chart.series.length || !chart.categories.length) { validate(); toast('Впишите хотя бы одно число.', true); return; }
      const s = st.s, ins = insLines(), done = st.onDone;
      st.sh.close();
      if (s.layout === 'chart') {
        s.chart = chart; s.insights = ins;
        const a = (s.alts || [])[s.alt_index || 0];
        if (a && a.layout === 'chart') { a.chart = clone(chart); a.insights = ins.slice(); }
        done(s);
        toast('Диаграмма обновлена');
        return;
      }
      // слайд другого вида: диаграмма становится новым вариантом, прежний вид остаётся в «Вариантах»
      const alt = {layout: 'chart', title: s.title || '', subtitle: s.subtitle || '', section: s.section || '', notes: s.notes || '',
        chart, insights: ins, alt_label: 'Диаграмма (свои данные)', user_chart: true};
      const base = clone(s); delete base.alts;
      const alts = (s.alts && s.alts.length) ? s.alts.slice() : [Object.assign(base, {alt_label: base.alt_label || 'Текущий'})];
      const k = alts.findIndex((x, i) => i > 0 && x.user_chart);
      if (k >= 0) alts[k] = alt;
      else {
        if (alts.length >= 5) alts.splice(alts.length - 1 === (s.alt_index || 0) ? alts.length - 2 : alts.length - 1, 1);
        alts.push(alt);
      }
      s.alts = alts.slice(0, 5);
      done(chooseAlt(s, s.alts.indexOf(alt)));
      toast('Диаграмма добавлена вариантом слайда — прежний вид остался в «Вариантах»', false, 6000);
    });
    drawTypes();
    changed(60);
  }
  return {open};
})();
