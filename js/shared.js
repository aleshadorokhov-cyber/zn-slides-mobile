/* shared.js — общие данные и функции, перенесённые из веб-интерфейса Windows-версии (web/static/app.js 1.6.2):
 * миниатюры макетов, виды диаграмм, текст хода работы, преобразование элементов. */
'use strict';
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])); }
const NUMERIC = ['kpi', 'gauge', 'bars', 'bubbles', 'funnel', 'hero'];
const CENTERED = ['cycle', 'target', 'hub', 'pillars', 'tree', 'petals', 'mindmap', 'converge', 'fishbone'];
const LABELED = ['timeline', 'roadmap', 'gantt', 'path', 'checklist', 'well'];   // у элемента есть срок, статус или глубина (label)
const CENTER_LABEL = { target: 'Цель (в центре)', cycle: 'Центральная идея', hub: 'Центр', pillars: '«Крыша» — общая цель',
  tree: 'Корень структуры', petals: 'Центральная тема', mindmap: 'Центральная тема', converge: 'Результат (справа)',
  fishbone: 'Следствие или проблема («голова рыбы»)' };
const OK_EXT = ['docx', 'pdf', 'pptx', 'xlsx', 'xlsm', 'csv', 'json', 'txt', 'md'];
const META = ['title', 'end', 'section', 'agenda'];

