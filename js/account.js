/* account.js — версия 1.8: личный кабинет и сохранение работы, база ключевых слов по темам, обучение при первом открытии.
 *
 * Кабинет. Телефон личный, а всё хранится в его браузере, поэтому кабинет у каждого телефона свой — «Этот телефон»,
 * без имени и пароля (в Windows-версии это режим "require_login": false). В кабинете — «Мои презентации» и профиль.
 * Работа (план, материалы, поля экрана «Материалы», открытый раздел) сохраняется сама: через секунду после правки,
 * при уходе со вкладки и при её закрытии (плюс копия в localStorage — если запись в IndexedDB не успела).
 * Ключевые слова — та же база и те же запросы движка, что в Windows (/api/keywords…). Пополнение моделью после
 * анализа движок запускает, когда телефон свободен (worker.js, «задания когда свободно»), — ход приходит сообщениями.
 * Обучение — шаги с подсветкой на главном экране, при первом открытии; пройти снова — в кабинете или в справке. */
'use strict';

/* ---------------------------------------------------------------- текущая работа */
const Work = (() => {
  const COPY = 'unsaved';

  function mark(kind) {
    const el = $('#saveState');
    if (!el) return;
    if (kind === 'saving') return;                 // запись в телефон занимает миллисекунды — без мигания
    el.textContent = kind === 'ok' ? `✓ Сохранено ${new Date().toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'})}` : (kind === 'err' ? '⚠ Не сохранено' : '');
    el.className = 'save-state' + (kind ? ' ' + kind : '');
    el.title = kind === 'err' ? 'Не удалось записать в память телефона — проверьте свободное место («Ещё» → «Память телефона»)' : '';
  }

  /* план по другим материалам — новая работа в «Моих презентациях», прежняя остаётся со своим планом */
  async function forkFor(sources) {
    if (!state.projectId || !state.spec) return;    // в работе ещё нет плана — он ляжет в неё
    const old = (state.info || {}).sources || [];
    if (old.length && old.length === sources.length && old.every(x => sources.includes(x))) return;   // те же материалы
    await saveProject();
    const oldId = state.projectId, keep = state.files.filter(f => old.includes(f.name));
    try {
      await DB.putFiles(oldId, keep);
      const r = await DB.get(oldId);
      if (r) { r.names = keep.map(f => f.name); await DB.put(r); }
    } catch (e) { /* не страшно: прежний план на месте */ }
    state.projectId = null; state.built = null; SAVE.filesId = null;
  }

  /* открыть работу: материалы, поля, план, раздел */
  async function open(p, opts = {}) {
    if (state.projectId && state.projectId !== p.id && (saveTimer || state.dirty)) await saveProject();
    const files = await DB.getFiles(p.id);
    state.projectId = p.id;
    state.files = files.map(f => (f instanceof File ? f : new File([f], (f && f.name) || 'файл', {type: (f && f.type) || ''})));
    SAVE.filesId = p.id;
    state.built = p.built || null;
    Materials.setForm(p.opts || {});
    Materials.renderFiles();
    if (p.spec) Plan.open(p.spec, {info: p.info, warnings: p.warnings}, null, {nosave: !opts.dirty});
    else { state.spec = null; state.info = null; state.warnings = []; Thumbs.reset(); Plan.render(); }
    state.projectId = p.id;
    const lost = (p.names || []).filter(n => !state.files.some(f => f.name === n));
    if (lost.length) toast(`Материалы «${lost.slice(0, 3).join('», «')}»${lost.length > 3 ? ' и др.' : ''} не сохранились в телефоне — план на месте, а файлы при необходимости добавьте снова.`, false, 9000);
    if (opts.dirty) saveSoon(300);
    else mark('ok');
    return p;
  }

  /* при запуске — работа, открытая в прошлый раз (с изменениями, сделанными перед закрытием вкладки) */
  async function restoreLast() {
    const id = restore('lastProject', null);
    let p = null;
    try { p = id ? await DB.get(id) : null; } catch (e) { p = null; }
    const copy = restore(COPY, null), rec = copy && copy.rec;
    let fromCopy = false;
    // копия остаётся, только если запись в IndexedDB не успела (после записи она удаляется)
    if (rec && rec.id && !(p && p.id === rec.id && (p.updated || 0) >= (rec.updated || 0))) {
      try { p = Object.assign({}, (await DB.get(rec.id)) || {}, rec); fromCopy = true; } catch (e) { p = rec; fromCopy = true; }
    }
    if (!p) return null;
    try {
      await open(p, {dirty: fromCopy});
      if (p.tab && ['materials', 'plan', 'view'].includes(p.tab)) App.go(p.spec || p.tab === 'materials' ? p.tab : 'materials');
      else if (p.spec) App.go('plan');
      if (fromCopy) toast(`Восстановлена ваша работа «${p.title || 'Без названия'}» — изменения, сделанные перед закрытием вкладки, на месте.`, false, 7000);
      else if (p.spec || (p.names || []).length) toast(`Открыта ваша последняя работа «${p.title || 'Без названия'}» (сохранена ${fmtWhen(p.updated)}).`, false, 5000);
      return p;
    } catch (e) { console.warn('restore', e); return null; }
  }

  /* ушли со вкладки или закрывают её: запись в телефон и копия в localStorage — на случай, если запись не успеет */
  function leave() {
    if (!saveTimer && !SAVE.busy && !state.dirty) return;
    if (!state.projectId && workEmpty()) return;
    if (!state.projectId) state.projectId = 'p' + Date.now().toString(36);
    try { localStorage.setItem('znm.' + COPY, JSON.stringify({rec: workRecord()})); } catch (e) { /* план больше места localStorage — остаётся запись в IndexedDB */ }
    saveProject();
  }
  function dropCopy(id) {
    const c = restore(COPY, null);
    if (c && c.rec && c.rec.id === id) { try { localStorage.removeItem('znm.' + COPY); } catch (e) { /* нет */ } }
  }

  async function newWork() {
    if (saveTimer || state.dirty) await saveProject();
    state.spec = null; state.info = null; state.warnings = []; state.projectId = null; state.files = []; state.built = null;
    SAVE.filesId = null;
    store('lastProject', null);
    Thumbs.reset();
    Materials.clearForm();
    Materials.renderFiles();
    Plan.render();
    App.go('materials');
    mark('');
  }

  return {mark, forkFor, open, restoreLast, leave, dropCopy, newWork};
})();

