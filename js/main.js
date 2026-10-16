/* main.js — запуск: движок, разделы и главная кнопка экрана, обновления и установка. */
'use strict';
const App = (() => {
  const TABS = {
    materials: {scr: '#scrMaterials', title: 'Конструктор презентаций'},
    plan: {scr: '#scrPlan', title: 'План презентации'},
    view: {scr: '#scrView', title: 'Просмотр'},
    more: {scr: '#scrMore', title: 'Ещё'},
  };
  let installPrompt = null;

  function go(tab) {
    if (!TABS[tab]) return;
    state.tab = tab;
    Object.entries(TABS).forEach(([k, t]) => $(t.scr).classList.toggle('hidden', k !== tab));
    $$('#tabbar button').forEach(b => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'); });
    $('#barTitle').textContent = tab === 'plan' && state.spec ? (state.spec.meta.title || 'План презентации') : TABS[tab].title;
    if (tab === 'view') View.render();
    if (tab === 'more') More.refresh();
    updateCta();
    window.scrollTo(0, 0);
  }

  /* главная кнопка внизу экрана: одно понятное следующее действие */
  function updateCta() {
    const cta = $('#cta'), b1 = $('#ctaBtn'), b2 = $('#cta2Btn');
    const t = state.tab, has = !!state.spec;
    let main = null, second = null;
    if (t === 'materials') {
      main = state.files.length ? ['Построить план', () => Materials.analyze(false)] : null;
      if (!state.files.length && has) main = ['Открыть план', () => go('plan')];
      second = state.files.length && has ? ['К плану', () => go('plan')] : null;
    } else if (t === 'plan' || t === 'view') {
      main = has ? ['Скачать .pptx', () => Plan.build()] : null;
      second = has && t === 'plan' ? ['Смотреть', () => go('view')] : null;
    }
    cta.classList.toggle('hidden-cta', !main);
    if (main) { b1.textContent = main[0]; b1.onclick = main[1]; }
    b2.classList.toggle('hidden', !second);
    if (second) { b2.textContent = second[0]; b2.onclick = second[1]; }
  }

  async function refreshStatus() {
    state.status = await apiJSON('GET', '/api/status');
    Materials.updateAi();
    More.refresh();
  }

  function newProject() {
    state.spec = null; state.info = null; state.warnings = []; state.projectId = null; state.files = [];
    store('lastProject', null);
    Thumbs.reset();
    $('#optTitle').value = ''; $('#optSubtitle').value = ''; $('#optDate').value = '';
    Materials.renderFiles();
    Plan.render();
    go('materials');
    toast('Новая презентация: добавьте материалы');
  }

  /* ---------------------------------------------------------------- запуск */
  async function boot() {
    const sub = $('#splashSub'), bar = $('#splashBar');
    let first = !restore('booted', false);
    if (!first) $('#splashNote').textContent = 'Запуск занимает несколько секунд.';
    Engine.onBoot(m => {
      if (m.type === 'boot') { sub.textContent = m.stage === 'Готово' ? 'Почти готово…' : `${m.stage}…`; bar.style.width = `${m.pct}%`; }
      if (m.type === 'fatal') {
        sub.textContent = 'Не удалось запустить конструктор';
        $('#splashNote').innerHTML = `${esc(m.error)}<br><br>Проверьте интернет при первом запуске и обновите страницу. Нужен Safari 15 или Chrome 100 и новее.`;
      }
    });
    Engine.start();
    try {
      await Engine.ready();
      const [st, lay, tp] = await Promise.all([apiJSON('GET', '/api/status'), apiJSON('GET', '/api/layouts'), apiJSON('GET', '/api/templates')]);
      state.status = st;
      lay.forEach(l => { state.layouts[l.id] = l; });
      state.layoutList = lay;
      state.templates = tp.templates || [];
      state.templateRoles = tp.roles || {};
      Materials.renderTemplates();
      Materials.updateAi();
      store('booted', true);
      await restoreLast();
      $('#splash').classList.add('gone');
      setTimeout(() => $('#splash').remove(), 500);
    } catch (e) {
      sub.textContent = 'Не удалось запустить конструктор';
      $('#splashNote').textContent = e.message;
      return;
    }
    // движок мог перезапуститься (отмена долгой работы) — сведения о модели и шаблонах те же: они в хранилище
  }
  async function restoreLast() {
    const id = restore('lastProject', null);
    if (!id) return;
    try {
      const p = await DB.get(id);
      if (!p || !p.spec) return;
      state.projectId = p.id;
      Plan.open(p.spec, {info: p.info, warnings: p.warnings}, null);
      state.projectId = p.id;
      go('plan');
    } catch (e) { console.warn('restore', e); }
  }

  /* ---------------------------------------------------------------- обновления (service worker) */
  let reg = null;
  function sw() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register('sw.js').then(r => {
      reg = r;
      const offer = w => {
        if (!navigator.serviceWorker.controller) return;           // первая установка — обновлять нечего
        const t = h('<div class="toast"><span>Есть новая версия конструктора. Нажмите, чтобы обновить.</span></div>');
        t.addEventListener('click', () => { w.postMessage('skipWaiting'); t.remove(); });
        $('#toasts').appendChild(t);
      };
      if (r.waiting) offer(r.waiting);
      r.addEventListener('updatefound', () => {
        const w = r.installing;
        w && w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
      });
    }).catch(e => console.warn('sw', e));
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
  }
  async function checkUpdate(manual) {
    if (!reg) { if (manual) toast(window.isSecureContext ? 'Обновления проверяются автоматически.' : 'Конструктор открыт с компьютера — он всегда самой новой версии.'); return; }
    try { await reg.update(); } catch (e) { /* нет сети */ }
    if (manual && !reg.waiting && !reg.installing) toast('Установлена последняя версия.');
  }

  function init() {
    $$('#tabbar button').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
    $$('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
    $('#barAction').addEventListener('click', () => More.theme());
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); App.installPrompt = e; });
    // клавиатура на телефоне закрывает главную кнопку — прячем её, пока печатают
    if (window.visualViewport) visualViewport.addEventListener('resize', () => {
      document.body.classList.toggle('kb', window.innerHeight - visualViewport.height > 150);
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && state.spec && state.dirty) saveProject(); });
    Materials.init();
    Plan.init();
    More.init();
    go('materials');
    sw();
    boot();
  }
  return {init, go, updateCta, refreshStatus, newProject, checkUpdate, installPrompt};
})();

document.addEventListener('DOMContentLoaded', App.init);