function fmtTime(sec) {
  sec = Math.round(sec || 0);
  return sec >= 60 ? `${Math.floor(sec / 60)} мин ${String(sec % 60).padStart(2, '0')} с` : `${sec} с`;
}
function fmtK(n) { return Number(n || 0).toLocaleString('ru-RU'); }
/* текст индикатора по событию прогресса с сервера */
function progressText(p, elapsed) {
  const ph = p.phase;
  if (ph === 'read') return [p.file ? `Читаю «${p.file}»…` : 'Читаю документы…',
    (p.slides ? `Слайд <b>${p.slide}</b> из <b>${p.slides}</b>` : p.images ? `Сохраняю рисунки презентации: <b>${p.images}</b>` : '') +
    (elapsed ? `${p.slides || p.images ? ' · ' : ''}прошло ${fmtTime(elapsed)}` : '')];
  if (ph === 'prompt') return [`Готовлю выжимку для модели…`, `В запросе ≈ <b>${fmtK(p.tokens_est)}</b> токенов`];
  if (ph === 'wait' && p.cloud) return [`Облачная модель ${esc(p.provider || '')} читает документ…`,
    `Запрос ≈ <b>${fmtK(p.prompt_tokens)}</b> токенов отправлен во внешний сервис · прошло ${fmtTime(elapsed)}`];
  if (ph === 'think') return ['Модель рассуждает…', `Черновик рассуждений: <b>${fmtK(p.tokens)}</b> фрагментов · прошло ${fmtTime(elapsed)}`];
  if (ph === 'wait') return ['Модель читает документ…',
    `Запрос ≈ <b>${fmtK(p.prompt_tokens)}</b> токенов · прошло ${fmtTime(elapsed)}\nМодель загружается в память и обрабатывает выжимку — ответ ещё не начат.\nНа процессоре это может занять несколько минут.`];
  if (ph === 'retry') return ['Ответ был не в формате JSON — прошу модель повторить…', `прошло ${fmtTime(elapsed)}`];
  if (p.kind === 'report' && ph === 'gen') return ['Модель пишет справку…',
    `Написано <b>${fmtK(p.tokens)}</b> токенов${p.sections ? ` · разделов: <b>${p.sections}</b>` : ''} · прошло ${fmtTime(elapsed)}`];
  if (ph === 'embed') return ['Готовлю поиск по смыслу…', `Фраз: <b>${fmtK(p.done || 0)}</b> из ${fmtK(p.total || 0)}${elapsed ? ` · прошло ${fmtTime(elapsed)}` : ''}`];
  if (ph === 'found') return ['Подбираю готовые фразы к слайдам…', elapsed ? `прошло ${fmtTime(elapsed)}` : ''];
  if (ph === 'write') return ['Собираю документ Word…', elapsed ? `прошло ${fmtTime(elapsed)}` : ''];
  if (ph === 'gen') return ['Модель составляет план…',
    `Написано <b>${fmtK(p.tokens)}</b> токенов · слайдов в ответе: <b>${p.slides || 0}</b> · прошло ${fmtTime(elapsed)}`];
  if (ph === 'done') return ['Подставляю данные из документа…', `прошло ${fmtTime(elapsed)}`];
  if (ph === 'draw') return [`Модель рисует иллюстрацию ${p.i} из ${p.n}…`,
    `Слайд «${esc(p.title || '')}»${p.tokens ? ` · написано <b>${fmtK(p.tokens)}</b> токенов рисунка` : ''} · прошло ${fmtTime(elapsed)}`];
  return ['Анализирую документы…', elapsed ? `прошло ${fmtTime(elapsed)}` : ''];
}
function num(v) {
  if (v === null || v === undefined) return null;
  // пробелы-разделители разрядов, запятая как десятичный знак, «−» (U+2212) и «–» как минус
  const s = String(v).replace(/[\s\u00a0\u202f]/g, '').replace(/^[\u2212\u2013]/, '-').replace(',', '.').replace(/[%₽]$/, '');
  const x = parseFloat(s);
  return isFinite(x) ? x : null;
}
const PIC_MAX = 3;                                        // столько картинок помещается на слайд
const NO_PIC = ['title', 'section', 'end', 'agenda', 'table', 'chart', 'own'];   // сюда картинки не ставим
const picKey = im => (im && (im.picture ? 'p:' + im.picture : (im.upload ? 'u:' + im.upload : ''))) || '';
const keyToImage = k => (k.startsWith('u:') ? { upload: k.slice(2), caption: '' } : { picture: k.slice(2), caption: '' });
const N = '#00326E', B = '#0078AE', G = '#4BAF46', D = '#0A8F2D', L = '#D9DEE6', S = '#EEF1F5', LG = '#9AC854';
const hdr = `<rect x="5" y="4" width="26" height="3" rx="1" fill="${N}"/>`;
const TH = {
  title: `<rect x="5" y="14" width="30" height="4" fill="${N}"/><rect x="5" y="20" width="22" height="2.5" fill="${G}"/><circle cx="64" cy="36" r="17" fill="${G}" opacity=".75"/><circle cx="70" cy="40" r="13" fill="${B}" opacity=".8"/>`,
  agenda: hdr + [0, 1, 2, 3].map(i => `<circle cx="9" cy="${14 + i * 6.5}" r="2.2" fill="${i < 2 ? N : G}"/><rect x="14" y="${13 + i * 6.5}" width="${30 - i * 3}" height="2" fill="${L}"/>`).join(''),
  section: `<rect width="72" height="40" fill="${N}"/><text x="6" y="22" font-size="11" font-weight="700" fill="${LG}">01</text><rect x="6" y="27" width="40" height="3.5" fill="#fff"/>`,
  cards: hdr + [0, 1, 2].map(i => `<rect x="${5 + i * 21.5}" y="12" width="19" height="23" rx="1.5" fill="#fff" stroke="${L}"/><rect x="${5 + i * 21.5}" y="12" width="19" height="1.5" fill="${[N, B, G][i]}"/><circle cx="${10 + i * 21.5}" cy="18" r="3" fill="${[N, B, G][i]}"/><rect x="${7 + i * 21.5}" y="24" width="14" height="1.6" fill="${L}"/><rect x="${7 + i * 21.5}" y="28" width="11" height="1.6" fill="${L}"/>`).join(''),
  list: hdr + [0, 1, 2, 3, 4, 5].map(i => `<circle cx="${8 + (i > 2 ? 33 : 0)}" cy="${14 + (i % 3) * 8}" r="2" fill="${i < 3 ? N : G}"/><rect x="${12 + (i > 2 ? 33 : 0)}" y="${13 + (i % 3) * 8}" width="24" height="2" fill="${L}"/>`).join(''),
  process: hdr + [0, 1, 2, 3].map(i => `<path d="M${5 + i * 15.5} 11 h13 l3 3.5 l-3 3.5 h-13 l3 -3.5z" fill="${[N, B, D, G][i]}"/><rect x="${6 + i * 15.5}" y="20" width="13" height="15" fill="${S}"/>`).join(''),
  timeline: hdr + `<rect x="4" y="23" width="64" height="1.6" fill="${B}"/>` + [0, 1, 2, 3, 4].map(i => `<circle cx="${8 + i * 14}" cy="23.8" r="2.6" fill="${[N, B, B, D, G][i]}"/><rect x="${4 + i * 14}" y="${i % 2 ? 28 : 11}" width="13" height="8" fill="${S}"/>`).join(''),
  cycle: hdr + `<circle cx="36" cy="24" r="10" fill="none" stroke="${N}" stroke-width=".8"/><circle cx="36" cy="24" r="5.5" fill="${N}"/>` + [0, 1, 2, 3, 4].map(i => { const a = i * 72 * Math.PI / 180; return `<circle cx="${36 + 10 * Math.sin(a)}" cy="${24 - 10 * Math.cos(a)}" r="2.4" fill="${[N, B, B, D, G][i]}"/>`; }).join('') + `<rect x="52" y="14" width="14" height="2" fill="${L}"/><rect x="6" y="26" width="14" height="2" fill="${L}"/>`,
  target: hdr + `<circle cx="36" cy="24" r="12" fill="#EBF0D6"/><circle cx="36" cy="24" r="7.5" fill="${N}"/>` + [[52, 16], [55, 25], [52, 33], [20, 33], [17, 25], [20, 16]].map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="${[N, B, B, D, G, G][i]}"/>`).join(''),
  kpi: hdr + [0, 1, 2].map(i => `<rect x="${5 + i * 21.5}" y="12" width="19" height="22" rx="1.5" fill="${[N, B, G][i]}"/><text x="${8 + i * 21.5}" y="25" font-size="8" font-weight="700" fill="#fff">${['85', '64', '12'][i]}</text>`).join(''),
  table: hdr + `<rect x="5" y="11" width="62" height="4" fill="${N}"/>` + [0, 1, 2, 3].map(i => `<rect x="5" y="${16 + i * 5}" width="62" height="4.4" fill="${i % 2 ? S : '#fff'}" stroke="${L}" stroke-width=".3"/>`).join(''),
  chart: hdr + [8, 14, 11, 18, 21].map((h, i) => `<rect x="${7 + i * 7.5}" y="${35 - h}" width="5" height="${h}" fill="${i === 4 ? G : N}"/>`).join('') + `<rect x="48" y="12" width="19" height="6" fill="${S}"/><rect x="48" y="20" width="19" height="6" fill="${S}"/><rect x="48" y="28" width="19" height="6" fill="${S}"/>`,
  compare: hdr + `<rect x="5" y="11" width="28" height="4" fill="${L}"/><rect x="39" y="11" width="28" height="4" fill="${G}"/>` + [0, 1, 2].map(i => `<rect x="5" y="${17 + i * 6}" width="28" height="5" fill="${S}"/><rect x="39" y="${17 + i * 6}" width="28" height="5" fill="#EBF0D6"/><path d="M34 ${19.5 + i * 6} h4" stroke="${G}"/>`).join(''),
  text: hdr + `<rect x="5" y="11" width="24" height="25" fill="${N}"/><rect x="8" y="17" width="16" height="2.4" fill="#fff"/><rect x="8" y="21" width="12" height="2.4" fill="#fff"/>` + [0, 1, 2].map(i => `<rect x="33" y="${13 + i * 8}" width="1" height="6" fill="${G}"/><rect x="36" y="${14 + i * 8}" width="30" height="1.8" fill="${L}"/><rect x="36" y="${17 + i * 8}" width="22" height="1.8" fill="${L}"/>`).join(''),
  conclusions: hdr + [0, 1, 2, 3].map(i => `<rect x="${5 + (i % 2) * 32}" y="${11 + Math.floor(i / 2) * 13}" width="30" height="11.5" fill="${[N, B, D, G][i]}"/><text x="${29 + (i % 2) * 32}" y="${19 + Math.floor(i / 2) * 13}" font-size="7" fill="#fff" opacity=".35" font-weight="700">${i + 1}</text>`).join(''),
  pyramid: hdr + `<path d="M36 10 L50 36 H22 Z" fill="${N}"/><path d="M29.5 22 H42.5 L46 29 H26 Z" fill="${B}"/><path d="M26 29 H46 L50 36 H22 Z" fill="${G}"/>` + [0, 1, 2].map(i => `<rect x="54" y="${13 + i * 8}" width="13" height="2" fill="${L}"/>`).join(''),
  funnel: hdr + `<path d="M14 11 H50 L45 19 H19 Z" fill="${N}"/><path d="M19 20 H45 L40 28 H24 Z" fill="${B}"/><path d="M24 29 H40 L36 36 H28 Z" fill="${G}"/>` + [0, 1, 2].map(i => `<rect x="53" y="${14 + i * 8}" width="14" height="2" fill="${L}"/>`).join(''),
  stairs: hdr + [0, 1, 2, 3].map(i => `<rect x="${5 + i * 15.5}" y="${36 - (i + 1) * 5.5}" width="15" height="${(i + 1) * 5.5}" fill="${[N, B, D, G][i]}"/>`).join(''),
  matrix: hdr + [0, 1, 2, 3].map(i => `<rect x="${5 + (i % 2) * 32}" y="${11 + Math.floor(i / 2) * 13}" width="30" height="11.5" rx="1.5" fill="${S}"/><rect x="${5 + (i % 2) * 32}" y="${11 + Math.floor(i / 2) * 13}" width="30" height="3" fill="${[N, B, D, G][i]}"/>`).join(''),
  hub: hdr + `<circle cx="36" cy="24" r="7" fill="${N}"/>` + [[16, 15], [56, 15], [16, 33], [56, 33]].map((p, i) => `<path d="M36 24 L${p[0]} ${p[1]}" stroke="${[N, B, D, G][i]}" stroke-width=".8"/><circle cx="${p[0]}" cy="${p[1]}" r="3.4" fill="${[N, B, D, G][i]}"/>`).join(''),
  honeycomb: hdr + [[18, 18], [30, 18], [42, 18], [24, 29], [36, 29]].map((p, i) => `<path d="M${p[0] - 5} ${p[1]} l2.5 -4.3 h5 l2.5 4.3 l-2.5 4.3 h-5 z" fill="${[N, B, B, D, G][i]}"/>`).join('') + [0, 1, 2].map(i => `<rect x="52" y="${13 + i * 8}" width="15" height="2" fill="${L}"/>`).join(''),
  layers: hdr + [0, 1, 2, 3].map(i => `<rect x="${5 + (3 - i) * 2.5}" y="${11 + i * 6.5}" width="${62 - (3 - i) * 5}" height="5.5" rx="1.5" fill="${[N, B, D, G][i]}"/>`).join(''),
  pillars: hdr + `<rect x="5" y="11" width="62" height="5" rx="1.5" fill="${N}"/>` + [0, 1, 2].map(i => `<rect x="${7 + i * 20.5}" y="18" width="17" height="15" fill="${S}"/><circle cx="${15.5 + i * 20.5}" cy="22" r="2.5" fill="${[B, D, G][i]}"/>`).join('') + `<rect x="5" y="34" width="62" height="2" fill="${G}"/>`,
  roadmap: hdr + `<rect x="4" y="21" width="64" height="5" rx="2.5" fill="${N}"/>` + [0, 1, 2, 3].map(i => `<circle cx="${12 + i * 16}" cy="23.5" r="2.6" fill="#fff" stroke="${[N, B, D, G][i]}"/><rect x="${6 + i * 16}" y="${i % 2 ? 29 : 12}" width="12" height="6" fill="${S}"/>`).join(''),
  gears: hdr + `<circle cx="20" cy="25" r="9" fill="${N}"/><circle cx="20" cy="25" r="4" fill="#fff"/><circle cx="33" cy="16" r="6" fill="${B}"/><circle cx="33" cy="16" r="2.5" fill="#fff"/><circle cx="32" cy="32" r="5" fill="${G}"/>` + [0, 1, 2].map(i => `<rect x="45" y="${13 + i * 8}" width="22" height="2" fill="${L}"/>`).join(''),
  venn: hdr + `<circle cx="27" cy="20" r="8" fill="${N}" opacity=".7"/><circle cx="21" cy="29" r="8" fill="${B}" opacity=".7"/><circle cx="33" cy="29" r="8" fill="${G}" opacity=".7"/>` + [0, 1, 2].map(i => `<rect x="47" y="${14 + i * 8}" width="20" height="2" fill="${L}"/>`).join(''),
  gauge: hdr + [0, 1, 2].map(i => `<path d="M${9 + i * 21.5} 30 a8 8 0 0 1 16 0" fill="none" stroke="${L}" stroke-width="3"/><path d="M${9 + i * 21.5} 30 a8 8 0 0 1 ${[12, 14, 9][i]} -6" fill="none" stroke="${[N, B, G][i]}" stroke-width="3"/>`).join(''),
  bars: hdr + [0, 1, 2, 3].map(i => `<rect x="5" y="${12 + i * 6}" width="14" height="2" fill="${L}"/><rect x="22" y="${11.5 + i * 6}" width="42" height="3" rx="1.5" fill="${S}"/><rect x="22" y="${11.5 + i * 6}" width="${[40, 30, 22, 12][i]}" height="3" rx="1.5" fill="${[N, B, D, G][i]}"/>`).join(''),
  bubbles: hdr + [[14, 24, 8], [32, 25, 6.5], [47, 26, 5], [60, 27, 3.8]].map((c, i) => `<circle cx="${c[0]}" cy="${c[1]}" r="${c[2]}" fill="${[N, B, D, G][i]}"/>`).join(''),
  tree: hdr + `<rect x="24" y="10" width="24" height="5" rx="1.5" fill="${N}"/><path d="M36 15 V18 M12 18 H60 M12 18 V21 M28 18 V21 M44 18 V21 M60 18 V21" stroke="${N}" stroke-width=".7" fill="none"/>` + [0, 1, 2, 3].map(i => `<rect x="${5 + i * 16}" y="21" width="14" height="4" fill="${[N, B, D, G][i]}"/><rect x="${6 + i * 16}" y="27" width="12" height="3" fill="${S}"/><rect x="${6 + i * 16}" y="31.5" width="12" height="3" fill="${S}"/>`).join(''),
  image: hdr + `<rect x="5" y="11" width="38" height="25" fill="${S}"/><path d="M8 33 L18 22 L25 29 L30 24 L40 33 Z" fill="${B}"/><circle cx="34" cy="17" r="3" fill="${G}"/>` + [0, 1, 2].map(i => `<circle cx="49" cy="${15 + i * 8}" r="1.8" fill="${[N, B, G][i]}"/><rect x="53" y="${14 + i * 8}" width="14" height="2" fill="${L}"/>`).join(''),
  // дополнительные схемы версии 1.4
  swot: hdr + [0, 1, 2, 3].map(i => `<rect x="${5 + (i % 2) * 32}" y="${11 + Math.floor(i / 2) * 13}" width="30" height="11.5" rx="1.5" fill="${i % 3 ? S : '#EBF0D6'}"/><rect x="${i % 2 ? 60 : 5}" y="${11 + Math.floor(i / 2) * 13}" width="7" height="11.5" rx="1.5" fill="${[D, N, G, B][i]}"/><text x="${i % 2 ? 61.5 : 6.5}" y="${19.5 + Math.floor(i / 2) * 13}" font-size="6" font-weight="700" fill="#fff">${'SWOT'[i]}</text>`).join('') + `<circle cx="36" cy="23.5" r="4.5" fill="${N}" stroke="#fff" stroke-width="1.2"/>`,
  fishbone: hdr + `<rect x="5" y="23" width="50" height="1.4" fill="${N}"/><path d="M55 17 h9 l4 6.7 l-4 6.7 h-9 z" fill="${N}"/>` + [0, 1, 2, 3].map(i => `<path d="M${14 + (i >> 1) * 20} ${i % 2 ? 34 : 13} L${24 + (i >> 1) * 20} 23.7" stroke="${[N, B, D, G][i]}" stroke-width="1"/><rect x="${7 + (i >> 1) * 20}" y="${i % 2 ? 33 : 10}" width="14" height="3.5" rx="1.7" fill="${[N, B, D, G][i]}"/>`).join(''),
  gantt: hdr + `<rect x="24" y="10" width="43" height="3" rx="1" fill="${N}"/>` + [0, 1, 2, 3].map(i => `<rect x="5" y="${16 + i * 5.5}" width="15" height="2" fill="${L}"/><rect x="${25 + [0, 8, 16, 26][i]}" y="${15.5 + i * 5.5}" width="${[12, 14, 18, 15][i]}" height="3" rx="1.5" fill="${[N, B, D, G][i]}"/>`).join(''),
  risk: hdr + [0, 1, 2].map(r => [0, 1, 2].map(c => `<rect x="${6 + c * 8.5}" y="${11 + r * 8.5}" width="8" height="8" rx="1" fill="${['#DCEFD0', '#FBE7B5', '#F6CBC5'][Math.min(2, Math.max(0, Math.round(((2 - r) + c) / 2)))]}"/>`).join('')).join('') + `<circle cx="27" cy="15" r="2" fill="${N}"/><circle cx="18" cy="24" r="2" fill="${N}"/>` + [0, 1, 2].map(i => `<rect x="36" y="${12 + i * 8}" width="31" height="6.5" rx="1" fill="#fff" stroke="${L}" stroke-width=".4"/><rect x="36" y="${12 + i * 8}" width="1.2" height="6.5" fill="${['#C8483A', '#E3A21A', G][i]}"/>`).join(''),
  iceberg: hdr + `<rect x="4" y="19" width="64" height="18" rx="1.5" fill="${B}" opacity=".35"/><path d="M33 10 L37 11 L41 19 H29 Z" fill="#fff" stroke="${B}" stroke-width=".5"/><path d="M29 19 H41 L46 26 L42 34 L32 35 L25 29 Z" fill="#F2F8FC" stroke="${B}" stroke-width=".5"/>` + [[50, 13], [8, 24], [50, 27]].map(p => `<rect x="${p[0]}" y="${p[1]}" width="14" height="2" fill="${N}"/>`).join(''),
  puzzle: hdr + [0, 1, 2].map(i => `<rect x="${5 + i * 21}" y="11" width="21" height="25" fill="${[N, B, G][i]}" stroke="#fff" stroke-width=".6"/><circle cx="${8.5 + i * 21}" cy="16" r="2.3" fill="#fff"/><rect x="${8 + i * 21}" y="22" width="13" height="2" fill="#fff" opacity=".8"/>`).join('') + [0, 1].map(i => `<circle cx="${26 + i * 21}" cy="23.5" r="2.4" fill="${[B, LG][i]}"/>`).join(''),
  balance: hdr + `<rect x="5" y="11" width="18" height="4" rx="1" fill="${N}"/><rect x="49" y="11" width="18" height="4" rx="1" fill="${G}"/><path d="M26 17 L46 15" stroke="${N}" stroke-width="1.4"/><rect x="35.4" y="16" width="1.2" height="17" fill="${N}"/><path d="M31 35 h10 l-3 -2.5 h-4 z" fill="${N}"/><path d="M22 25 h8 l-1.5 2 h-5 z" fill="${N}"/><path d="M42 23 h8 l-1.5 2 h-5 z" fill="${G}"/>` + [0, 1].map(i => `<rect x="5" y="${17 + i * 5}" width="15" height="3.5" fill="${S}"/><rect x="52" y="${17 + i * 5}" width="15" height="3.5" fill="#EBF0D6"/>`).join(''),
  checklist: hdr + `<rect x="5" y="10.5" width="62" height="2" rx="1" fill="${S}"/><rect x="5" y="10.5" width="30" height="2" rx="1" fill="${G}"/>` + [0, 1, 2, 3].map(i => `<rect x="5" y="${15 + i * 5.5}" width="62" height="4.6" rx="1" fill="${i < 2 ? '#EBF0D6' : '#fff'}" stroke="${L}" stroke-width=".3"/><circle cx="8" cy="${17.3 + i * 5.5}" r="1.6" fill="${i < 2 ? D : i === 2 ? B : '#fff'}" stroke="${i > 2 ? '#5A5A5A' : 'none'}" stroke-width=".4"/><rect x="11" y="${16.6 + i * 5.5}" width="30" height="1.6" fill="${L}"/><rect x="56" y="${16.3 + i * 5.5}" width="9" height="2.2" rx="1.1" fill="${i < 2 ? D : i === 2 ? B : L}"/>`).join(''),
  hero: hdr + `<rect x="5" y="11" width="28" height="25" rx="2" fill="${N}"/><text x="8" y="26" font-size="11" font-weight="700" fill="#fff">640</text><rect x="8" y="29" width="16" height="2" fill="${LG}"/><rect x="37" y="12" width="1" height="9" fill="${G}"/><rect x="40" y="13" width="26" height="2" fill="${L}"/><rect x="40" y="17" width="20" height="2" fill="${L}"/><rect x="37" y="26" width="14" height="10" rx="1" fill="#EBF0D6"/><rect x="53" y="26" width="14" height="10" rx="1" fill="${S}"/>`,
  shift: hdr + `<rect x="5" y="13" width="26" height="22" rx="1.5" fill="${S}"/><rect x="5" y="13" width="26" height="4" rx="1.5" fill="${L}"/><path d="M33 21 h3 v-3 l4.5 5 l-4.5 5 v-3 h-3 z" fill="${B}"/><rect x="42" y="11" width="25" height="25" rx="1.5" fill="#EBF0D6"/><rect x="42" y="11" width="25" height="4.5" rx="1.5" fill="${D}"/>` + [0, 1, 2].map(i => `<rect x="8" y="${20 + i * 5}" width="18" height="1.6" fill="${L}"/><circle cx="45.5" cy="${20.8 + i * 5}" r="1.2" fill="${D}"/><rect x="48" y="${20 + i * 5}" width="16" height="1.6" fill="${N}" opacity=".6"/>`).join(''),
  petals: hdr + [0, 1, 2, 3, 4].map(i => `<ellipse cx="36" cy="16" rx="3.6" ry="6.5" fill="${[N, B, B, D, G][i]}" transform="rotate(${i * 72} 36 23.5)"/>`).join('') + `<circle cx="36" cy="23.5" r="4.6" fill="#fff" stroke="#CEE1A5" stroke-width="1"/>` + [0, 1].map(i => `<rect x="${i ? 52 : 6}" y="15" width="14" height="2" fill="${L}"/><rect x="${i ? 52 : 6}" y="29" width="14" height="2" fill="${L}"/>`).join(''),
  path: hdr + `<path d="M4 25 C12 12, 20 12, 28 23 S44 34, 52 23 S64 14, 68 18" fill="none" stroke="${B}" stroke-width="3.2"/>` + [[12, 16], [28, 23], [44, 30], [60, 17]].map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="2.4" fill="#fff" stroke="${[N, B, D, G][i]}" stroke-width="1"/>`).join(''),
  mindmap: hdr + `<ellipse cx="36" cy="23.5" rx="8" ry="4.5" fill="${N}"/>` + [[14, 15], [58, 15], [14, 32], [58, 32]].map((p, i) => `<path d="M36 23.5 L${p[0]} ${p[1]}" stroke="${[N, B, D, G][i]}" stroke-width=".9"/><rect x="${p[0] - 7}" y="${p[1] - 2.5}" width="14" height="5" rx="2.5" fill="${[N, B, D, G][i]}"/>`).join(''),
  converge: hdr + [0, 1, 2].map(i => `<rect x="5" y="${11 + i * 8.5}" width="24" height="7" rx="1" fill="#fff" stroke="${L}" stroke-width=".4"/><circle cx="9" cy="${14.5 + i * 8.5}" r="2" fill="${[N, B, G][i]}"/><path d="M30 ${14.5 + i * 8.5} L46 ${19 + i * 3}" stroke="${[N, B, G][i]}" stroke-width=".8"/>`).join('') + `<rect x="47" y="13" width="20" height="21" rx="2" fill="${D}"/><circle cx="57" cy="20" r="3" fill="none" stroke="#fff" stroke-width=".8"/>`,
  map: hdr + `<rect x="5" y="10" width="40" height="26" rx="2" fill="#EEF3F8"/><path d="M9 17 q4 -4 9 -2 t8 1 l3 4 l-4 5 l-6 -1 l-3 4 l-5 -3 z" fill="${L}"/><path d="M28 14 q6 -3 12 0 l2 6 l-5 3 l-4 -2 l-5 1 z" fill="${G}"/><path d="M33 26 l5 1 l1 5 l-4 1 z" fill="${B}"/><circle cx="35" cy="17" r="2.2" fill="${N}" stroke="#fff" stroke-width=".6"/><circle cx="36" cy="29" r="2.2" fill="${N}" stroke="#fff" stroke-width=".6"/>` + [0, 1, 2].map(i => `<circle cx="50" cy="${15 + i * 8}" r="1.8" fill="${[N, B, G][i]}"/><rect x="54" y="${14 + i * 8}" width="13" height="2" fill="${L}"/>`).join(''),
  // нефтегазовые схемы
  value_chain: hdr + `<rect x="10" y="16" width="52" height="2" fill="${B}"/>` + [0, 1, 2, 3].map(i => `<circle cx="${12 + i * 16}" cy="17" r="6" fill="#E5EAF0" stroke="#fff" stroke-width="1.2"/><circle cx="${12 + i * 16}" cy="17.5" r="2.8" fill="${[N, B, D, G][i]}"/><path d="M${4 + i * 16} 25 h13 l2.5 2.5 l-2.5 2.5 h-13 l2.5 -2.5z" fill="${[N, B, D, G][i]}"/><rect x="${5 + i * 16}" y="32" width="13" height="5" fill="${S}"/>`).join(''),
  well: hdr + `<rect x="5" y="10" width="28" height="6" fill="#EAF2F9"/><rect x="5" y="16" width="28" height="5" fill="#E3E9F0"/><rect x="5" y="21" width="28" height="5" fill="#E8ECDD"/><rect x="5" y="26" width="28" height="5" fill="#DCE4EC"/><rect x="5" y="31" width="28" height="5" fill="${N}"/><path d="M16.5 15.5 L19 9.5 L21.5 15.5" fill="none" stroke="${N}" stroke-width=".8"/><rect x="16.5" y="16" width="5" height="8" fill="#C5CDD8"/><rect x="17.5" y="16" width="3" height="18" fill="#fff" stroke="${B}" stroke-width=".5"/>` + [0, 1, 2, 3].map(i => `<circle cx="25" cy="${18.5 + i * 5}" r="1.6" fill="${[N, B, D, G][i]}"/><path d="M26.6 ${18.5 + i * 5} L37 ${13 + i * 6.5}" stroke="${[N, B, D, G][i]}" stroke-width=".4"/><rect x="37" y="${10.5 + i * 6.5}" width="30" height="5.2" rx="1" fill="${S}"/><rect x="40" y="${12.6 + i * 6.5}" width="18" height="1.4" fill="${L}"/>`).join(''),
  field: hdr + `<rect x="5" y="10" width="38" height="27" rx="1.5" fill="#EEF3E8"/><rect x="39" y="10" width="4" height="27" fill="#BFDCEE"/><rect x="5" y="30" width="34" height="1.4" fill="${L}"/><rect x="8" y="13" width="7" height="5" rx="1" fill="#DAD6C6"/><rect x="8" y="22" width="7" height="5" rx="1" fill="#DAD6C6"/><path d="M15 24.5 H21 M11.5 18 V22" stroke="${B}" stroke-width=".8"/><rect x="21" y="19" width="7" height="9" rx="1" fill="${N}"/><path d="M28 23.5 H31" stroke="${B}" stroke-width=".8"/><circle cx="33" cy="21.5" r="1.8" fill="#fff" stroke="${N}" stroke-width=".5"/><circle cx="33" cy="26" r="1.8" fill="#fff" stroke="${N}" stroke-width=".5"/><path d="M35 23.5 H40" stroke="${N}" stroke-width="1.2"/><circle cx="15" cy="13" r="1.8" fill="${N}"/><circle cx="28" cy="19" r="1.8" fill="${B}"/><circle cx="35" cy="20" r="1.8" fill="${G}"/>` + [0, 1, 2].map(i => `<circle cx="48" cy="${15 + i * 8}" r="1.8" fill="${[N, B, G][i]}"/><rect x="52" y="${14 + i * 8}" width="15" height="2" fill="${L}"/>`).join(''),
  end: `<text x="5" y="20" font-size="6.5" fill="${N}">Спасибо за</text><text x="5" y="27" font-size="6.5" fill="${N}">внимание!</text><circle cx="62" cy="36" r="16" fill="${G}" opacity=".75"/><circle cx="68" cy="40" r="12" fill="${B}" opacity=".8"/>`,
};
const ITEM_HINT = {
  kpi: 'Значение | Единица | Подпись | Пояснение',
  gauge: 'Значение | Единица | Подпись | Пояснение', bars: 'Значение | Единица | Подпись | Пояснение',
  bubbles: 'Значение | Единица | Подпись | Пояснение', funnel: 'Значение | Единица | Подпись | Пояснение',
  timeline: 'Срок | Заголовок | Текст', roadmap: 'Срок | Заголовок | Текст',
  gantt: 'Срок (2026, I кв. 2026, март–май 2026) | Работа | Пояснение', path: 'Год или срок | Заголовок | Текст',
  checklist: 'Статус (выполнено, в работе, план) | Мероприятие | Пояснение',
  risk: 'Вероятность (1–3) | Последствия (1–3) | Риск | Пояснение', hero: 'Значение | Единица | Подпись | Пояснение',
  swot: 'Сильные стороны | пункт; пункт (затем слабые стороны, возможности, угрозы)',
  fishbone: 'Группа причин | причина; причина', mindmap: 'Ветвь | пункт; пункт',
  map: 'Страна | Что там (проект, актив, показатель)',
  value_chain: 'Этап (разведка, бурение, добыча…) | Что на этапе',
  well: 'Глубина, интервал или срок | Заголовок | Текст', field: 'Объект (куст, УПН, резервуары…) | Описание',
  agenda: 'Пункт содержания',
  default: 'Заголовок | Текст',
};
function itemsToText(items, layout) {
  return (items || []).map(it => {
    if (NUMERIC.includes(layout)) return [it.value || '', it.unit || '', it.title || '', it.text || ''].join(' | ').replace(/( \| )+$/, '');
    if (LABELED.includes(layout)) return [it.label || '', it.title || '', it.text || ''].join(' | ');
    if (layout === 'risk') return [it.prob || '', it.impact || '', it.title || '', it.text || ''].join(' | ').replace(/( \| )+$/, '');
    if (layout === 'agenda') return it.title || it.text || '';
    return it.title ? `${it.title} | ${it.text || ''}` : (it.text || '');
  }).join('\n');
}
function textToItems(text, layout, old) {
  old = old || [];
  return text.split('\n').map(l => l.trim()).filter(Boolean).map((line, i) => {
    const p = line.split('|').map(x => x.trim());
    const o = old[i] || {};
    const icon = o.icon;
    if (NUMERIC.includes(layout)) return { value: p[0] || '', unit: p[1] || '', title: p[2] || '', text: p[3] || '', icon };
    if (layout === 'risk') return p.length >= 3 ? { prob: p[0], impact: p[1], title: p[2], text: p.slice(3).join(' | '), icon }
      : { prob: o.prob || '', impact: o.impact || '', title: p[0] || '', text: p.slice(1).join(' | '), icon };
    if (LABELED.includes(layout)) return p.length >= 3 ? { label: p[0], title: p[1], text: p.slice(2).join(' | '), icon }
      : (p.length === 2 ? { label: '', title: p[0], text: p[1], icon } : { label: '', title: '', text: p[0], icon });
    if (layout === 'agenda') return { title: '', text: line };
    return p.length >= 2 ? { title: p[0], text: p.slice(1).join(' | '), icon } : { title: '', text: p[0], icon };
  });
}
function chartToTSV(ch) {
  ch = { categories: [], series: [], ...(ch || {}) };
  const head = ['Категория'].concat(ch.series.map(s => s.name)).join('\t');
  const rows = ch.categories.map((c, i) => [c].concat(ch.series.map(s => s.values[i] === null || s.values[i] === undefined ? '' : String(s.values[i]).replace('.', ','))).join('\t'));
  return [head].concat(rows).join('\n');
}
function tsvToChart(text, ch) {
  const lines = text.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim());
  if (lines.length < 2) return ch;
  const split = l => l.includes('\t') ? l.split('\t') : l.split(';');
  const head = split(lines[0]);
  const names = head.slice(1);
  const rows = lines.slice(1).map(split);
  return { ...ch, categories: rows.map(r => r[0]), series: names.map((n, j) => ({ name: n || `Ряд ${j + 1}`, values: rows.map(r => num(r[j + 1])) })) };
}
function tableToTSV(cols, rows) { return [cols.join('\t')].concat((rows || []).map(r => r.join('\t'))).join('\n'); }
function tsvToTable(text) {
  const lines = text.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim());
  const split = l => l.includes('\t') ? l.split('\t') : l.split(';');
  return { columns: lines.length ? split(lines[0]) : [], rows: lines.slice(1).map(split) };
}