/* ---------------------------------------------------------------- личный кабинет */
const Me = (() => {
  let user = null;

  async function load() {
    try { user = (await apiJSON('GET', '/api/me')).user || null; } catch (e) { user = null; }
    if (user) {                                     // ФИО и телефон из профиля — в справку Word
      if (!restore('author', '') && user.full) store('author', user.full);
      if (!restore('phone', '') && user.phone) store('phone', user.phone);
    }
    return user;
  }
  async function patch(body) {
    const r = await apiJSON('PATCH', '/api/me', body);
    if (r.user) user = r.user;
    return user;
  }
  function toProfile(full, phone) {
    if (!user) return;
    const b = {};
    if ((full || '') !== (user.full || '')) b.full = full || '';
    if ((phone || '') !== (user.phone || '')) b.phone = phone || '';
    if (Object.keys(b).length) patch(b).catch(() => {});
  }

  /* окно «👤 Личный кабинет»: мои презентации, профиль, вид, обучение */
  async function open() {
    await saveProject();
    const body = h('<div class="me"></div>');
    const nu = h('<button class="btn primary" type="button">＋ Новая презентация</button>');
    const sh = openSheet({title: '👤 Личный кабинет', sub: 'Этот телефон', full: true, body, foot: nu});
    nu.addEventListener('click', async () => { sh.close(); await Work.newWork(); toast('Новая презентация: добавьте материалы. Прежняя — в «👤 Личном кабинете».', false, 5000); });

    body.appendChild(h('<h4 class="me-h">Мои презентации</h4>'));
    const list = h('<div class="me-list"></div>');
    body.appendChild(list);
    body.appendChild(h('<p class="hint">Работа сохраняется сама: план, параметры и материалы. Закрыли вкладку или выключили телефон — при следующем открытии всё на месте.</p>'));

    body.appendChild(h('<h4 class="me-h">Профиль</h4>'));
    const prof = {full: restore('author', '') || (user && user.full) || '', phone: restore('phone', '') || (user && user.phone) || ''};
    const saveProf = () => { store('author', prof.full.trim()); store('phone', prof.phone.trim()); toProfile(prof.full.trim(), prof.phone.trim()); };
    const f1 = field('Фамилия И. О.', prof, 'full', {placeholder: 'Иванов И. И.'});
    const f2 = field('Телефон', prof, 'phone', {placeholder: '+7 …', inputmode: 'tel'});
    $('input', f1).autocomplete = 'name'; $('input', f2).autocomplete = 'tel';
    [f1, f2].forEach(f => $('input', f).addEventListener('change', () => { saveProf(); toast('✓ Профиль сохранён'); }));
    body.appendChild(f1); body.appendChild(f2);
    body.appendChild(h('<p class="hint" style="margin-top:-4px">Подставляются исполнителем в справку Word.</p>'));

    const row = h('<div class="me-btns"></div>');
    const bView = h('<button class="btn ghost" type="button">🎨 Вид: тема и размер текста</button>');
    const bTour = h('<button class="btn ghost" type="button">🎓 Показать обучение снова</button>');
    bView.addEventListener('click', () => More.theme());
    bTour.addEventListener('click', () => { closeAllSheets(); Tour.start(); });
    row.appendChild(bView); row.appendChild(bTour);
    body.appendChild(row);
    body.appendChild(h('<p class="hint">Кабинет хранится в этом телефоне, в браузере: у каждого телефона свой, поэтому вход по имени и паролю здесь не нужен. Перенести план на компьютер — «⋯» у презентации → «Сохранить файлом» и открыть его в Windows-версии.</p>'));

    async function draw() {
      const all = (await DB.all().catch(() => [])).sort((a, b) => b.updated - a.updated);
      list.innerHTML = '';
      if (!all.length) { list.appendChild(h('<p class="me-empty">Пока пусто. Добавьте материалы и постройте план — презентация появится здесь сама.</p>')); return; }
      all.forEach(p => {
        const sl = (p.spec && p.spec.slides) || [];
        const cur = p.id === state.projectId;
        const c = h(`<div class="proj${cur ? ' cur' : ''}" role="button" tabindex="0"><div class="pic">${thumbSvg(sl[0] ? sl[0].layout : 'title')}</div>
          <div class="t"><b></b><small></small></div><button class="icon-btn" type="button" aria-label="Действия">⋯</button></div>`);
        $('b', c).textContent = p.title || 'Без названия';
        const facts = [sl.length ? `${sl.length} ${plural(sl.length, 'слайд', 'слайда', 'слайдов')}` : 'плана ещё нет', fmtWhen(p.updated),
          (p.names || []).length ? `📎 ${p.names.length}` : '', cur ? 'открыта сейчас' : ''].filter(Boolean);
        $('small', c).textContent = facts.join(' · ');
        c.addEventListener('click', e => { if (!e.target.closest('.icon-btn')) { sh.close(); openWork(p); } });
        $('.icon-btn', c).addEventListener('click', () => menu(p, draw, sh));
        list.appendChild(c);
      });
    }
    draw();
    return sh;
  }
  async function openWork(p) {
    if (p.id === state.projectId) { App.go(state.spec ? 'plan' : 'materials'); return; }
    await Work.open(p);
    store('lastProject', p.id);
    App.go(p.spec ? 'plan' : 'materials');
    toast(`Открыта презентация «${p.title || 'Без названия'}»`);
  }
  function menu(p, redraw, parent) {
    const body = h('<div class="menu-group" style="margin:0"></div>');
    const sh = openSheet({title: p.title || 'Без названия', body});
    const acts = [['open', '📂', 'Открыть'], ['ren', '✎', 'Переименовать'], ['dup', '⧉', 'Сделать копию']];
    if (p.spec) acts.push(['file', '💾', 'Сохранить файлом (.plan.json)']);
    acts.push(['del', '🗑', 'Удалить']);
    acts.forEach(([a, ic, t]) => {
      const b = h(`<button class="menu-item" type="button"><i>${ic}</i><span><b>${esc(t)}</b></span></button>`);
      b.addEventListener('click', async () => {
        sh.close();
        if (a === 'open') { parent.close(); openWork(p); }
        if (a === 'ren') {
          const t2 = await promptSheet('Название презентации', p.title || '', 'Переименовать', {max: 120});
          if (!t2) return;
          const r = await DB.get(p.id);
          if (r) { r.title = t2; if (r.spec) r.spec.meta.title = t2; await DB.put(r); }
          if (p.id === state.projectId && state.spec) { state.spec.meta.title = t2; Plan.render(); }
          redraw(); toast('Переименовано');
        }
        if (a === 'dup') {
          const id = 'p' + Date.now().toString(36);
          await DB.put(Object.assign(clone(p), {id, title: (p.title || 'Презентация') + ' (копия)', updated: Date.now()}));
          DB.putFiles(id, await DB.getFiles(p.id)).catch(() => {});
          redraw(); toast('Копия сохранена');
        }
        if (a === 'file') saveFile(new Blob([JSON.stringify(p.spec, null, 2)], {type: 'application/json'}), (p.title || 'план').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 60) + '.plan.json');
        if (a === 'del' && await confirmSheet(`Удалить «${p.title || 'Без названия'}» с телефона?${p.id === state.projectId ? ' Она открыта сейчас — экран очистится.' : ''}`, 'Удалить', true)) {
          await DB.del(p.id);
          if (state.projectId === p.id) { clearTimeout(saveTimer); state.dirty = false; state.projectId = null; await Work.newWork(); }
          redraw(); toast('Удалено');
        }
      });
      body.appendChild(b);
    });
  }

  return {load, patch, toProfile, open, get user() { return user; }};
})();

