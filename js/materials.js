/* materials.js — экран «Материалы»: файлы и параметры плана, построение плана, справка Word. */
'use strict';
const Materials = (() => {
  const EXT_OK = OK_EXT;

  function init() {
    $('#fileInput').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
    const drop = $('#drop');
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
    $('#btnSample').addEventListener('click', () => analyze(true));
    $$('#slidesStepper button').forEach(b => b.addEventListener('click', () => {
      state.slides = Math.max(0, Math.min(60, state.slides + (+b.dataset.d) * (state.slides === 0 && +b.dataset.d > 0 ? 8 : 1)));
      if (state.slides < 3 && +b.dataset.d < 0) state.slides = 0;
      renderStepper();
    }));
    seg('#modeSeg', v => { state.mode = v; updateAi(); });
    $('#optExample').addEventListener('change', e => store('example', e.target.value));
    $('#iconShapeBox').replaceWith(Object.assign(Icons.shapesEl(), {id: 'iconShapeBox'}));
    seg('#aiLevelSeg', v => { state.aiLevel = v; });
    $('#optTpl').addEventListener('change', e => { store('tpl', e.target.value); syncTemplate(); });
    // запомненные параметры
    const o = restore('opts', {});
    if (o.event) $('#optEvent').value = o.event;
    if (o.marks) $('#optMarks').value = o.marks;
    if (o.pictures === false) $('#optPics').checked = false;
    state.slides = o.slides || 0;
    state.mode = ['ai', 'search'].includes(o.mode) ? o.mode : 'rules';
    state.aiLevel = o.ai_level === 'full' ? 'full' : 'fast';
    setSeg('#modeSeg', state.mode); setSeg('#aiLevelSeg', state.aiLevel);
    renderStepper();
    renderFiles();
  }
  function seg(sel, on) {
    $$(sel + ' button').forEach(b => b.addEventListener('click', () => { setSeg(sel, b.dataset.v); on(b.dataset.v); }));
  }
  function setSeg(sel, v) { $$(sel + ' button').forEach(b => { b.classList.toggle('on', b.dataset.v === v); b.setAttribute('aria-checked', b.dataset.v === v); }); }
  function renderStepper() { $('#optSlidesOut').textContent = state.slides ? String(state.slides) : 'Авто'; }

  function updateAi() {
    const l = state.status && state.status.llm;
    const ready = l && l.model;
    $('#aiBox').classList.toggle('hidden', state.mode !== 'ai');
    const sInfo = $('#searchInfo');
    sInfo.classList.toggle('hidden', state.mode !== 'search');
    sInfo.textContent = 'Модель поиска только подбирает готовые предложения из материалов и «📚 Библиотеки материалов» — сама ничего не пишет.'
      + (l && l.embed_model ? ` Модель поиска: ${l.embed_model}.` : ' Модель поиска не задана — фразы подбираются по совпадению слов. Задать её: «Ещё» → «Модель ИИ».');
    $('#aiInfo').innerHTML = !ready ? 'Модель ИИ не настроена. <a href="#" id="aiSetup">Настроить</a> — или постройте план без ИИ.'
      : `${l.cloud ? '☁ Облачная' : 'Локальная'} модель: <b>${esc(l.provider_name || l.provider)}</b> · ${esc(l.model)}${l.cloud ? '<br><small>Текст документов отправляется во внешний сервис.</small>' : ''} · <a href="#" id="aiSetup">изменить</a>`;
    const a = $('#aiSetup');
    if (a) a.addEventListener('click', e => { e.preventDefault(); More.openAi(); });
  }

  function addFiles(list) {
    let bad = [];
    for (const f of Array.from(list || [])) {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (ext === 'json' && f.name.endsWith('.json')) {          // сохранённый план → открыть планом
        f.text().then(t => {
          try { const sp = JSON.parse(t.replace(/^﻿/, '')); if (sp && Array.isArray(sp.slides)) { Plan.open(sp, null, 'План открыт из файла'); return; } } catch (e) { /* не план */ }
          pushFile(f);
        });
        continue;
      }
      if (!EXT_OK.includes(ext)) { bad.push(f.name); continue; }
      pushFile(f);
    }
    if (bad.length) toast(`Не подходит: ${bad.join(', ')}. Нужны Word (.docx), PDF, PowerPoint (.pptx), Excel, CSV, JSON или текст.`, true, 7000);
  }
  function pushFile(f) {
    if (!state.files.some(x => x.name === f.name && x.size === f.size)) state.files.push(f);
    renderFiles();
  }
  function renderFiles() {
    const ul = $('#fileList');
    ul.innerHTML = '';
    state.files.forEach((f, i) => {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      const li = h(`<li><span class="ftype ${esc(ext)}">${esc(ext.toUpperCase().slice(0, 4))}</span>
        <span class="fname"><b></b><small>${fmtSize(f.size)}</small></span>
        <button class="icon-btn" type="button" aria-label="Убрать файл">✕</button></li>`);
      $('b', li).textContent = f.name;
      $('button', li).addEventListener('click', () => { state.files.splice(i, 1); renderFiles(); });
      ul.appendChild(li);
    });
    $('#btnSample').classList.toggle('hidden', state.files.length > 0);
    App.updateCta();
  }
  function fmtSize(n) { return n > 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' МБ' : Math.max(1, Math.round(n / 1e3)) + ' КБ'; }

  function options() {
    const o = {
      title: $('#optTitle').value.trim(), subtitle: $('#optSubtitle').value.trim(), event: $('#optEvent').value.trim(),
      date: $('#optDate').value.trim(), target_slides: state.slides, mode: state.mode, ai_level: state.aiLevel,
      focus: $('#optFocus').value.trim(), agenda: $('#optAgenda').value, sections: $('#optSections').value,
      conclusions: $('#optConcl').checked, data_tables: $('#optDataTables').checked, animations: $('#optAnim').checked,
      marks: $('#optMarks').value, remarks: $('#optRemarks').value.trim(), pictures: $('#optPics').checked,
      example: $('#optExample').value || 'auto',
    };
    store('opts', {event: o.event, slides: o.target_slides, mode: o.mode, ai_level: o.ai_level, marks: o.marks, pictures: o.pictures});
    return o;
  }
  function aiLabel(o) {
    const l = state.status && state.status.llm;
    if (o.mode === 'search') return 'Анализирую документы и подбираю готовые фразы…';
    if (o.mode !== 'ai') return 'Анализирую документы…';
    return l && l.cloud ? `Отправляю документы облачной модели ${l.provider_name}…` : 'Отправляю документы модели ИИ…';
  }

  async function analyze(sample) {
    if (!sample && !state.files.length) { toast('Сначала добавьте файлы — или попробуйте на примере.', true); return; }
    const o = options();
    if (o.mode === 'ai' && !(state.status && state.status.llm && state.status.llm.model)) {
      toast('Модель ИИ не настроена — план будет построен по правилам.', true); o.mode = 'rules';
    }
    const fd = new FormData();
    state.files.forEach(f => fd.append('files', f, f.name));
    fd.append('options', JSON.stringify(o));
    Busy.on(aiLabel(o), {cancel: cancelEngine});
    try {
      const data = await runJob(sample ? '/api/sample' : '/api/analyze', fd, 'Анализ');
      state.projectId = null;
      Plan.open(data.spec, data, null);
      const rd = (data.info && data.info.remarks_done) || [];
      toast(`План готов: ${data.spec.slides.length} слайдов` + (rd.length ? ` · по замечаниям: ${rd.join(', ')}` : ''), false, 5000);
      App.go('plan');
    } catch (e) {
      if (!e.cancelled) toast(e.message, true, 9000); else toast('Анализ отменён.');
    } finally { Busy.off(); }
  }

  async function report() {
    if (!state.files.length) { toast('Справка составляется по материалам — сначала добавьте файлы на экране «Материалы».', true, 6000); App.go('materials'); return; }
    const r = {author: restore('author', ''), phone: restore('phone', ''), pages: restore('pages', '')};
    const body = h('<div></div>');
    body.appendChild(h(`<p class="hint" style="margin-top:0">Справка в Word по загруженным материалам (${state.files.length} ${state.files.length === 1 ? 'файл' : 'файла(ов)'}): краткое содержание, основные цифры и выводы. ${state.mode === 'ai' ? 'Пишет модель ИИ.' : 'Составляется по правилам, без ИИ.'}</p>`));
    body.appendChild(field('Исполнитель', r, 'author', {placeholder: 'Фамилия И. О.'}));
    body.appendChild(field('Телефон исполнителя', r, 'phone', {inputmode: 'tel'}));
    body.appendChild(field('Листов справки', r, 'pages', {inputmode: 'numeric', placeholder: 'без ограничения'}));
    const go = h('<button class="btn primary">Подготовить справку</button>');
    const sh = openSheet({title: 'Справка Word', body, foot: go});
    go.onclick = async () => {
      store('author', r.author); store('phone', r.phone); store('pages', r.pages);
      sh.close();
      const o = Object.assign(options(), {author: r.author, phone: r.phone, pages: Math.max(0, Math.min(30, parseInt(r.pages || '0', 10) || 0))});
      const fd = new FormData();
      state.files.forEach(f => fd.append('files', f, f.name));
      fd.append('options', JSON.stringify(o));
      Busy.on('Готовлю справку Word…', {cancel: cancelEngine});
      try {
        const res = await runJob('/api/report', fd, 'Справка');
        const f = await Engine.get(res.file);
        if (!f.ok) throw new Error(f.json().error || 'Справка не получена');
        Busy.off();
        await saveFile(f.blob('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), res.filename || 'Справка.docx');
        toast(`Справка готова: ${res.filename}` + ((res.warnings || []).length ? ` · ${res.warnings[0]}` : ''), false, 7000);
      } catch (e) {
        if (!e.cancelled) toast(e.message, true, 9000);
      } finally { Busy.off(); }
    };
  }

  /* шаблоны оформления в списке параметров */
  function renderTemplates() {
    const sel = $('#optTpl');
    const cur = restore('tpl', '');
    sel.innerHTML = state.templates.map(t => `<option value="${esc(t.id === 'builtin' || t.builtin ? '' : t.id)}">${esc(t.name)}</option>`).join('')
      || '<option value="">Корпоративный (АО «Зарубежнефть»)</option>';
    sel.value = cur;
    if (sel.value !== cur) sel.value = '';
    syncTemplate();
  }
  function syncTemplate() {
    const id = $('#optTpl').value;
    const t = state.templates.find(x => (x.builtin ? '' : x.id) === id);
    $('#barSub').textContent = t && !t.builtin ? `Шаблон «${t.name}»` : 'Корпоративный шаблон АО «Зарубежнефть»';
    $('#moreTplSub').textContent = t ? `Сейчас: ${t.name}` : 'Корпоративный или свой .pptx/.potx';
    if (state.spec && (state.spec.meta.template || '') !== id) { state.spec.meta.template = id; planChanged(); }
  }
  function template() { return $('#optTpl').value; }

  /* «План по образцу»: образцы — презентации PowerPoint из библиотеки материалов */
  function examples(items) {
    const sel = $('#optExample');
    const decks = (items || []).filter(e => (e.deck || 0) >= 2);
    const cur = sel.value && sel.value !== 'auto' ? sel.value : restore('example', 'auto');
    sel.innerHTML = '<option value="auto">похожая презентация из библиотеки</option><option value="off">не использовать</option>'
      + decks.map(e => `<option value="${esc(e.id)}">образец: ${esc(e.name)}</option>`).join('');
    sel.value = [...sel.options].some(x => x.value === cur) ? cur : 'auto';
    $('#exampleHint').innerHTML = decks.length
      ? `Вид и порядок слайдов — как у похожих слайдов ваших прежних презентаций. Образцов в библиотеке: <b>${decks.length}</b>.`
      : 'Вид и порядок слайдов — как у похожих слайдов ваших прежних презентаций. Добавьте их в «📚 Библиотеку материалов» (PowerPoint, .pptx).';
  }

  return {init, analyze, report, updateAi, renderTemplates, template, addFiles, renderFiles, options, examples};
})();
