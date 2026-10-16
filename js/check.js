/* check.js — проверка презентации (1.7, как окно «✔ Проверить» Windows-версии): замечания рецензента, сверка чисел
   с материалами, текст (словарь Компании, правописание, типографика), готовый файл и сравнение с эталонами.
   Здесь же «📖 Словарь Компании» и «👥 Версии для разных слушателей». */
'use strict';
const Check = (() => {
  const TABS = [['review', '💬 Замечания'], ['facts', '🔢 Числа'], ['text', '✍ Текст'], ['file', '🖼 Готовый файл'], ['etalons', '⭐ Эталоны']];
  const ABOUT = {
    review: 'Рецензент читает план, как его прочтёт руководитель: есть ли у слайда с данными вывод, не перегружен ли он текстом, нет ли повторов и расхождений в числах, есть ли в конце выводы. Большинство замечаний исправляется одной кнопкой; новых чисел исправления не добавляют.',
    facts: 'У каждого числа на слайдах конструктор ищет место в материалах доклада. ✓ — число есть в материалах, ≈ — округлено, ƒ — посчитано из чисел материалов, 📚 — есть только в библиотеке материалов, ✗ — в материалах нет. Годы, даты и номера не сверяются.',
    text: 'Названия обществ, месторождений и должностей — как в словаре Компании; частые ошибки («в течении года»), сокращения, кавычки «ёлочки», тире и неразрывные пробелы. При сборке всё это исправляется само; здесь видно, что именно, и любую правку можно оставить как есть.',
    file: 'Конструктор собирает презентацию и проверяет каждый слайд: не вылез ли текст за рамку или край слайда, не наезжают ли надписи друг на друга, не слишком ли мелкий шрифт.',
    etalons: 'Эталоны — ваши лучшие презентации PowerPoint из «📚 Библиотеки материалов», отмеченные ⭐. План сравнивается с ними: число слайдов, объём текста, диаграммы, заголовки-выводы, порядок, а каждый слайд — с похожим слайдом эталона.',
  };
  const OK = {review: 'Замечаний нет.', etalons: 'План сделан так же, как эталоны: рекомендаций нет.',
    file: 'Готовый файл в порядке: текст в рамках и в пределах слайдов, надписи не наезжают друг на друга, шрифт читаемый.'};
  const WAIT = {review: 'Проверяю план…', etalons: 'Сравниваю с эталонами…', file: 'Собираю презентацию и проверяю каждый слайд…', facts: 'Сверяю числа…', text: 'Проверяю текст…'};
  const IC = {warn: '⚠', tip: '💡'};
  const FACT_IC = {ok: '✓', rounded: '≈', derived: 'ƒ', library: '📚', missing: '✗'};
  const FACT_NAME = {ok: 'найдено в материалах', rounded: 'округлено', derived: 'посчитано из материалов', library: 'есть только в библиотеке материалов', missing: 'нет в материалах'};
  const C = {tab: 'review', res: {}, snap: {}, done: new Set(), busy: false, ai: false, onlyBad: true, focus: -1,
    sh: null, pane: null, tabs: null, bad: new WeakMap(), facts: new WeakMap(), t: 0, autoBusy: false};

  const aiReady = () => !!(state.status && state.status.llm && state.status.llm.model);
  const slides = () => (state.spec ? state.spec.slides : []);
  const sig = s => JSON.stringify(s);
  const takeSnap = () => slides().map(s => [s, sig(s)]);
  function snapOk(tab) {
    const a = C.snap[tab], b = slides();
    return !!a && a.length === b.length && a.every(([s, j], i) => s === b[i] && j === sig(b[i]));
  }
  function resnap(tab) { if (C.snap[tab]) C.snap[tab] = takeSnap(); }

  /* ---------------------------------------------------------------- окно */
  function open(tab, focus) {
    if (!state.spec || !state.spec.slides.length) { toast('Сначала постройте или откройте план.', true); return; }
    C.focus = typeof focus === 'number' ? focus : -1;
    if (C.sh && !C.sh.closed) { show(tab || C.tab); return; }
    const body = h('<div class="chk"><div class="tabs-row chk-tabs"></div><div class="chk-pane"></div></div>');
    C.tabs = $('.chk-tabs', body); C.pane = $('.chk-pane', body);
    TABS.forEach(([id, name]) => {
      const b = h(`<button type="button" data-t="${id}">${name} <span class="chk-n"></span></button>`);
      b.addEventListener('click', () => show(id));
      C.tabs.appendChild(b);
    });
    const again = h('<button class="btn ghost" type="button">Перепроверить</button>');
    const done = h('<button class="btn primary" type="button">Готово</button>');
    again.addEventListener('click', () => run(C.tab));
    C.sh = openSheet({title: 'Проверка презентации', full: true, back: true, body, foot: [again, done], onClose: () => { C.sh = null; }});
    done.addEventListener('click', () => C.sh && C.sh.close());
    show(tab || C.tab);
  }
  function show(tab) {
    C.tab = tab;
    $$('button', C.tabs).forEach(b => b.classList.toggle('on', b.dataset.t === tab));
    $(`button[data-t="${tab}"]`, C.tabs)?.scrollIntoView({inline: 'nearest', block: 'nearest'});
    if (!C.res[tab] || !snapOk(tab)) run(tab); else render(tab);
  }
  function counts() {
    if (!C.tabs) return;
    const n = tab => {
      const r = C.res[tab];
      if (!r || r.error) return '';
      if (tab === 'facts') return (r.counts.missing || 0) + (r.counts.library || 0) || '✓';
      if (tab === 'text') return r.findings.filter(f => f.kind !== 'типографика').length || '✓';
      const left = [...r.deck, ...r.slides.flatMap(sl => sl.items)].filter(f => !C.done.has(tab + '|' + f.id)).length;
      return left || '✓';
    };
    $$('button', C.tabs).forEach(b => { $('.chk-n', b).textContent = n(b.dataset.t); });
  }
  const live = () => C.sh && !C.sh.closed;

  /* ---------------------------------------------------------------- запуск проверки */
  async function run(tab) {
    if (!state.spec || C.busy) return;
    if (live() && C.tab === tab) C.pane.innerHTML = `<p class="hint">${esc(ABOUT[tab])}</p><div class="chk-wait"><span class="spinner"></span>${WAIT[tab]}</div>`;
    C.busy = true;
    const snap = takeSnap();
    let r;
    try {
      if (tab === 'facts') r = await verify();
      else if (tab === 'text') r = await apiJSON('POST', '/api/text/check', {spec: state.spec});
      else if (tab === 'file') r = await apiJSON('POST', '/api/deckcheck', {spec: state.spec});
      else if (aiReady() && C.ai) {
        const l = state.status.llm;
        Busy.on(l.cloud ? `Облачная модель ${l.provider_name} читает план…` : 'Модель ИИ читает план…', {cancel: cancelEngine});
        try { r = await runJob('/api/review', {spec: state.spec, what: tab, use_ai: true}, 'Проверка'); } finally { Busy.off(); }
      } else r = await apiJSON('POST', '/api/review?wait=1', {spec: state.spec, what: tab, use_ai: false});
      (r.warnings || []).forEach(w => toast(w, true, 8000));
      if (tab === 'review') setBad(r, snap.map(x => x[0]));
    } catch (e) { r = {error: e.message}; }
    finally { C.busy = false; }
    C.res[tab] = r;
    C.snap[tab] = snap;
    C.done = new Set([...C.done].filter(id => !id.startsWith(tab + '|')));
    if (live() && C.tab === tab) render(tab);
    counts();
  }
  async function verify() {
    const r = await Engine.post('/api/verify', {spec: state.spec});
    const d = r.json();
    if (!r.ok) return {error: d.error || 'Сверка не удалась.'};
    setFacts(d);
    return d;
  }

  /* ---------------------------------------------------------------- показ */
  function render(tab) {
    if (!live()) return;
    const r = C.res[tab], box = C.pane;
    box.innerHTML = '';
    box.appendChild(h(`<details class="chk-about"><summary>Что проверяется</summary><p class="hint">${esc(ABOUT[tab])}</p></details>`));
    if (tab === 'review' && aiReady()) {
      const l = state.status.llm;
      const sw = h(`<label class="sw"><input type="checkbox"><span>Ещё и замечания по смыслу ${l.cloud ? 'от облачной модели ☁' : 'от модели ИИ'}</span></label>`);
      $('input', sw).checked = C.ai;
      $('input', sw).addEventListener('change', e => { C.ai = e.target.checked; if (C.ai) run('review'); });
      box.appendChild(sw);
    }
    if (tab === 'etalons') box.appendChild(refsEl());
    if (!r) return;
    if (r.error) {
      box.appendChild(h(`<p class="warn-txt">${esc(r.error)}</p>`));
      if (tab === 'facts') box.appendChild(h('<p class="hint">Числа сверяются с материалами, по которым построен план. Для плана из файла или старого плана постройте план заново по материалам.</p>'));
      return;
    }
    if (tab === 'facts') return renderFacts(r, box);
    if (tab === 'text') return renderText(r, box);
    const stale = !snapOk(tab);
    if (stale) box.appendChild(h('<p class="warn-txt">План изменился после проверки — нажмите «Перепроверить».</p>'));
    if (r.etalons) box.appendChild(h(`<p class="hint">Сравнение с эталонами: ${r.etalons.decks.map(d => '«' + esc(d.name.replace(/\.pptx$/i, '')) + '»').join(', ')} · похожих слайдов: ${r.etalons.matched}${r.etalons.semantic ? ' (по смыслу)' : ' (по словам)'}</p>`));
    // на телефоне готовый файл проверяется по самому файлу; картинки слайдов с обведёнными местами — в Windows-версии
    (r.notes || []).filter(x => !/LibreOffice|PowerPoint/.test(x)).forEach(x => box.appendChild(h(`<p class="hint">${esc(x)}</p>`)));
    if (tab === 'file') box.appendChild(h('<p class="hint">На телефоне проверяется сам файл: размеры текста, рамок и слайда. Картинки слайдов с обведёнными местами показывает Windows-версия.</p>'));
    const c = r.counts || {};
    if (r.deck.length || r.slides.length) box.appendChild(h(`<div class="chk-sum">${[c.warn ? `<span class="bad">⚠ важных: <b>${c.warn}</b></span>` : '', c.tip ? `<span>💡 советов: <b>${c.tip}</b></span>` : ''].filter(Boolean).join(' · ')}</div>`));
    if (r.deck.length) box.appendChild(group('Вся презентация', '', -1, r.deck.map((f, k) => itemEl(tab, f, -1, k, stale))));
    r.slides.forEach(sl => box.appendChild(group(`Слайд ${sl.i + 1}`, sl.title, sl.i, sl.items.map((f, k) => itemEl(tab, f, sl.i, k, stale)))));
    if (!r.deck.length && !r.slides.length) box.appendChild(h(`<div class="chk-ok">✓ ${OK[tab] || 'Замечаний нет.'}</div>`));
    if (r.mode === 'ai' && r.model) box.appendChild(h(`<p class="hint">Замечания по смыслу — модель ${esc(r.model.llm_model)}${r.model.llm_cloud ? ` (облачная, ${esc(r.model.llm_provider_name)}: план отправлен во внешний сервис)` : ''}.</p>`));
    focusEl(box);
  }
  function group(head, title, i, items) {
    const g = h(`<div class="chk-group${i >= 0 && i === C.focus ? ' focus' : ''}"><div class="chk-gh"><b></b><span></span></div></div>`);
    $('b', g).textContent = head; $('span', g).textContent = title || '';
    if (i >= 0) {
      const go = h('<button class="btn ghost small" type="button">Открыть слайд</button>');
      go.addEventListener('click', () => openSlide(i));
      $('.chk-gh', g).appendChild(go);
    }
    items.forEach(x => g.appendChild(x));
    return g;
  }
  function focusEl(box) { const f = box.querySelector('.chk-group.focus'); if (f) requestAnimationFrame(() => f.scrollIntoView({block: 'start'})); }
  function itemEl(tab, f, i, k, stale) {
    const done = C.done.has(tab + '|' + f.id), fx = f.fix;
    const el = h(`<div class="chk-item lvl-${esc(f.level)}${done ? ' done' : ''}"><span class="ic">${done ? '✓' : IC[f.level] || '•'}</span>
      <div class="tx"><div></div><small></small></div></div>`);
    $('.tx div', el).textContent = f.text;
    $('.tx small', el).textContent = [f.src, f.ref].filter(Boolean).join(' · ');
    if (done) $('.tx', el).appendChild(h('<small class="ok">исправлено</small>'));
    else if (fx) {
      const b = h('<button class="btn ghost small" type="button"></button>');
      b.textContent = fx.label;
      if (stale && fx.action !== 'tab') b.disabled = true;
      b.addEventListener('click', () => applyFix(tab, i, k));
      $('.tx', el).appendChild(b);
    }
    return el;
  }
  // «Открыть слайд»: редактор поверх проверки; после правки — проверка заново
  function openSlide(i) {
    const s = slides()[i];
    if (!s) return;
    Editor.open(s, () => { if (live()) run(C.tab); });
  }

  /* ---------------------------------------------------------------- исправления одной кнопкой (как в Windows-версии) */
  async function applyFix(tab, i, k) {
    const r = C.res[tab];
    const f = r && (i < 0 ? r.deck[k] : ((r.slides.find(x => x.i === i) || {}).items || [])[k]);
    if (!f || !f.fix) return;
    const fx = f.fix, arr = state.spec.slides;
    if (fx.action === 'tab') { show(fx.tab); return; }
    if (!snapOk(tab)) { toast('План изменился после проверки — нажмите «Перепроверить».', true, 6000); render(tab); return; }
    const put = (j, n) => { const old = arr[j]; n = clone(n); if (old && old.notes && !n.notes) n.notes = old.notes; arr[j] = n; };
    let again = false;
    if (fx.remark) {
      const s = arr[i];
      Busy.on('Модель ИИ исправляет слайд…', {cancel: cancelEngine});
      try {
        const spec = {meta: state.spec.meta, slides: arr.map(x => { const c = Object.assign({}, x); delete c.alts; return c; })};
        const res = await apiJSON('POST', '/api/revise', {slide: clone(s), remark: fx.remark, use_ai: true, spec});
        if (!res.done) { toast('Модель не исправила слайд' + ((res.warnings || []).length ? `: ${res.warnings[0]}` : '.'), true, 8000); return; }
        put(i, res.slide);
      } catch (e) { toast(e.message, true, 8000); return; } finally { Busy.off(); }
    } else if (fx.slide) put(i, fx.slide);
    else if (fx.action === 'many') Object.entries(fx.slides || {}).forEach(([j, n]) => put(+j, n));
    else if (fx.action === 'set') {
      const s = arr[i];
      if (!factSet(s, fx.path, fx.raw, fx.value)) { toast('Это место слайда уже изменено — нажмите «Перепроверить».', true, 6000); return; }
      const a = (s.alts || [])[s.alt_index || 0];
      if (a && a !== s && a.layout === s.layout) factSet(a, fx.path, fx.raw, fx.value);
    } else if (fx.action === 'drop') {
      arr.splice(i, 1);
      r.slides = r.slides.filter(sl => sl.i !== i);
      r.slides.forEach(sl => { if (sl.i > i) sl.i--; });
      r.deck.forEach(d => { if (d.fix && (d.fix.action === 'slides' || d.fix.action === 'many')) delete d.fix; });
    } else if (fx.action === 'slides') {
      const old = new Map(arr.map(s => [JSON.stringify(Object.assign({}, s, {alts: undefined})), s]));
      state.spec.slides = fx.slides.map(n => old.get(JSON.stringify(Object.assign({}, n, {alts: undefined}))) || clone(n));
      again = true;
    }
    C.done.add(tab + '|' + f.id);
    resnap(tab);
    planChanged();
    toast(`Исправлено: ${fx.label}`);
    if (again) await run(tab); else render(tab);
    counts();
  }
  // «Заменить на …»: число материалов встаёт на место ненайденного (в тексте — только цифры, слова остаются)
  function factSet(root, path, raw, fix) {
    let obj = root;
    for (let q = 0; q < path.length - 1; q++) obj = obj == null ? null : obj[path[q]];
    const last = path[path.length - 1];
    if (!obj || obj[last] == null) return false;
    if (typeof obj[last] === 'number') { obj[last] = parseFloat(fix.replace(/[\s ]/g, '').replace(',', '.')); return true; }
    const m = String(raw).match(/\d[\d   ]*(?:[.,]\d+)?/);
    const txt = String(obj[last]);
    if (!m || !txt.includes(m[0].trim())) return false;
    obj[last] = txt.replace(m[0].trim(), fix.replace(/^[-−]/, ''));
    return true;
  }

  /* ---------------------------------------------------------------- числа */
  function where(x) { return [x.sec ? `«${x.sec}»` : '', x.src || ''].filter(Boolean).join(', ') + (x.where ? `: ${x.where}` : ''); }
  function source(n) {
    if (n.status === 'ok') return `Источник — ${where(n)}`;
    if (n.status === 'rounded') return `Округлено из ${n.found} — ${where(n)}`;
    if (n.status === 'derived') return `Посчитано: ${n.how}${n.src ? ' — ' + where(n) : ''}`;
    if (n.status === 'library') return `Есть только в библиотеке материалов — ${where(n)}. Числа на слайдах берутся из материалов доклада: проверьте.`;
    return (n.similar || []).length ? '' : 'В материалах доклада такого числа нет — проверьте его или уберите.';
  }
  function renderFacts(d, box) {
    const c = d.counts, all = c.ok + c.rounded + c.derived + c.library + c.missing;
    box.appendChild(h(`<div class="chk-sum">${all ? `Чисел на слайдах: <b>${all}</b> · ✓ ${c.ok} · ≈ ${c.rounded} · ƒ ${c.derived}${c.library ? ` · 📚 ${c.library}` : ''} · <span class="${c.missing ? 'bad' : ''}">✗ ${c.missing}</span>` : 'На слайдах нет чисел для сверки.'}</div>`));
    const only = h('<label class="sw"><input type="checkbox"><span>Показывать только числа, которые нужно проверить</span></label>');
    $('input', only).checked = C.onlyBad;
    $('input', only).addEventListener('change', e => { C.onlyBad = e.target.checked; render('facts'); });
    const notes = h('<label class="sw"><input type="checkbox"><span>Писать источники чисел в заметки докладчика</span></label>');
    $('input', notes).checked = state.spec.meta.number_notes !== false;
    $('input', notes).addEventListener('change', e => { if (e.target.checked) delete state.spec.meta.number_notes; else state.spec.meta.number_notes = false; planChanged({quiet: true}); });
    box.appendChild(only); box.appendChild(notes);
    let any = false;
    (d.slides || []).forEach(sl => {
      const nums = sl.numbers.filter(n => !C.onlyBad || n.status === 'missing' || n.status === 'library');
      if (!nums.length) return;
      any = true;
      box.appendChild(group(`Слайд ${sl.i + 1}`, sl.title, sl.i, nums.map(n => {
        const k = sl.numbers.indexOf(n);
        const el = h(`<div class="chk-item fact f-${esc(n.status)}"><span class="ic" title="${esc(FACT_NAME[n.status])}">${FACT_IC[n.status] || '•'}</span>
          <div class="tx"><div><b></b> <small class="fld-name"></small></div><small class="ctx"></small><small class="src"></small></div></div>`);
        $('b', el).textContent = n.raw; $('.fld-name', el).textContent = '· ' + n.field;
        $('.ctx', el).textContent = n.ctx; $('.src', el).textContent = source(n);
        (n.similar || []).forEach((x, j) => {
          const sim = h('<div class="sim"><small></small></div>');
          $('small', sim).textContent = `В материалах есть ${x.found} — ${where(x)}`;
          const b = h('<button class="btn ghost small" type="button"></button>');
          b.textContent = `Заменить на ${x.fix}`;
          b.addEventListener('click', () => factFix(sl.i, k, j));
          sim.appendChild(b);
          $('.tx', el).appendChild(sim);
        });
        return el;
      })));
    });
    if (!any && all) box.appendChild(h(`<div class="chk-ok">${c.missing + c.library ? 'Включите показ всех чисел, чтобы увидеть найденные.' : '✓ Все числа найдены в материалах доклада или посчитаны из них.'}</div>`));
    focusEl(box);
  }
  async function factFix(i, k, j) {
    const d = C.res.facts, sl = (d.slides || []).find(x => x.i === i), s = slides()[i];
    const n = sl && sl.numbers[k], x = n && (n.similar || [])[j];
    if (!s || !x) return;
    if (!factSet(s, n.path, n.raw, x.fix)) { toast('Это место слайда уже изменено — нажмите «Перепроверить».', true, 6000); return; }
    const a = (s.alts || [])[s.alt_index || 0];
    if (a && a !== s && a.layout === s.layout) factSet(a, n.path, n.raw, x.fix);
    C.focus = i;
    planChanged();
    toast(`Слайд ${i + 1}: ${n.raw} → ${x.fix}`);
    await run('facts');
  }

  /* ---------------------------------------------------------------- текст */
  // правка словами: «течении» зачёркнуто, «течение» — рядом
  function diff(a, b) {
    let p = 0, q = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
    while (p > 0 && !/\s/.test(a[p - 1])) p--;
    while (q > 0 && !/\s/.test(a[a.length - q])) q--;
    const pre = a.slice(0, p), x = a.slice(p, a.length - q), y = b.slice(p, b.length - q), suf = a.slice(a.length - q);
    return `${esc(pre)}<s>${esc(x)}</s>${x && y ? ' ' : ''}<ins>${esc(y)}</ins>${esc(suf)}`;
  }
  function renderText(r, box) {
    const c = r.counts || {}, all = r.findings || [];
    const sum = [c['словарь'] ? `📖 названий: <b>${c['словарь']}</b>` : '', c['правописание'] ? `✍ правописание: <b>${c['правописание']}</b>` : '',
      c['типографика'] ? `« » кавычки, тире, пробелы: <b>${c['типографика']}</b>` : ''].filter(Boolean).join(' · ');
    if (sum) box.appendChild(h(`<div class="chk-sum">${sum}</div>`));
    const tools = h('<div class="row2 chk-tools"><button class="btn ghost small" type="button">📖 Словарь Компании</button><button class="btn primary small" type="button">Исправить всё</button></div>');
    const [dict, all1] = $$('button', tools);
    dict.addEventListener('click', () => Dict.open(() => run('text')));
    all1.disabled = !all.length;
    all1.addEventListener('click', () => textFix(null));
    box.appendChild(tools);
    if (!r.entries) box.appendChild(h('<p class="hint">В словаре пока только название Компании. Добавьте общества, месторождения и должности: кнопка «📖 Словарь Компании».</p>'));
    if (!all.length) box.appendChild(h('<div class="chk-ok">✓ Текст в порядке: названия, правописание и кавычки — как надо.</div>'));
    const by = new Map();
    all.forEach(f => { if (!by.has(f.i)) by.set(f.i, []); by.get(f.i).push(f); });
    for (const [i, list] of by) {
      const main = list.filter(f => f.kind !== 'типографика'), typo = list.filter(f => f.kind === 'типографика');
      const els = main.map(f => {
        const el = h(`<div class="chk-item txt"><span class="ic">${f.kind === 'словарь' ? '📖' : '✍'}</span><div class="tx"><div class="txt-diff">${diff(f.before, f.after)}</div><small></small>
          <div class="txt-btns"><button class="btn ghost small" type="button">Исправить</button><button class="link-btn small" type="button">Оставить как есть</button></div></div></div>`);
        $('small', el).textContent = f.why;
        const [fix, skip] = $$('.txt-btns button', el);
        fix.addEventListener('click', () => textFix([[f.i, f.path]]));
        skip.addEventListener('click', () => textSkip(f));
        return el;
      });
      if (typo.length) {
        const d = h(`<details class="txt-typo"><summary>« » Кавычки, тире, пробелы — мест: ${typo.length}</summary></details>`);
        typo.forEach(f => d.appendChild(h(`<div class="txt-diff small">${diff(f.before, f.after)}</div>`)));
        els.push(d);
      }
      box.appendChild(group(`Слайд ${i + 1}`, list[0].title, i, els));
    }
    const skip = (state.spec.meta.text_skip || []).length;
    if (skip) {
      const p = h(`<p class="hint">Оставлено как есть: ${skip}. <button class="link-btn small" type="button">Вернуть все правки</button></p>`);
      $('button', p).addEventListener('click', () => { delete state.spec.meta.text_skip; planChanged({quiet: true}); run('text'); });
      box.appendChild(p);
    }
  }
  function txtSet(root, path, old, text) {
    let obj = root;
    for (let q = 0; q < path.length - 1; q++) obj = obj == null ? null : obj[path[q]];
    const last = path[path.length - 1];
    if (!obj || obj[last] !== old) return false;
    obj[last] = text;
    return true;
  }
  async function textFix(where) {
    let r;
    try { r = await apiJSON('POST', '/api/text/fix', {spec: state.spec, where}); } catch (e) { toast(e.message, true); return; }
    let stale = 0, n = 0;
    for (const ch of r.changes || []) {
      const s = slides()[ch.i];
      if (!s || !txtSet(s, ch.path, ch.old, ch.text)) { stale++; continue; }
      const a = (s.alts || [])[s.alt_index || 0];
      if (a && a !== s && a.layout === s.layout) txtSet(a, ch.path, ch.old, ch.text);
      n++;
    }
    if (n) planChanged();
    toast(stale ? 'Часть мест уже изменена — проверьте ещё раз.' : (where ? 'Исправлено.' : `Исправлено мест: ${r.fixed}.`), !!stale);
    await run('text');
  }
  function textSkip(f) {
    if (!f || !f.key) return;
    const m = state.spec.meta;
    m.text_skip = [...new Set([...(m.text_skip || []), f.key])];
    planChanged({quiet: true});
    toast(`«${f.word || f.before}» оставлено как есть в этой презентации.`);
    run('text');
  }

  /* ---------------------------------------------------------------- эталоны */
  function refsEl() {
    const box = h('<div class="chk-refs"><p class="hint refs"></p><label class="btn ghost small upl">⇪ Добавить эталоны (.pptx)<input type="file" accept=".pptx" multiple></label></div>');
    const line = $('.refs', box);
    Library.items().then(items => {
      const refs = items.filter(e => e.ref);
      line.textContent = refs.length ? `⭐ Эталоны: ${refs.map(e => '«' + e.name.replace(/\.pptx$/i, '') + '»').join(', ')}`
        : 'Эталонов пока нет: добавьте свои лучшие презентации PowerPoint кнопкой ниже или отметьте ⭐ в «📚 Библиотеке материалов».';
    }).catch(() => { line.textContent = ''; });
    $('input', box).addEventListener('change', async e => {
      const files = Array.from(e.target.files || []); e.target.value = '';
      if (!files.length) return;
      const added = await Library.add(files, true);
      if (added) run('etalons');
    });
    return box;
  }

  /* ---------------------------------------------------------------- значки у слайдов плана: ⚠ N и 🔢 N */
  function setBad(r, snap) {
    C.bad = new WeakMap();
    for (const sl of r.slides || []) {
      const warn = sl.items.filter(f => f.level === 'warn');
      if (snap[sl.i] && warn.length) C.bad.set(snap[sl.i], warn.length);
    }
    Plan.badges();
  }
  function setFacts(d) {
    C.facts = new WeakMap();
    for (const sl of d.slides || []) {
      const s = slides()[sl.i], n = (sl.counts.missing || 0) + (sl.counts.library || 0);
      if (s && n) C.facts.set(s, n);
    }
    Plan.badges();
  }
  function badges(s) {
    const out = [];
    const w = C.bad.get(s), f = C.facts.get(s);
    if (w) out.push(['review', `⚠ ${w}`, 'Важные замечания рецензента']);
    if (f) out.push(['facts', `🔢 ${f}`, 'Числа, которых нет в материалах доклада']);
    return out;
  }
  // рецензент без модели и сверка чисел — после каждого изменения плана (быстро: доли секунды)
  function soon() {
    clearTimeout(C.t);
    if (state.spec && state.spec.slides.length) C.t = setTimeout(auto, 2500);
  }
  async function auto() {
    if (!state.spec || C.autoBusy || C.busy) return;
    C.autoBusy = true;
    const snap = slides().slice();
    try {
      const r = await apiJSON('POST', '/api/review?wait=1', {spec: state.spec, what: 'review'});
      setBad(r, snap);
      if (state.spec.meta.facts) { const d = await Engine.post('/api/verify', {spec: state.spec}); if (d.ok) setFacts(d.json()); }
    } catch (e) { /* значки — подсказка, без них план работает */ }
    finally { C.autoBusy = false; }
  }
  function reset() { C.res = {}; C.snap = {}; C.done = new Set(); C.bad = new WeakMap(); C.facts = new WeakMap(); }

  return {open, soon, reset, badges};
})();