/* ---------------------------------------------------------------- база ключевых слов по темам */
const KW = (() => {
  const st = {data: null, cur: '', q: '', sel: '', sug: null, running: false, queued: false, watch: false, sheet: null, msg: ''};

  const pool = () => ((state.spec || {}).meta || {}).pool || '';
  const doc = () => (((state.info || {}).sources || []).slice(0, 3).join(', ') || ((state.spec || {}).meta || {}).title || '').slice(0, 120);
  function tip(w) {
    const at = w.at ? ', ' + fmtWhen(w.at * 1000) : '';
    if (w.src === 'llm') return `Добавила модель ИИ ${w.model || ''}${w.doc ? ` по материалам «${w.doc}»` : ''}${at}`;
    if (w.src === 'user') return `Добавлено вручную${at}`;
    return 'Встроенное слово';
  }
  async function load() {
    const d = await apiJSON('GET', '/api/keywords');
    set(d);
    return d;
  }
  function set(d) {
    st.data = d;
    if (!d.topics.some(t => t.id === st.cur)) st.cur = (d.topics[0] || {}).id || '';
    render();
  }

  /* окно «🏷 Ключевые слова» */
  function open() {
    const body = h(`<div class="kw">
      <p class="hint" style="margin-top:0">По этим словам конструктор узнаёт тему доклада и ключевые слова материалов. Модель ИИ дополняет базу терминами из ваших документов.</p>
      <div class="search"><input type="search" class="kw-find" placeholder="Найти слово или тему" enterkeyhint="search" autocomplete="off"></div>
      <div class="kw-counts hint"></div>
      <div class="kw-topics" role="tablist" aria-label="Темы"></div>
      <div class="kw-thead"><b class="kw-tn"></b><span class="kw-tools"><button type="button" class="icon-btn" data-a="ren" aria-label="Переименовать тему" title="Переименовать тему">✎</button><button type="button" class="icon-btn" data-a="deltopic" aria-label="Удалить тему" title="Удалить тему">🗑</button></span></div>
      <div class="kw-add"><input class="kw-word" placeholder="Новое слово или сочетание" maxlength="60" autocomplete="off" enterkeyhint="done"><button type="button" class="btn primary small" data-a="add">Добавить</button></div>
      <div class="kw-sel hidden"></div>
      <div class="kw-chips"></div>
      <p class="hint kw-legend">🤖 — добавила модель ИИ · ✎ — добавлено вручную · без значка — встроенное. Нажмите на слово, чтобы перенести его в другую тему.</p>
      <h4 class="me-h">Пополнить из материалов</h4>
      <div class="kw-ai card">
        <div class="row2"><button type="button" class="btn primary small" data-a="enrich">🤖 Моделью ИИ</button><button type="button" class="btn ghost small" data-a="suggest">Предложить без ИИ</button></div>
        <p class="hint kw-llm"></p><p class="hint kw-last"></p><div class="kw-sug hidden"></div>
      </div>
      <label class="sw"><input type="checkbox" class="kw-auto"><span>Пополнять автоматически после построения плана (локальная модель ИИ)</span></label>
      <div class="kw-more"><button type="button" class="btn ghost small" data-a="newtopic">＋ Тема</button><label class="btn ghost small">⇪ Загрузить CSV<input type="file" accept=".csv,.txt" hidden></label><button type="button" class="btn ghost small" data-a="export">⇩ Скачать CSV</button><button type="button" class="btn ghost small" data-a="restore">Вернуть встроенные</button></div>
    </div>`);
    const done = h('<button class="btn primary" type="button">Готово</button>');
    const sh = openSheet({title: '🏷 Ключевые слова', full: true, body, foot: done, onClose: () => { st.sheet = null; }});
    st.sheet = sh; st.sel = ''; st.sug = null; st.msg = '';
    done.addEventListener('click', () => sh.close());
    body.addEventListener('click', click);
    $('.kw-find', body).addEventListener('input', e => { st.q = e.target.value; render(); });
    $('.kw-word', body).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    $('.kw-auto', body).addEventListener('change', e => op({action: 'auto', on: e.target.checked}, e.target.checked ? 'Пополнение после построения плана включено' : 'Автоматическое пополнение выключено'));
    $('input[type=file]', body).addEventListener('change', e => { const f = (e.target.files || [])[0]; e.target.value = ''; if (f) importCsv(f); });
    $('.kw-chips', body).innerHTML = `<p class="hint">${st.running ? 'Модель ИИ дописывает базу — слова появятся, когда она закончит…' : 'Загружаю…'}</p>`;
    if (st.data) render();
    load().catch(e => note(e.message, true));
    return sh;
  }
  const el = sel => st.sheet ? $(sel, st.sheet.body) : null;
  function note(t, err) { st.msg = t || ''; if (err && t) toast(t, true); const n = el('.kw-last'); if (n) aiLine(); }

  function render() {
    renderBar();
    if (!st.sheet || !st.data) return;
    const d = st.data, q = lowRu(st.q.trim()), hit = w => !q || lowRu(w.w).includes(q);
    const tops = d.topics.filter(t => !q || lowRu(t.name).includes(q) || t.words.some(hit));
    if (q && tops.length && !tops.some(t => t.id === st.cur)) st.cur = tops[0].id;
    el('.kw-topics').innerHTML = tops.map(t => `<button type="button" role="tab" data-t="${esc(t.id)}" class="kw-topic${t.id === st.cur ? ' on' : ''}" aria-selected="${t.id === st.cur}">${esc(t.name)} <em>${q && !lowRu(t.name).includes(q) ? t.words.filter(hit).length : t.n}</em></button>`).join('')
      || '<span class="hint">Ничего не нашлось.</span>';
    const t = d.topics.find(x => x.id === st.cur);
    el('.kw-tn').textContent = t ? t.name : '';
    el('.kw-tools').classList.toggle('hidden', !t);
    el('.kw-add').classList.toggle('hidden', !t);
    const words = t ? t.words.filter(w => !q || lowRu(t.name).includes(q) || hit(w)) : [];
    el('.kw-chips').innerHTML = words.map(w => {
      const ic = w.src === 'llm' ? '🤖 ' : (w.src === 'user' ? '✎ ' : '');
      return `<span class="kw-chip src-${esc(w.src || 'seed')}${st.sel === w.w ? ' on' : ''}"><button type="button" class="kw-w" data-w="${esc(w.w)}" title="${esc(tip(w))}">${ic}${esc(w.w)}</button><button type="button" class="kw-x" data-x="${esc(w.w)}" aria-label="Удалить ${esc(w.w)}">✕</button></span>`;
    }).join('') || `<p class="hint">${t ? (q ? 'В этой теме такого слова нет.' : 'В теме пока нет слов — добавьте выше.') : ''}</p>`;
    const sel = st.sel && t && t.words.some(w => w.w === st.sel);
    const box = el('.kw-sel');
    box.classList.toggle('hidden', !sel);
    if (sel) {
      const w = t.words.find(x => x.w === st.sel);
      box.innerHTML = `<p class="hint" style="margin:0 0 6px">«<b></b>» · ${esc(tip(w))}</p><label class="fld"><span>Перенести в тему</span><select>${d.topics.filter(x => x.id !== t.id).map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label>
        <div class="row2"><button type="button" class="btn ghost small" data-a="selno">Отмена</button><button type="button" class="btn primary small" data-a="move">Перенести</button></div>`;
      $('b', box).textContent = st.sel;
    }
    el('.kw-auto').checked = !!d.auto;
    el('.kw-counts').textContent = `${d.counts.topics} ${plural(d.counts.topics, 'тема', 'темы', 'тем')} · ${fmtK(d.counts.words)} ${plural(d.counts.words, 'слово', 'слова', 'слов')} · от модели ИИ: ${d.counts.llm}`;
    aiLine();
    renderSug();
  }
  function aiLine() {
    if (!st.sheet || !st.data) return;
    const d = st.data, llm = d.llm || {}, l = d.last, p = pool();
    const run = st.running || !!d.running;          // d.running — пополнение ждёт, когда телефон освободится
    const btn = el('[data-a=enrich]');
    btn.disabled = run || !llm.ready || !!llm.refusal || !p;
    btn.textContent = run ? 'Модель работает…' : (llm.cloud ? '☁ Моделью ИИ' : '🤖 Моделью ИИ');
    el('[data-a=suggest]').disabled = !p;
    const ln = el('.kw-llm');
    ln.classList.toggle('spin-line', run);
    ln.textContent = run ? 'Модель читает материалы и дописывает термины в базу…'
      : (!llm.ready ? 'Модель ИИ не подключена — пополняйте базу вручную или кнопкой «Предложить без ИИ». Подключить: «Ещё» → «Модель ИИ».'
        : (llm.refusal || `Модель: ${llm.name} (${llm.model})${llm.cloud ? ' · ☁ облачная — материалы уходят во внешний сервис, только по кнопке' : ' · локальная'}`))
      + (p || run ? '' : ' Пополнить из материалов можно, когда построен план по своим документам.');
    el('.kw-last').textContent = st.msg || (!l ? '' : (l.error ? `Последнее пополнение (${fmtWhen(l.at * 1000)}) не получилось: ${l.error}`
      : `Последнее пополнение ${fmtWhen(l.at * 1000)}: +${l.added.length}${l.added.length ? ` (${l.added.slice(0, 4).map(a => a.w).join(', ')}${l.added.length > 4 ? '…' : ''})` : ''}${l.model ? ` · модель ${l.model}` : ''}${l.doc ? ` · «${l.doc}»` : ''}`));
  }
  function renderSug() {
    const box = el('.kw-sug');
    if (!box) return;
    box.classList.toggle('hidden', st.sug === null);
    if (st.sug === null) return;
    if (st.sug === 'load') { box.innerHTML = '<p class="hint">Ищу частые слова материалов…</p>'; return; }
    if (!st.sug.length) { box.innerHTML = '<p class="hint">Новых частых слов в материалах нет — всё уже в базе.</p>'; return; }
    const tops = st.data.topics;
    const opts = cur => tops.map(t => `<option value="${esc(t.id)}"${t.name === cur || t.id === cur ? ' selected' : ''}>${esc(t.name)}</option>`).join('');
    box.innerHTML = '<p class="hint">Частые слова материалов, которых нет в базе (×N — сколько раз встречается). Выберите тему и добавьте нужные:</p>'
      + st.sug.map((c, i) => `<div class="kw-sg"><b>${esc(c.w)}</b> <span class="hint">×${c.n}</span><div class="row2"><select data-i="${i}" aria-label="Тема для «${esc(c.w)}»">${opts(c.topic || st.cur)}</select><button type="button" class="btn ghost small" data-add="${i}">+ Добавить</button></div></div>`).join('');
  }

  async function op(o, okMsg) {
    try {
      const r = await apiJSON('POST', '/api/keywords', o);
      if (o.action === 'move' || o.action === 'remove') st.sel = '';
      st.msg = okMsg ? '✓ ' + okMsg : '';
      set(r);
      if (okMsg) toast('✓ ' + okMsg);
      return r;
    } catch (e) { toast(e.message, true); return null; }
  }
  async function add() {
    const inp = el('.kw-word'), w = inp.value.trim();
    if (!w) { inp.focus(); return; }
    if (await op({action: 'add', topic: st.cur, word: w}, `«${w}» добавлено`)) inp.value = '';
  }
  async function click(e) {
    const b = e.target.closest('[data-t],[data-x],[data-w],[data-a],[data-add]');
    if (!b) return;
    if (b.dataset.t) { st.cur = b.dataset.t; st.sel = ''; render(); return; }
    if (b.dataset.x) { op({action: 'remove', topic: st.cur, word: b.dataset.x}, `«${b.dataset.x}» удалено`); return; }
    if (b.dataset.w) { st.sel = st.sel === b.dataset.w ? '' : b.dataset.w; render(); if (st.sel) el('.kw-sel').scrollIntoView({block: 'nearest', behavior: 'smooth'}); return; }
    if (b.dataset.add !== undefined) {
      const i = +b.dataset.add, c = st.sug[i], topic = $(`select[data-i="${i}"]`, el('.kw-sug')).value;
      if (await op({action: 'add', topic, word: c.w}, `«${c.w}» добавлено`)) { st.sug.splice(i, 1); renderSug(); }
      return;
    }
    const a = b.dataset.a, t = (st.data && st.data.topics.find(x => x.id === st.cur)) || null;
    if (a === 'add') add();
    if (a === 'selno') { st.sel = ''; render(); }
    if (a === 'move' && t) op({action: 'move', topic: t.id, word: st.sel, to: $('select', el('.kw-sel')).value}, 'Слово перенесено');
    if (a === 'enrich') enrich();
    if (a === 'suggest') suggest();
    if (a === 'newtopic') {
      const name = await promptSheet('Новая тема', '', 'Добавить', {max: 40, placeholder: 'Например: Подземный ремонт скважин'});
      if (!name) return;
      const r = await op({action: 'add_topic', name}, 'Тема добавлена');
      if (r) { const n = r.topics.find(x => lowRu(x.name) === lowRu(name)); if (n) { st.cur = n.id; render(); el('.kw-word').focus(); } }
    }
    if (a === 'ren' && t) {
      const name = await promptSheet('Название темы', t.name, 'Переименовать', {max: 40});
      if (name && name !== t.name) op({action: 'rename', topic: t.id, name}, 'Тема переименована');
    }
    if (a === 'deltopic' && t && await confirmSheet(`Удалить тему «${t.name}» со всеми словами (${t.n})?${t.seed ? ' Встроенную тему можно вернуть кнопкой «Вернуть встроенные».' : ''}`, 'Удалить', true)) op({action: 'delete_topic', topic: t.id}, 'Тема удалена');
    if (a === 'restore' && await confirmSheet('Вернуть удалённые встроенные темы и слова? Ваши слова и слова от модели ИИ останутся.', 'Вернуть')) op({action: 'restore'}, 'Встроенные темы и слова возвращены');
    if (a === 'export') {
      try {
        const r = await Engine.get('/api/keywords/export');
        if (!r.ok) throw new Error(r.json().error || 'Не удалось выгрузить');
        await saveFile(r.blob('text/csv'), 'Ключевые слова.csv');
      } catch (err) { toast(err.message, true); }
    }
  }
  async function importCsv(f) {
    const fd = new FormData();
    fd.append('file', f, f.name);
    try {
      const r = await apiJSON('POST', '/api/keywords/import', fd);
      st.msg = `✓ Из «${f.name}» добавлено слов: ${r.added}`;
      set(r);
      toast(st.msg);
    } catch (e) { toast(e.message, true); }
  }
  async function enrich() {
    const p = pool(), llm = (st.data || {}).llm || {};
    if (!p) { toast('Сначала постройте план по своим материалам — модель возьмёт термины из них.', true); return; }
    if (llm.cloud && !await confirmSheet(`Тексты материалов будут отправлены облачной модели ${llm.name} (${llm.model}). Продолжить?`, 'Отправить')) return;
    try {
      const r = await Engine.api('POST', '/api/keywords/enrich', {json: {pool: p, doc: doc()}});
      const js = r.json();
      if (!r.ok && r.status !== 409) throw new Error(js.error || ('Ошибка ' + r.status));
      st.msg = r.status === 409 ? js.error : 'Модель пополняет базу — окно можно закрыть, работа продолжится.';
      st.watch = r.status !== 409;
      st.running = true;
      render();
    } catch (e) { toast(e.message, true, 8000); }
  }
  async function suggest() {
    const p = pool();
    if (!p) { toast('Сначала постройте план по своим материалам.', true); return; }
    st.sug = 'load'; renderSug();
    try { st.sug = (await apiJSON('POST', '/api/keywords/suggest', {pool: p})).items || []; } catch (e) { st.sug = null; toast(e.message, true); }
    renderSug();
  }

  /* сообщения движка: модель начала и закончила пополнять базу */
  function onEngine(m) {
    if (m.running) { st.running = true; st.queued = false; render(); return; }
    st.running = false; st.queued = false;
    const l = m.last || {}, byButton = st.watch;
    st.watch = false;
    if (l.error) {
      st.msg = `Не получилось: ${l.error}`;
      if (byButton) toast(st.msg, true, 8000);
    } else if ((l.added || []).length) {
      st.msg = `✓ Модель добавила ${l.added.length}: ${l.added.slice(0, 6).map(a => a.w).join(', ')}${l.added.length > 6 ? '…' : ''}`;
      toast(`🏷 База ключевых слов пополнена: +${l.added.length} (${l.added.slice(0, 3).map(a => a.w).join(', ')}${l.added.length > 3 ? '…' : ''})${l.model ? ` — модель ${l.model}` : ''}`, false, 7000);
    } else {
      st.msg = 'Модель не нашла новых терминов — всё уже есть в базе.';
      if (byButton) toast(st.msg);
    }
    if (st.sheet) load().catch(() => {}); else renderBar();
  }
  function autoQueued() { st.queued = true; renderBar(); }
  function engineRestarted() { st.running = false; st.queued = false; st.watch = false; renderBar(); }

  /* над планом: тема доклада и ключевые слова материалов */
  function renderBar() {
    const box = $('#topicBar');
    if (!box) return;
    const m = (state.spec || {}).meta || {}, tops = m.topics || [], kws = m.keywords || [];
    const run = st.running || st.queued;
    if (!state.spec || (!tops.length && !kws.length && !run)) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    box.innerHTML = `<div class="tb-head"><span class="tb-l">${tops.length ? 'Тема доклада' : 'Ключевые слова материалов'}</span><button type="button" class="tb-btn">🏷 База слов</button></div>`
      + (tops.length || kws.length ? `<div class="tb-scroll">${tops.slice(0, 2).map((t, i) => `<span class="tb-topic${i ? ' minor' : ''}">${esc(t.name)}</span>`).join('')}${kws.slice(0, 6).map(k => `<span class="tb-kw">${esc(k)}</span>`).join('')}</div>` : '')
      + (run ? `<div class="tb-run">${st.running ? 'Модель ИИ пополняет базу ключевых слов…' : 'Модель ИИ пополнит базу ключевых слов, когда телефон освободится.'}</div>` : '');
    $('.tb-btn', box).addEventListener('click', open);
  }

  /* слова-подсказки для поиска фраз к слайду: сначала те, что есть в тексте слайда */
  function forSlide(s) {
    const m = (state.spec || {}).meta || {};
    const all = [...new Set([].concat(m.keywords || [], ...(m.topics || []).map(t => t.words || [])))];
    if (!all.length) return [];
    const txt = lowRu([s.title, s.subtitle, s.lead, s.conclusion].concat((s.items || []).map(it => (it && typeof it === 'object') ? `${it.title || ''} ${it.text || ''}` : it)).join(' '));
    const inSlide = k => txt.includes(lowRu(k).slice(0, Math.max(4, Math.min(6, k.length - 2))));
    return all.filter(inSlide).concat(all.filter(k => !inSlide(k))).slice(0, 8);
  }

  return {open, onEngine, autoQueued, engineRestarted, renderBar, forSlide, get running() { return st.running; }};
})();