/* ---------------------------------------------------------------- смена макета */
const CI = (body) => `<svg viewBox="0 0 40 26" aria-hidden="true">${body}</svg>`;
const CHART_KINDS = [
  ['column', 'Гистограмма', CI(`<rect x="5" y="12" width="5" height="12" fill="${N}"/><rect x="13" y="7" width="5" height="17" fill="${B}"/><rect x="21" y="10" width="5" height="14" fill="${N}"/><rect x="29" y="3" width="5" height="21" fill="${G}"/>`)],
  ['stacked', 'С накоплением', CI(`<rect x="6" y="12" width="6" height="12" fill="${N}"/><rect x="6" y="6" width="6" height="6" fill="${G}"/><rect x="17" y="9" width="6" height="15" fill="${N}"/><rect x="17" y="3" width="6" height="6" fill="${G}"/><rect x="28" y="14" width="6" height="10" fill="${N}"/><rect x="28" y="8" width="6" height="6" fill="${G}"/>`)],
  ['stacked100', 'Нормированная 100 %', CI(`<rect x="6" y="2" width="6" height="22" fill="${G}"/><rect x="6" y="10" width="6" height="14" fill="${N}"/><rect x="17" y="2" width="6" height="22" fill="${G}"/><rect x="17" y="7" width="6" height="17" fill="${N}"/><rect x="28" y="2" width="6" height="22" fill="${G}"/><rect x="28" y="13" width="6" height="11" fill="${N}"/>`)],
  ['bar', 'Линейчатая', CI(`<rect x="3" y="3" width="30" height="4" fill="${N}"/><rect x="3" y="9" width="22" height="4" fill="${B}"/><rect x="3" y="15" width="26" height="4" fill="${N}"/><rect x="3" y="21" width="14" height="4" fill="${G}"/>`)],
  ['bar_stacked', 'Линейчатая с накоплением', CI(`<rect x="3" y="3" width="18" height="5" fill="${N}"/><rect x="21" y="3" width="12" height="5" fill="${G}"/><rect x="3" y="11" width="13" height="5" fill="${N}"/><rect x="16" y="11" width="10" height="5" fill="${G}"/><rect x="3" y="19" width="22" height="5" fill="${N}"/><rect x="25" y="19" width="10" height="5" fill="${G}"/>`)],
  ['line', 'График', CI(`<polyline points="4,20 13,13 22,16 31,6 37,9" fill="none" stroke="${B}" stroke-width="2.4"/><circle cx="13" cy="13" r="2" fill="${N}"/><circle cx="22" cy="16" r="2" fill="${N}"/><circle cx="31" cy="6" r="2" fill="${G}"/>`)],
  ['area', 'С областями', CI(`<polygon points="3,24 3,15 12,10 21,13 30,5 37,8 37,24" fill="${B}" opacity=".85"/><polygon points="3,24 3,19 12,17 21,19 30,14 37,16 37,24" fill="${G}"/>`)],
  ['pie', 'Круговая', CI(`<circle cx="20" cy="13" r="11" fill="${B}"/><path d="M20 13 L20 2 A11 11 0 0 1 30.5 16 Z" fill="${G}"/><path d="M20 13 L30.5 16 A11 11 0 0 1 14 22.5 Z" fill="${N}"/>`)],
  ['doughnut', 'Кольцевая', CI(`<circle cx="20" cy="13" r="9" fill="none" stroke="${B}" stroke-width="5"/><path d="M20 4 A9 9 0 0 1 28.6 15.6" fill="none" stroke="${G}" stroke-width="5"/>`)],
  ['radar', 'Лепестковая', CI(`<polygon points="20,2 31,10 27,23 13,23 9,10" fill="none" stroke="${L}" stroke-width="1.2"/><polygon points="20,6 28,11 24,20 15,19 13,11" fill="${B}" opacity=".45" stroke="${B}" stroke-width="1.4"/>`)],
  ['combo', 'Столбцы и линия', CI(`<rect x="5" y="12" width="5" height="12" fill="${N}"/><rect x="14" y="9" width="5" height="15" fill="${N}"/><rect x="23" y="14" width="5" height="10" fill="${N}"/><rect x="32" y="8" width="5" height="16" fill="${N}"/><polyline points="7,8 16,5 25,7 34,3" fill="none" stroke="${G}" stroke-width="2.4"/>`)],
];
const CHART_HELP = {
  column: 'Сравнение величин: годы, объекты, направления.', stacked: 'Итог и его состав: каждый столбец — сумма рядов.',
  stacked100: 'Структура в долях: каждый столбец — 100 %.', bar: 'Длинные подписи и рейтинги — полосы читаются легче.',
  bar_stacked: 'Состав по объектам с длинными подписями.', line: 'Динамика во времени: тренд по годам, кварталам, месяцам.',
  area: 'Динамика с накоплением: как складывается итог.', pie: 'Доли одного целого (лучше 3–6 долей).',
  doughnut: 'Доли одного целого, в центре свободно.', radar: 'Профиль по критериям одной шкалы (оценки, баллы, %).',
  combo: 'Два показателя в разных единицах: последний ряд — линией по правой оси (например, обводнённость, %).',
};