/* ---------------------------------------------------------------- словарь Компании */
const Dict = (() => {
  async function open(after) {
    const D = {entries: [], builtin: [], cats: [], auto: true, edit: null, q: ''};
    const body = h(`<div class="dict">
      <p class="hint" style="margin-top:0">Как правильно пишутся названия обществ, месторождений, должностей и термины. Конструктор заменяет неправильные варианты правильными на всех слайдах. Прямые кавычки, написание без кавычек и «е» вместо «ё» узнаются сами.</p>
      <div class="card dict-add">
        <label class="fld"><span>Как правильно</span><input type="text" placeholder="ООО «Зарубежнефть-добыча Харьяга»" autocomplete="off"></label>
        <label class="fld"><span>Как ещё пишут — через «;»</span><input type="text" placeholder="ЗНДХ; Зарубежнефть-добыча Харьяга" autocomplete="off"></label>
        <label class="fld"><span>Вид</span><select></select></label>
        <div class="row2"><button class="btn ghost hidden" type="button" data-a="cancel">Отмена</button><button class="btn primary" type="button" data-a="add">Добавить</button></div>
      </div>
      <div class="search"><input type="search" placeholder="Найти в словаре" autocomplete="off"></div>
      <p class="hint dict-state"></p>
      <div class="dict-list"></div>
      <label class="sw"><input type="checkbox" data-auto><span>Исправлять названия и ошибки при сборке (кавычки и тире — всегда)</span></label>
      <div class="row2" style="margin-top:12px"><label class="btn ghost small upl">⇪ Загрузить из Excel<input type="file" accept=".xlsx,.xlsm,.csv,.txt"></label><button class="btn ghost small" type="button" data-a="export">⇩ Скачать</button></div>
      <p class="hint">Excel или CSV: первый столбец — как правильно, второй — как ещё пишут (через «;»), третий — вид (общество, месторождение, должность, термин).</p>
    </div>`);
    const [right, wrong] = $$('.dict-add input', body), cat = $('.dict-add select', body);
    const list = $('.dict-list', body), stateEl = $('.dict-state', body), autoEl = $('[data-auto]', body);
    const addBtn = $('[data-a=add]', body), cancel = $('[data-a=cancel]', body);
    const done = h('<button class="btn primary" type="button">Готово</button>');
    const sh = openSheet({title: '📖 Словарь Компании', full: true, back: true, body, foot: done, onClose: () => { if (after) after(); }});
    done.addEventListener('click', () => sh.close());
    stateEl.textContent = 'Загружаю…';
    try {
      const d = await apiJSON('GET', '/api/dictionary');
      Object.assign(D, {entries: d.entries, builtin: d.builtin, cats: d.cats, auto: d.auto});
      cat.innerHTML = d.cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
      autoEl.checked = d.auto;
      stateEl.textContent = '';
    } catch (e) { stateEl.textContent = e.message; }
    function draw() {
      const q = D.q.toLowerCase();
      const rows = [...D.builtin, ...D.entries].filter(e => !q || [e.right, ...(e.wrong || []), e.cat].join(' ').toLowerCase().includes(q));
      list.innerHTML = '';
      rows.forEach(e => {
        const k = D.entries.indexOf(e);
        const row = h(`<div class="dict-row${D.edit === k && k >= 0 ? ' on' : ''}"><div class="dm"><b></b> <span class="tag"></span><small></small></div></div>`);
        $('b', row).textContent = e.right; $('.tag', row).textContent = e.cat;
        $('small', row).textContent = e.wrong && e.wrong.length ? 'вместо: ' + e.wrong.join('; ') : 'кавычки и «е»/«ё» узнаются сами';
        if (e.builtin) row.appendChild(h('<span class="hint" style="margin:0">встроено</span>'));
        else {
          const ed = h('<button class="icon-btn" type="button" aria-label="Изменить">✎</button>');
          const del = h('<button class="icon-btn" type="button" aria-label="Удалить">✕</button>');
          ed.addEventListener('click', () => {
            D.edit = k; right.value = e.right; wrong.value = (e.wrong || []).join('; '); cat.value = e.cat;
            draw(); body.parentElement.scrollTo({top: 0, behavior: 'smooth'});
          });
          del.addEventListener('click', async () => {
            if (!await confirmSheet(`Удалить из словаря «${e.right}»?`, 'Удалить', true)) return;
            D.entries.splice(k, 1);
            if (D.edit === k) { D.edit = null; right.value = wrong.value = ''; }
            save();
          });
          row.appendChild(ed); row.appendChild(del);
        }
        list.appendChild(row);
      });
      if (!rows.length) list.appendChild(h(`<p class="hint">${q ? 'Ничего не найдено.' : 'Пока пусто.'}</p>`));
      addBtn.textContent = D.edit !== null ? 'Сохранить' : 'Добавить';
      cancel.classList.toggle('hidden', D.edit === null);
      const n = D.entries.length;
      if (!stateEl.classList.contains('err')) stateEl.textContent = n ? `В словаре: ${n} ${n % 10 === 1 && n % 100 !== 11 ? 'запись' : (n % 10 > 1 && n % 10 < 5 && (n % 100 < 10 || n % 100 > 20) ? 'записи' : 'записей')}` : '';
    }
    async function save(what) {
      try {
        const d = await apiJSON('POST', '/api/dictionary', {entries: D.entries, auto: autoEl.checked});
        D.entries = d.entries; D.auto = d.auto;
        stateEl.classList.remove('err');
        if (what === 'auto') toast(d.auto ? 'Названия и ошибки исправляются при сборке.' : 'При сборке исправляются только кавычки, тире и пробелы.');
      } catch (e) { stateEl.textContent = e.message; stateEl.classList.add('err'); }
      draw();
    }
    addBtn.addEventListener('click', () => {
      const r = right.value.trim(), w = wrong.value.split(/[;\n]/).map(x => x.trim()).filter(Boolean);
      if (!r) { right.focus(); return; }
      const e = {right: r, wrong: w, cat: cat.value || 'термин'};
      // вариант может вести только к одному написанию: новая запись забирает его у прежней
      const low = new Set(w.map(x => x.toLowerCase())), moved = [];
      D.entries.forEach((x, k) => {
        if (k === D.edit) return;
        const keep = x.wrong.filter(v => !low.has(v.toLowerCase()));
        if (keep.length < x.wrong.length) { moved.push(`«${x.right}»`); x.wrong = keep; }
      });
      if (moved.length) toast(`Эти варианты были у записи ${moved.join(', ')} — теперь они ведут к «${r}».`, false, 7000);
      const same = D.entries.findIndex((x, k) => x.right.toLowerCase() === r.toLowerCase() && k !== D.edit);
      if (D.edit !== null && D.entries[D.edit]) D.entries[D.edit] = e;
      else if (same >= 0) D.entries[same] = Object.assign(e, {wrong: [...new Set([...D.entries[same].wrong, ...w])]});
      else D.entries.unshift(e);
      if (D.edit !== null && same >= 0) D.entries.splice(same, 1);
      D.edit = null;
      right.value = wrong.value = '';
      save();
    });
    cancel.addEventListener('click', () => { D.edit = null; right.value = wrong.value = ''; draw(); });
    $('.search input', body).addEventListener('input', e => { D.q = e.target.value.trim(); draw(); });
    autoEl.addEventListener('change', () => save('auto'));
    $('.upl input', body).addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      stateEl.textContent = `Читаю «${f.name}»…`; stateEl.classList.remove('err');
      try {
        const fd = new FormData(); fd.append('file', f, f.name);
        const d = await apiJSON('POST', '/api/dictionary/import', fd);
        D.entries = d.entries;
        toast(`Из «${f.name}»: новых записей ${d.added}, дополнено ${d.updated}.`);
        stateEl.textContent = '';
      } catch (err) { stateEl.textContent = err.message; stateEl.classList.add('err'); }
      draw();
    });
    $('[data-a=export]', body).addEventListener('click', async () => {
      const r = await Engine.get('/api/dictionary/export');
      if (!r.ok) { toast('Словарь не выгрузился.', true); return; }
      saveFile(r.blob('text/csv'), filenameFrom(r, 'Словарь Компании.csv'));
    });
    draw();
  }
  return {open};
})();