/* ---------------------------------------------------------------- обучение при первом открытии */
const Tour = (() => {
  const STEPS = [
    {title: 'Добро пожаловать!', text: 'За минуту покажу, как сделать презентацию прямо на телефоне. Работа сохраняется сама — в личном кабинете этого телефона.'},
    {el: '#drop', title: 'Шаг 1. Материалы', text: 'Нажмите и выберите документы Word, PDF, Excel или PowerPoint — из «Файлов», почты или облака. Можно несколько сразу.'},
    {el: '#cardHow', title: 'Шаг 2. Параметры', text: 'Оформление, титульный слайд и число слайдов — по желанию. Здесь выбирается, как строить план: по правилам (быстро и без сети) или с моделью ИИ. Любую карточку можно свернуть — нажмите на её заголовок.'},
    {el: () => (state.files.length ? $('#ctaBtn') : $('#btnSample')), title: 'Шаг 3. Построить план', text: 'Когда файлы добавлены, внизу экрана появится большая кнопка «Построить план». Нет документа под рукой — попробуйте на встроенном примере.'},
    {el: '#tabbar [data-tab=plan]', title: 'Шаг 4. План', text: 'Здесь появятся слайды. «Вид» у слайда — как показать материал; нажмите на слайд — тексты, картинки и замечание: «сделай короче». Порядок — перетащите слайд за ⋮⋮.'},
    {el: '#tabbar [data-tab=view]', title: 'Шаг 5. Просмотр и скачивание', text: 'Слайды — как в PowerPoint. Кнопка «Скачать .pptx» внизу отдаёт готовый файл: в PowerPoint, «Файлы», почту или мессенджер. «✔ Проверить» на экране плана найдёт ошибки и сверит числа с документом.'},
    {el: '#barMe', title: 'Личный кабинет', text: 'Ваши презентации и профиль. Работа сохраняется сама; на экране «Материалы» есть «💾 Сохранить» и «↺ Начать заново».'},
    {el: '#tabbar [data-tab=more]', title: 'Ещё', text: 'Библиотеки материалов и картинок, «🏷 Ключевые слова», модель ИИ, вид и справка. Обучение можно пройти снова — в личном кабинете или в «Как это работает».'},
  ];
  let i = 0, on = false, root = null;

  function maybe(hadWork) {
    if (restore('toured', 0) || (Me.user && Me.user.onboarded)) { news19(); return; }
    if (hadWork) {                                  // работал с конструктором раньше — он не новичок
      done(true);
      news19();
      return;
    }
    store('seen19', 1);
    start();
  }
  /* один раз после обновления: что нового в 1.9 */
  function news19() {
    if (restore('seen19', 0)) return;
    store('seen19', 1);
    toast('Новое в версии 1.9: слайды заполняются целиком, порядок — перетаскиванием за ⋮⋮, проще «Вид» слайда, «💾 Сохранить» и «↺ Начать заново», градиент в фигурах, у своего шаблона — выбор слайдов и цветов.', false, 10000);
  }
  function start() {
    closeAllSheets();
    App.go('materials');
    i = 0; on = true;
    if (!root) build();
    root.classList.remove('hidden');
    document.body.classList.add('touring');
    $('.tour-dots', root).innerHTML = STEPS.map(() => '<i></i>').join('');
    show();
  }
  function build() {
    root = h(`<div class="tour hidden" role="dialog" aria-modal="true" aria-labelledby="tourTitle">
      <div class="tour-spot"></div>
      <div class="tour-card">
        <div class="tour-top"><span class="tour-dots" aria-hidden="true"></span><span class="tour-pos"></span>
          <button type="button" class="icon-btn tour-x" aria-label="Закрыть обучение" title="Закрыть"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
        <h3 id="tourTitle"></h3>
        <p class="tour-text"></p>
        <div class="tour-btns"><button type="button" class="btn ghost tour-skip">Пропустить</button><button type="button" class="btn ghost tour-back">Назад</button><button type="button" class="btn primary tour-next">Далее</button></div>
      </div></div>`);
    document.body.appendChild(root);
    $('.tour-next', root).addEventListener('click', () => step(1));
    $('.tour-back', root).addEventListener('click', () => step(-1));
    $('.tour-skip', root).addEventListener('click', () => end());
    $('.tour-x', root).addEventListener('click', () => end());
    document.addEventListener('keydown', e => {
      if (!on) return;
      if (e.key === 'Escape') { e.preventDefault(); end(); } else if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1);
    });
    let t = null;
    const re = () => { clearTimeout(t); t = setTimeout(() => { if (on) place(target(STEPS[i])); }, 80); };
    window.addEventListener('resize', re);
    window.addEventListener('scroll', re, {passive: true});
  }
  function target(s) {
    const e = typeof s.el === 'function' ? s.el() : (s.el ? $(s.el) : null);
    return e && e.getClientRects().length && !e.closest('.hidden') ? e : null;
  }
  function show() {
    const s = STEPS[i], e = target(s), n = STEPS.length;
    $('#tourTitle').textContent = s.title;
    $('.tour-text', root).textContent = s.text;
    $('.tour-pos', root).textContent = `${i + 1} из ${n}`;
    $$('.tour-dots i', root).forEach((d, k) => d.classList.toggle('on', k === i));
    $('.tour-back', root).classList.toggle('hidden', i === 0);
    $('.tour-skip', root).classList.toggle('hidden', i === n - 1 || i > 0);
    $('.tour-next', root).textContent = i === n - 1 ? 'Начать работу' : (i === 0 ? 'Показать' : 'Далее');
    if (e) Materials.unfoldFor(e);                   // свёрнутая карточка — развернуть (1.9)
    if (e && !e.closest('#tabbar, .appbar, .cta')) {
      const r = e.getBoundingClientRect();
      if (r.top < 80 || r.bottom > innerHeight * 0.55) e.scrollIntoView({block: 'start'});
      if (e.getBoundingClientRect().top < 80) window.scrollBy(0, -80);
    }
    requestAnimationFrame(() => place(e));
    $('.tour-next', root).focus({preventScroll: true});
  }
  function place(e) {
    const spot = $('.tour-spot', root), card = $('.tour-card', root), pad = 6;
    card.classList.remove('top', 'bottom', 'center');
    if (!e) { spot.classList.add('none'); card.classList.add('center'); return; }
    spot.classList.remove('none');
    const r = e.getBoundingClientRect();
    let top = Math.max(2, r.top - pad), bottom = Math.min(innerHeight - 2, r.bottom + pad);
    const below = (top + bottom) / 2 <= innerHeight / 2;
    card.classList.add(below ? 'bottom' : 'top');              // карточка — с той стороны, где нет элемента
    const cr = card.getBoundingClientRect();                     // высокий элемент — подсвечена часть, не закрытая карточкой
    if (below) bottom = Math.min(bottom, cr.top - 8); else top = Math.max(top, cr.bottom + 8);
    Object.assign(spot.style, {left: Math.max(2, r.left - pad) + 'px', top: top + 'px', width: Math.min(innerWidth - 4, r.width + pad * 2) + 'px', height: Math.max(0, bottom - top) + 'px'});
  }
  function step(d) {
    const n = i + d;
    if (n >= STEPS.length) { end(); return; }
    i = Math.max(0, n);
    show();
  }
  function end() {
    if (!on) return;
    on = false;
    root.classList.add('hidden');
    document.body.classList.remove('touring');
    done(false);
    window.scrollTo({top: 0, behavior: 'smooth'});
  }
  function done(quiet) {
    store('toured', 1);
    if (Me.user && !Me.user.onboarded) Me.patch({onboarded: true}).catch(() => {});
    void quiet;
  }
  return {maybe, start, get on() { return on; }};
})();