/* виды диаграмм 1.7 сверх основных: значки — как в Windows-версии; список видов — /api/chart_types */
const D3 = (body) => CI(`${body}<text x="38" y="8" text-anchor="end" font-size="7" font-weight="700" fill="${D}">3D</text>`);
const EXT_ICONS = {
  line_plain: CI(`<polyline points="3,20 10,15 17,17 24,9 31,11 37,4" fill="none" stroke="${B}" stroke-width="2.2"/>`),
  line_smooth: CI(`<path d="M3 20 C10 8 16 22 23 12 S33 4 37 6" fill="none" stroke="${B}" stroke-width="2.2"/>`),
  line_stacked: CI(`<polyline points="3,20 12,17 21,18 30,14 37,15" fill="none" stroke="${N}" stroke-width="2"/><polyline points="3,12 12,9 21,10 30,5 37,6" fill="none" stroke="${G}" stroke-width="2"/>`),
  line_stacked100: CI(`<line x1="3" y1="4" x2="37" y2="4" stroke="${G}" stroke-width="2"/><polyline points="3,14 12,12 21,16 30,11 37,13" fill="none" stroke="${N}" stroke-width="2"/>`),
  line3d: D3(`<polygon points="3,20 12,12 21,15 30,7 34,9 25,17 16,14 7,22" fill="${B}"/><polygon points="7,22 16,14 25,17 34,9 34,11 25,19 16,16 7,24" fill="${N}"/>`),
  column3d: D3(`<polygon points="6,12 10,12 12,10 8,10" fill="${B}"/><rect x="6" y="12" width="4" height="12" fill="${N}"/><polygon points="10,12 12,10 12,22 10,24" fill="${B}"/><polygon points="16,7 20,7 22,5 18,5" fill="${B}"/><rect x="16" y="7" width="4" height="17" fill="${N}"/><polygon points="20,7 22,5 22,22 20,24" fill="${B}"/><polygon points="26,14 30,14 32,12 28,12" fill="${B}"/><rect x="26" y="14" width="4" height="10" fill="${N}"/><polygon points="30,14 32,12 32,22 30,24" fill="${B}"/>`),
  column3d_stacked: D3(`<rect x="7" y="14" width="5" height="10" fill="${N}"/><rect x="7" y="8" width="5" height="6" fill="${G}"/><polygon points="12,8 14,6 14,22 12,24" fill="${D}"/><rect x="19" y="11" width="5" height="13" fill="${N}"/><rect x="19" y="5" width="5" height="6" fill="${G}"/><polygon points="24,5 26,3 26,22 24,24" fill="${D}"/><rect x="31" y="15" width="4" height="9" fill="${N}"/><rect x="31" y="10" width="4" height="5" fill="${G}"/>`),
  column3d_stacked100: D3(`<rect x="7" y="4" width="5" height="20" fill="${G}"/><rect x="7" y="12" width="5" height="12" fill="${N}"/><polygon points="12,4 14,2 14,22 12,24" fill="${D}"/><rect x="19" y="4" width="5" height="20" fill="${G}"/><rect x="19" y="9" width="5" height="15" fill="${N}"/><polygon points="24,4 26,2 26,22 24,24" fill="${D}"/>`),
  cylinder: CI(`<rect x="6" y="12" width="6" height="11" fill="${N}"/><ellipse cx="9" cy="12" rx="3" ry="1.4" fill="${B}"/><ellipse cx="9" cy="23" rx="3" ry="1.4" fill="${N}"/><rect x="17" y="6" width="6" height="17" fill="${N}"/><ellipse cx="20" cy="6" rx="3" ry="1.4" fill="${B}"/><ellipse cx="20" cy="23" rx="3" ry="1.4" fill="${N}"/><rect x="28" y="10" width="6" height="13" fill="${N}"/><ellipse cx="31" cy="10" rx="3" ry="1.4" fill="${B}"/><ellipse cx="31" cy="23" rx="3" ry="1.4" fill="${N}"/>`),
  cone: CI(`<polygon points="9,10 5,24 13,24" fill="${N}"/><polygon points="20,3 16,24 24,24" fill="${B}"/><polygon points="31,8 27,24 35,24" fill="${N}"/>`),
  pyramid: CI(`<polygon points="9,10 5,24 11,24" fill="${N}"/><polygon points="9,10 11,24 13,22" fill="${B}"/><polygon points="20,3 16,24 22,24" fill="${N}"/><polygon points="20,3 22,24 24,22" fill="${B}"/><polygon points="31,8 27,24 33,24" fill="${N}"/><polygon points="31,8 33,24 35,22" fill="${B}"/>`),
  bar_stacked100: CI(`<rect x="3" y="3" width="34" height="5" fill="${G}"/><rect x="3" y="3" width="21" height="5" fill="${N}"/><rect x="3" y="11" width="34" height="5" fill="${G}"/><rect x="3" y="11" width="14" height="5" fill="${N}"/><rect x="3" y="19" width="34" height="5" fill="${G}"/><rect x="3" y="19" width="26" height="5" fill="${N}"/>`),
  bar3d: D3(`<rect x="3" y="5" width="24" height="4" fill="${N}"/><polygon points="3,5 5,3 29,3 27,5" fill="${B}"/><polygon points="27,5 29,3 29,7 27,9" fill="${B}"/><rect x="3" y="13" width="16" height="4" fill="${N}"/><polygon points="3,13 5,11 21,11 19,13" fill="${B}"/><rect x="3" y="20" width="28" height="4" fill="${N}"/><polygon points="3,20 5,18 33,18 31,20" fill="${B}"/>`),
  bar3d_stacked: D3(`<rect x="3" y="5" width="16" height="4" fill="${N}"/><rect x="19" y="5" width="9" height="4" fill="${G}"/><polygon points="3,5 5,3 30,3 28,5" fill="${B}"/><rect x="3" y="13" width="11" height="4" fill="${N}"/><rect x="14" y="13" width="8" height="4" fill="${G}"/><polygon points="3,13 5,11 24,11 22,13" fill="${B}"/><rect x="3" y="20" width="19" height="4" fill="${N}"/><rect x="22" y="20" width="10" height="4" fill="${G}"/><polygon points="3,20 5,18 34,18 32,20" fill="${B}"/>`),
  pie3d: D3(`<path d="M8 13 v4 a12 6 0 0 0 24 0 v-4" fill="${N}"/><ellipse cx="20" cy="13" rx="12" ry="6" fill="${B}"/><path d="M20 13 L20 7 A12 6 0 0 1 31 15 Z" fill="${G}"/>`),
  pie_exploded: CI(`<path d="M18 14 L18 3 A11 11 0 1 0 28.5 17.5 Z" fill="${B}"/><path d="M21 11 L21 1 A10 10 0 0 1 31 13 Z" fill="${G}"/>`),
  pie_of_pie: CI(`<circle cx="12" cy="13" r="9" fill="${B}"/><path d="M12 13 L21 13 A9 9 0 0 1 18 20 Z" fill="${G}"/><line x1="20" y1="10" x2="29" y2="8" stroke="${L}"/><line x1="19" y1="19" x2="29" y2="18" stroke="${L}"/><circle cx="32" cy="13" r="5.5" fill="${G}"/><path d="M32 13 L32 7.5 A5.5 5.5 0 0 1 37.5 13 Z" fill="${LG}"/>`),
  bar_of_pie: CI(`<circle cx="12" cy="13" r="9" fill="${B}"/><path d="M12 13 L21 13 A9 9 0 0 1 18 20 Z" fill="${G}"/><line x1="20" y1="10" x2="30" y2="3" stroke="${L}"/><line x1="19" y1="19" x2="30" y2="23" stroke="${L}"/><rect x="30" y="3" width="6" height="7" fill="${G}"/><rect x="30" y="10" width="6" height="6" fill="${LG}"/><rect x="30" y="16" width="6" height="7" fill="${D}"/>`),
  area_stacked: CI(`<polygon points="3,24 3,16 12,13 21,15 30,9 37,10 37,24" fill="${G}"/><polygon points="3,24 3,20 12,18 21,19 30,16 37,17 37,24" fill="${N}"/>`),
  area_stacked100: CI(`<rect x="3" y="3" width="34" height="21" fill="${G}"/><polygon points="3,24 3,12 12,14 21,10 30,13 37,11 37,24" fill="${N}"/>`),
  area3d: D3(`<polygon points="3,24 3,14 12,10 21,13 30,6 34,4 34,20 30,24" fill="${N}"/><polygon points="3,14 6,12 15,8 24,11 33,4 30,6 21,13 12,10" fill="${B}"/>`),
  scatter: CI(`<circle cx="7" cy="19" r="2" fill="${N}"/><circle cx="13" cy="15" r="2" fill="${N}"/><circle cx="18" cy="17" r="2" fill="${G}"/><circle cx="24" cy="10" r="2" fill="${N}"/><circle cx="29" cy="12" r="2" fill="${G}"/><circle cx="34" cy="5" r="2" fill="${N}"/>`),
  scatter_lines: CI(`<polyline points="7,19 13,15 18,17 24,10 29,12 34,5" fill="none" stroke="${B}" stroke-width="1.6"/><circle cx="7" cy="19" r="2" fill="${N}"/><circle cx="13" cy="15" r="2" fill="${N}"/><circle cx="18" cy="17" r="2" fill="${N}"/><circle cx="24" cy="10" r="2" fill="${N}"/><circle cx="29" cy="12" r="2" fill="${N}"/><circle cx="34" cy="5" r="2" fill="${N}"/>`),
  scatter_smooth: CI(`<path d="M7 19 C11 13 15 19 18 17 S22 9 24 10 S28 14 29 12 S32 6 34 5" fill="none" stroke="${B}" stroke-width="1.6"/><circle cx="7" cy="19" r="2" fill="${N}"/><circle cx="18" cy="17" r="2" fill="${N}"/><circle cx="24" cy="10" r="2" fill="${N}"/><circle cx="34" cy="5" r="2" fill="${N}"/>`),
  scatter_trend: CI(`<line x1="4" y1="21" x2="37" y2="5" stroke="${G}" stroke-width="1.6" stroke-dasharray="3 2"/><circle cx="7" cy="17" r="2" fill="${N}"/><circle cx="13" cy="19" r="2" fill="${N}"/><circle cx="18" cy="12" r="2" fill="${N}"/><circle cx="24" cy="14" r="2" fill="${N}"/><circle cx="29" cy="8" r="2" fill="${N}"/><circle cx="34" cy="9" r="2" fill="${N}"/>`),
  bubble: CI(`<circle cx="9" cy="17" r="4" fill="${B}" opacity=".8"/><circle cx="19" cy="11" r="6" fill="${N}" opacity=".8"/><circle cx="31" cy="8" r="4.5" fill="${G}" opacity=".85"/><circle cx="29" cy="20" r="2.5" fill="${B}" opacity=".8"/>`),
  bubble3d: D3(`<circle cx="9" cy="17" r="4" fill="${B}"/><circle cx="8" cy="15.5" r="1.3" fill="#fff" opacity=".6"/><circle cx="19" cy="12" r="6" fill="${N}"/><circle cx="17" cy="9.5" r="1.8" fill="#fff" opacity=".5"/><circle cx="30" cy="18" r="4.5" fill="${G}"/><circle cx="28.5" cy="16" r="1.4" fill="#fff" opacity=".6"/>`),
  radar_lines: CI(`<polygon points="20,2 31,10 27,23 13,23 9,10" fill="none" stroke="${L}" stroke-width="1.2"/><polygon points="20,5 29,11 23,20 15,21 12,11" fill="none" stroke="${N}" stroke-width="1.6"/><polygon points="20,9 26,11 25,19 14,18 15,12" fill="none" stroke="${G}" stroke-width="1.6"/>`),
  radar_markers: CI(`<polygon points="20,2 31,10 27,23 13,23 9,10" fill="none" stroke="${L}" stroke-width="1.2"/><polygon points="20,5 29,11 23,20 15,21 12,11" fill="none" stroke="${N}" stroke-width="1.5"/><circle cx="20" cy="5" r="1.8" fill="${N}"/><circle cx="29" cy="11" r="1.8" fill="${N}"/><circle cx="23" cy="20" r="1.8" fill="${N}"/><circle cx="15" cy="21" r="1.8" fill="${N}"/><circle cx="12" cy="11" r="1.8" fill="${N}"/>`),
  stock_hlc: CI(`<line x1="8" y1="5" x2="8" y2="18" stroke="${N}" stroke-width="1.5"/><line x1="8" y1="12" x2="11" y2="12" stroke="${G}" stroke-width="2"/><line x1="18" y1="9" x2="18" y2="23" stroke="${N}" stroke-width="1.5"/><line x1="18" y1="19" x2="21" y2="19" stroke="${G}" stroke-width="2"/><line x1="28" y1="3" x2="28" y2="15" stroke="${N}" stroke-width="1.5"/><line x1="28" y1="6" x2="31" y2="6" stroke="${G}" stroke-width="2"/>`),
  stock_ohlc: CI(`<line x1="9" y1="4" x2="9" y2="20" stroke="${N}" stroke-width="1.2"/><rect x="6" y="8" width="6" height="8" fill="${G}"/><line x1="20" y1="7" x2="20" y2="24" stroke="${N}" stroke-width="1.2"/><rect x="17" y="11" width="6" height="9" fill="${N}"/><line x1="31" y1="2" x2="31" y2="17" stroke="${N}" stroke-width="1.2"/><rect x="28" y="5" width="6" height="7" fill="${G}"/>`),
  surface3d: D3(`<path d="M3 18 L13 23 L37 15 L27 10 Z" fill="${N}"/><path d="M3 18 Q9 6 15 14 T27 10 L37 15 Q31 4 25 9 T13 23 Z" fill="${G}" opacity=".9"/><path d="M8 12 Q13 8 17 15" fill="none" stroke="${LG}" stroke-width="1.5"/>`),
  surface_wire: D3(`<path d="M3 18 Q9 6 15 14 T27 10" fill="none" stroke="${B}" stroke-width="1.4"/><path d="M13 23 Q19 11 25 17 T37 15" fill="none" stroke="${G}" stroke-width="1.4"/><line x1="3" y1="18" x2="13" y2="23" stroke="${N}"/><line x1="15" y1="14" x2="25" y2="17" stroke="${N}"/><line x1="27" y1="10" x2="37" y2="15" stroke="${N}"/>`),
  contour: CI(`<rect x="3" y="2" width="34" height="22" fill="${N}"/><ellipse cx="20" cy="13" rx="14" ry="9" fill="${B}"/><ellipse cx="20" cy="13" rx="9" ry="6" fill="${G}"/><ellipse cx="20" cy="13" rx="4" ry="3" fill="${LG}"/>`),
  contour_wire: CI(`<ellipse cx="20" cy="13" rx="15" ry="10" fill="none" stroke="${N}" stroke-width="1.4"/><ellipse cx="20" cy="13" rx="10" ry="6.5" fill="none" stroke="${B}" stroke-width="1.4"/><ellipse cx="20" cy="13" rx="5" ry="3" fill="none" stroke="${G}" stroke-width="1.4"/>`),
  waterfall: CI(`<rect x="3" y="8" width="6" height="16" fill="${N}"/><rect x="11" y="4" width="6" height="4" fill="${G}"/><rect x="19" y="4" width="6" height="6" fill="${L}" stroke="#8C9BB0"/><rect x="27" y="7" width="6" height="17" fill="${N}"/>`),
  histogram: CI(`<rect x="3" y="18" width="6" height="6" fill="${B}"/><rect x="10" y="10" width="6" height="14" fill="${B}"/><rect x="17" y="3" width="6" height="21" fill="${B}"/><rect x="24" y="9" width="6" height="15" fill="${B}"/><rect x="31" y="17" width="6" height="7" fill="${B}"/>`),
  pareto: CI(`<rect x="4" y="5" width="6" height="19" fill="${N}"/><rect x="12" y="12" width="6" height="12" fill="${N}"/><rect x="20" y="17" width="6" height="7" fill="${N}"/><rect x="28" y="20" width="6" height="4" fill="${N}"/><polyline points="7,14 15,7 23,4 31,3" fill="none" stroke="${G}" stroke-width="2"/>`),
  boxplot: CI(`<line x1="11" y1="3" x2="11" y2="22" stroke="${N}" stroke-width="1.2"/><rect x="6" y="8" width="10" height="5" fill="${G}"/><rect x="6" y="13" width="10" height="5" fill="${B}"/><line x1="29" y1="5" x2="29" y2="24" stroke="${N}" stroke-width="1.2"/><rect x="24" y="9" width="10" height="4" fill="${G}"/><rect x="24" y="13" width="10" height="7" fill="${B}"/>`),
  funnel_chart: CI(`<rect x="4" y="2" width="32" height="5" fill="${N}"/><rect x="9" y="8" width="22" height="5" fill="${B}"/><rect x="13" y="14" width="14" height="5" fill="${G}"/><rect x="16" y="20" width="8" height="5" fill="${LG}"/>`),
  sunburst: CI(`<circle cx="20" cy="13" r="12" fill="${G}"/><path d="M20 13 L20 1 A12 12 0 0 1 31 18 Z" fill="${B}"/><path d="M20 13 L31 18 A12 12 0 0 1 12 22 Z" fill="${LG}"/><circle cx="20" cy="13" r="7" fill="${N}"/><path d="M20 13 L20 6 A7 7 0 0 1 26.5 15.5 Z" fill="${D}"/><circle cx="20" cy="13" r="3" fill="#fff"/>`),
  treemap: CI(`<rect x="3" y="2" width="18" height="22" fill="${N}"/><rect x="22" y="2" width="15" height="12" fill="${G}"/><rect x="22" y="15" width="8" height="9" fill="${B}"/><rect x="31" y="15" width="6" height="9" fill="${LG}"/>`),
  waffle: CI([0, 1, 2, 3].map(r => [0, 1, 2, 3, 4, 5].map(c => `<rect x="${5 + c * 5.2}" y="${3 + r * 5.2}" width="4.4" height="4.4" rx="1" fill="${r * 6 + c < 14 ? N : r * 6 + c < 20 ? G : L}"/>`).join('')).join('')),
  network: CI(`<line x1="8" y1="7" x2="22" y2="13" stroke="${L}" stroke-width="1.5"/><line x1="22" y1="13" x2="33" y2="5" stroke="${L}" stroke-width="1.5"/><line x1="22" y1="13" x2="30" y2="21" stroke="${L}" stroke-width="1.5"/><line x1="8" y1="7" x2="9" y2="20" stroke="${L}" stroke-width="1.5"/><circle cx="22" cy="13" r="5" fill="${N}"/><circle cx="8" cy="7" r="3" fill="${G}"/><circle cx="33" cy="5" r="3" fill="${B}"/><circle cx="30" cy="21" r="3" fill="${G}"/><circle cx="9" cy="20" r="2.5" fill="${B}"/>`),
  heatmap: CI([0, 1, 2].map(r => [0, 1, 2, 3, 4].map(c => `<rect x="${4 + c * 6.6}" y="${3 + r * 7}" width="6.2" height="6.6" fill="${['#F2F5F9', '#9CCBE5', B, N, '#5DA9D4'][(r * 2 + c) % 5]}"/>`).join('')).join('')),
  violin: CI(`<path d="M11 2 C15 8 17 11 11 24 C5 11 7 8 11 2 Z" fill="${N}"/><path d="M29 4 C36 9 34 15 29 23 C24 15 22 9 29 4 Z" fill="${G}"/>`),
  kde: CI(`<path d="M2 24 C8 24 10 4 15 4 S22 24 38 24 Z" fill="${B}" opacity=".45" stroke="${N}" stroke-width="1.3"/><path d="M8 24 C16 24 20 9 25 9 S30 24 38 24 Z" fill="${G}" opacity=".45" stroke="${D}" stroke-width="1.3"/>`),
  contour_img: CI(`<rect x="3" y="2" width="34" height="22" fill="${N}"/><ellipse cx="22" cy="12" rx="15" ry="9" fill="${B}"/><ellipse cx="22" cy="12" rx="10" ry="6" fill="${G}"/><ellipse cx="22" cy="12" rx="4" ry="2.5" fill="${LG}"/><ellipse cx="22" cy="12" rx="10" ry="6" fill="none" stroke="#fff" stroke-width=".6"/>`),
  surface_img: D3(`<path d="M3 19 Q12 2 20 12 T37 10 L37 14 Q29 18 20 16 T3 23 Z" fill="${G}"/><path d="M3 19 Q12 2 20 12" fill="none" stroke="${B}" stroke-width="1.6"/><path d="M20 12 T37 10" fill="none" stroke="${LG}" stroke-width="1.6"/>`),
  scatter3d: D3(`<polyline points="6,4 6,22 34,22" fill="none" stroke="${L}" stroke-width="1.2"/><line x1="6" y1="22" x2="16" y2="14" stroke="${L}" stroke-width="1.2"/><circle cx="12" cy="10" r="2" fill="${N}"/><circle cx="20" cy="15" r="2" fill="${B}"/><circle cx="25" cy="7" r="2" fill="${G}"/><circle cx="30" cy="16" r="2" fill="${N}"/><circle cx="16" cy="18" r="2" fill="${G}"/>`),
  trajectory3d: D3(`<line x1="18" y1="2" x2="18" y2="10" stroke="${N}" stroke-width="2"/><path d="M18 10 Q19 18 33 22" fill="none" stroke="${N}" stroke-width="2"/><path d="M18 10 Q16 18 6 23" fill="none" stroke="${G}" stroke-width="2"/><path d="M18 10 L20 24" fill="none" stroke="${B}" stroke-width="2"/><polygon points="15,2 21,2 18,0" fill="${N}"/>`),
  rose: CI(`<path d="M20 13 L17 1 A12 12 0 0 1 23 1 Z" fill="${N}"/><path d="M20 13 L29 7 A10 10 0 0 1 30 13 Z" fill="${G}"/><path d="M20 13 L28 21 A11 11 0 0 1 22 24 Z" fill="${N}"/><path d="M20 13 L11 20 A11 11 0 0 1 9 14 Z" fill="${G}"/><path d="M20 13 L12 7 A10 10 0 0 1 15 4 Z" fill="${B}"/>`),
  wordcloud: CI(`<text x="3" y="15" font-size="11" font-weight="700" fill="${N}">слова</text><text x="22" y="23" font-size="7" fill="${G}">облако</text><text x="4" y="23" font-size="6" fill="${B}">нефть</text><text x="27" y="8" font-size="6" fill="${D}">газ</text>`),
};
const FAMILY_ICON = { 'Гистограмма': CHART_KINDS[0][2], 'Линейчатая': CHART_KINDS[3][2], 'График': CHART_KINDS[5][2], 'С областями': CHART_KINDS[6][2],
  'Круговая': CHART_KINDS[7][2], 'Лепестковая': CHART_KINDS[9][2] };
let CHART_CAT = null;                          // [{id, name, family, how, how_name, hint, min, max, base, xy, grid, ok}]
async function loadChartTypes() {
  if (CHART_CAT) return CHART_CAT;
  try { const r = await Engine.get('/api/chart_types'); CHART_CAT = r.ok ? r.json() : []; } catch (e) { CHART_CAT = []; }
  return CHART_CAT;
}
const chartInfo = t => (CHART_CAT || []).find(k => k.id === t) || null;
const chartKnown = t => CHART_KINDS.some(k => k[0] === t) || !!chartInfo(t) || (!CHART_CAT && !!t);
const chartIcon = t => { const k = CHART_KINDS.find(x => x[0] === t); if (k) return k[2]; const i = chartInfo(t); return EXT_ICONS[t] || (i && FAMILY_ICON[i.family]) || CHART_KINDS[0][2]; };