/* ---------------------------------------------------------------- версии для разных слушателей */
const Versions = (() => {
  const ABOUT = {board: 'Коротко: выводы, показатели, цель и то, о чём просят решения.', work: 'Полная: все слайды, заметки докладчика и источники чисел.',
    external: 'Для партнёров и публикаций: без денег, затрат, цен и без заметок.'};
  function open() {
    if (!state.spec) return;
    const pick = new Set(['board', 'work', 'external']);
    const o = {n: String(restore('verN', 6)), words: restore('verWords', '')};
    let data = null, timer = 0, run = 0;
    const body = h('<div><p class="hint" style="margin-top:0">Из этого плана — до трёх презентаций сразу. Числа не меняются и не придумываются: версии только убирают лишнее.</p><div class="ver-list"></div><div class="ver-opts"></div></div>');
    const list = $('.ver-list', body), opts = $('.ver-opts', body);
    opts.appendChild(field('Слайдов по существу для правления (3–15)', o, 'n', {inputmode: 'numeric', onChange: () => refresh(700)}));
    opts.appendChild(field('Также убрать во внешней версии', o, 'words', {placeholder: 'например: ДСП, Месторождение Б, номер договора', onChange: () => refresh(900)}));
    const go = h('<button class="btn primary" type="button">Собрать (.zip)</button>');
    const sh = openSheet({title: '👥 Версии для слушателей', full: true, back: true, body, foot: go});
    const req = kinds => ({spec: state.spec, kinds, n: Math.max(3, Math.min(15, parseInt(o.n, 10) || 6)), words: o.words});
    function refresh(ms) {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const my = ++run;
        store('verN', o.n); store('verWords', o.words);
        try {
          const d = await apiJSON('POST', '/api/versions', req(['board', 'work', 'external']));
          if (my !== run) return;
          data = d.versions;
          draw();
        } catch (e) { list.innerHTML = `<p class="warn-txt">${esc(e.message)}</p>`; }
      }, ms);
    }
    function draw() {
      list.innerHTML = '';
      data.forEach(v => {
        const c = h(`<div class="item ver-card${pick.has(v.kind) ? ' sel' : ''}"><label class="sw" style="border:0;padding:0"><input type="checkbox"><span><b></b> <small class="hint"></small></span></label>
          <p class="hint" style="margin:0"></p><details${v.kind === 'external' ? ' open' : ''}><summary>Что изменено</summary><ul class="ver-notes"></ul></details>
          <button class="btn ghost small" type="button">Открыть план</button></div>`);
        $('input', c).checked = pick.has(v.kind);
        $('b', c).textContent = v.name[0].toUpperCase() + v.name.slice(1);
        $('small', c).textContent = `${v.slides} ${v.slides % 10 === 1 && v.slides % 100 !== 11 ? 'слайд' : (v.slides % 10 > 1 && v.slides % 10 < 5 && (v.slides % 100 < 10 || v.slides % 100 > 20) ? 'слайда' : 'слайдов')}`;
        $('p', c).textContent = ABOUT[v.kind] || '';
        v.notes.forEach(n => { const li = document.createElement('li'); li.textContent = n; $('.ver-notes', c).appendChild(li); });
        $('input', c).addEventListener('change', e => { if (e.target.checked) pick.add(v.kind); else pick.delete(v.kind); c.classList.toggle('sel', e.target.checked); upd(); });
        $('.btn', c).addEventListener('click', async () => {
          if (!await confirmSheet(`Открыть версию «${v.name}» в плане? Нынешний план останется в «Моих презентациях».`, 'Открыть')) return;
          await saveProject();
          sh.close();
          state.projectId = null;
          Plan.open(clone(v.spec), null, `Открыта версия «${v.name}»: ${v.slides} слайдов`);
        });
        list.appendChild(c);
      });
      upd();
    }
    function upd() { go.disabled = !pick.size; go.textContent = pick.size === 1 ? 'Собрать (.zip)' : `Собрать ${pick.size} (.zip)`; }
    go.addEventListener('click', async () => {
      const kinds = ['board', 'work', 'external'].filter(k => pick.has(k));
      if (!kinds.length) return;
      Busy.on('Собираю версии…', {detail: `${kinds.length} ${kinds.length === 1 ? 'презентация' : 'презентации'} и «Что изменено.txt»`});
      try {
        const r = await Engine.post('/api/versions/build', req(kinds));
        if (!r.ok) throw new Error(r.json().error || 'Версии не собраны');
        const name = filenameFrom(r, 'Версии.zip');
        Busy.off();
        const how = await saveFile(r.blob('application/zip'), name);
        if (how !== 'aborted') { sh.close(); toast(`Готово: ${name}`, false, 6000); }
      } catch (e) { toast(e.message, true, 8000); } finally { Busy.off(); }
    });
    list.innerHTML = '<p class="hint">Готовлю версии…</p>';
    refresh(0);
  }
  return {open};
})();
