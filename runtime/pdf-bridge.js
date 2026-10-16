/* pdf-bridge.js — чтение PDF в телефоне: PDFium в WebAssembly (vendor/pdfium.js + pdfium.wasm, пакет
 * @embedpdf/pdfium, MIT; PDFium — BSD) для движка Python. Модуль pypdfium2 мобильной версии (py/pypdfium2)
 * вызывает эти функции: за один вызов — все символы, линии, выделения или рисунки страницы.
 * Загружается в поток движка (runtime/worker.js) перед первой задачей с PDF.
 */
'use strict';
self.znPdf = (() => {
  let P = null, loading = null;
  const docs = new Map();                       // номер → {doc, buf, pages: Map(номер страницы → страница)}
  let next = 1;

  function load(vendor) {
    if (loading) return loading;
    loading = (async () => {
      importScripts(vendor + 'pdfium.js');
      const r = await fetch(vendor + 'pdfium.wasm');
      if (!r.ok) throw new Error('pdfium.wasm: ' + r.status);
      P = await self.ZnPdfiumLib.init({wasmBinary: await r.arrayBuffer(), locateFile: f => vendor + f});
      P.PDFiumExt_Init();
    })();
    loading.catch(() => { loading = null; });
    return loading;
  }
  const M = () => P.pdfium;
  const malloc = n => M().wasmExports.malloc(n);
  const free = p => M().wasmExports.free(p);
  const f32 = p => M().HEAPF32[p >> 2];
  const u32 = p => M().HEAPU32[p >> 2];
  const i32 = p => M().HEAP32[p >> 2];

  function open(bytes, password) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const buf = malloc(u8.length || 1);
    M().HEAPU8.set(u8, buf);
    const doc = P.FPDF_LoadMemDocument(buf, u8.length, password || null);
    if (!doc) { const e = P.FPDF_GetLastError(); free(buf); return -(e || 1); }
    const id = next++;
    docs.set(id, {doc, buf, pages: new Map()});
    return id;
  }
  function close(id) {
    const d = docs.get(id);
    if (!d) return;
    for (const pg of d.pages.values()) P.FPDF_ClosePage(pg);
    P.FPDF_CloseDocument(d.doc);
    free(d.buf);
    docs.delete(id);
  }
  const pageCount = id => P.FPDF_GetPageCount(docs.get(id).doc);
  function page(id, i) {
    const d = docs.get(id);
    let pg = d.pages.get(i);
    if (!pg) { pg = P.FPDF_LoadPage(d.doc, i); if (!pg) throw new Error('страница PDF не открывается'); d.pages.set(i, pg); }
    return pg;
  }
  function closePage(id, i) {
    const d = docs.get(id), pg = d && d.pages.get(i);
    if (pg) { P.FPDF_ClosePage(pg); d.pages.delete(i); }
  }
  function pageSize(id, i) {
    const pg = page(id, i);
    return JSON.stringify([P.FPDF_GetPageWidthF(pg), P.FPDF_GetPageHeightF(pg)]);
  }
  function meta(id) {
    const d = docs.get(id), out = {};
    for (const k of ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate']) {
      const n = P.FPDF_GetMetaText(d.doc, k, 0, 0);
      out[k] = '';
      if (n <= 2) continue;
      const buf = malloc(n);
      try { P.FPDF_GetMetaText(d.doc, k, buf, n); out[k] = M().UTF16ToString(buf); } finally { free(buf); }
    }
    return JSON.stringify(out);
  }

  /* Рамка символа «с запасом» в новых PDFium (как у pypdfium2 в Windows-версии) — по высоте от нижнего до
   * верхнего выноса шрифта; PDFium этой сборки даёт другую высоту, и абзацы делились бы иначе.
   * Только для неповёрнутого текста; если старая рамка совпадает с точной, она и верна. */
  let dbl = 0;
  const f64 = p => M().HEAPF64[p >> 3];
  function looseLikeNew(tp, k, data, o, size, sy) {
    if (!P.FPDFText_GetCharBox(tp, k, dbl, dbl + 8, dbl + 16, dbl + 24)) return;
    const cl = f64(dbl), cr = f64(dbl + 8), cbot = f64(dbl + 16), ctop = f64(dbl + 24);
    const near = (a, b) => Math.abs(a - b) < 0.06;
    if (near(data[o + 2], cl) && near(data[o + 3], cr) && near(data[o + 4], cbot) && near(data[o + 5], ctop)) return;
    const font = P.FPDFTextObj_GetFont(P.FPDFText_GetTextObject(tp, k));
    if (!font || !P.FPDFText_GetCharOrigin(tp, k, dbl, dbl + 8)) return;
    const oy = f64(dbl + 8);
    if (!P.FPDFFont_GetAscent(font, size, dbl) || !P.FPDFFont_GetDescent(font, size, dbl + 4)) return;
    const asc = M().HEAPF32[dbl >> 2], desc = M().HEAPF32[(dbl + 4) >> 2];
    data[o + 4] = Math.min(oy + desc * sy, cbot);
    data[o + 5] = Math.max(oy + asc * sy, ctop);
  }

  /* символы страницы: по 18 чисел (как читает py/pypdfium2/raw.py) и шрифты */
  function pageText(id, i) {
    const tp = P.FPDFText_LoadPage(page(id, i));
    const n = tp ? P.FPDFText_CountChars(tp) : 0;
    const S = 18, data = new Float64Array(Math.max(0, n) * S), fonts = [], fkey = new Map();
    const mem = malloc(16 + 24 + 16 + 256 + 8 + 32), rect = mem, mtx = mem + 16, col = mem + 40, fbuf = mem + 56, flg = mem + 312;
    dbl = mem + 320;                            // 4 числа double: рамка символа / начало символа (8-байтное выравнивание)
    try {
      for (let k = 0; k < n; k++) {
        const o = k * S, u = P.FPDFText_GetUnicode(tp, k);
        data[o] = u;
        if ((u <= 32 && u !== 2) || u === 0xA0) continue;   // пробелы: остальное чтению не нужно (2 — мягкий перенос)
        if (P.FPDFText_GetLooseCharBox(tp, k, rect)) {
          data[o + 1] = 1;
          data[o + 2] = f32(rect); data[o + 5] = f32(rect + 4); data[o + 3] = f32(rect + 8); data[o + 4] = f32(rect + 12);
        }
        data[o + 6] = P.FPDFText_GetCharAngle(tp, k);
        data[o + 7] = P.FPDFText_GetFontSize(tp, k);
        if (P.FPDFText_GetMatrix(tp, k, mtx)) {
          data[o + 8] = 1; data[o + 9] = f32(mtx + 8); data[o + 10] = f32(mtx + 12);
          if (data[o + 1] && Math.abs(f32(mtx + 4)) < 1e-3 && Math.abs(f32(mtx + 8)) < 1e-3) looseLikeNew(tp, k, data, o, data[o + 7], Math.hypot(f32(mtx + 8), f32(mtx + 12)));
        }
        const len = P.FPDFText_GetFontInfo(tp, k, fbuf, 256, flg);
        const name = len > 0 ? M().UTF8ToString(fbuf, 255) : '', fl = len > 0 ? i32(flg) : 0, key = name + '\u0000' + fl;
        let fk = fkey.get(key);
        if (fk === undefined) { fk = fonts.length; fonts.push([name, fl]); fkey.set(key, fk); }
        data[o + 11] = fk;
        data[o + 12] = P.FPDFText_GetFontWeight(tp, k);
        if (P.FPDFText_GetFillColor(tp, k, col, col + 4, col + 8, col + 12)) {
          data[o + 13] = 1; data[o + 14] = u32(col); data[o + 15] = u32(col + 4); data[o + 16] = u32(col + 8); data[o + 17] = u32(col + 12);
        }
      }
    } finally {
      free(mem);
      if (tp) P.FPDFText_ClosePage(tp);
    }
    return {n: Math.max(0, n), data, fonts: JSON.stringify(fonts)};
  }

  function objects(pg, type) {
    const out = [], n = P.FPDFPage_CountObjects(pg);
    for (let k = 0; k < n; k++) { const o = P.FPDFPage_GetObject(pg, k); if (o && P.FPDFPageObj_GetType(o) === type) out.push([k, o]); }
    return out;
  }
  function color(fn, o, c) {
    return fn(o, c, c + 4, c + 8, c + 12) ? [1, u32(c), u32(c + 4), u32(c + 8), u32(c + 12)] : [0];
  }
  /* линии и заливки страницы (без вложенных форм — как get_objects(max_depth=0)) */
  function pagePaths(id, i) {
    const pg = page(id, i), out = [], mem = malloc(64);
    let total = 0;
    try {
      for (const [, o] of objects(pg, 2)) {
        const n = P.FPDFPath_CountSegments(o), rec = {t: 2, n};
        total += Math.max(n, 0);
        out.push(rec);
        if (n <= 0 || n > 2000 || total > 40000) continue;      // такие фигуры чтение PDF пропускает
        rec.dm = P.FPDFPath_GetDrawMode(o, mem, mem + 4) ? [1, i32(mem), i32(mem + 4)] : [0];
        rec.fc = color(P.FPDFPageObj_GetFillColor, o, mem + 8);
        rec.sc = color(P.FPDFPageObj_GetStrokeColor, o, mem + 8);
        rec.m = P.FPDFPageObj_GetMatrix(o, mem + 24) ? [1].concat([0, 1, 2, 3, 4, 5].map(j => f32(mem + 24 + 4 * j))) : [0];
        const s = [];
        for (let k = 0; k < n; k++) {
          const seg = P.FPDFPath_GetPathSegment(o, k);
          if (!seg) { s.push([0, 0, 0, -1, 0]); continue; }
          const ok = P.FPDFPathSegment_GetPoint(seg, mem, mem + 4);
          s.push([ok ? 1 : 0, ok ? f32(mem) : 0, ok ? f32(mem + 4) : 0, P.FPDFPathSegment_GetType(seg), P.FPDFPathSegment_GetClose(seg) ? 1 : 0]);
        }
        rec.s = s;
      }
    } finally { free(mem); }
    return JSON.stringify(out);
  }
  /* выделения-примечания */
  function pageAnnots(id, i) {
    const pg = page(id, i), out = [], mem = malloc(32), n = P.FPDFPage_GetAnnotCount(pg);
    try {
      for (let k = 0; k < n; k++) {
        const a = P.FPDFPage_GetAnnot(pg, k);
        if (!a) { out.push({st: 0}); continue; }
        try {
          const rec = {st: P.FPDFAnnot_GetSubtype(a), q: []};
          const c = P.FPDFAnnot_CountAttachmentPoints(a);
          for (let j = 0; j < c; j++) if (P.FPDFAnnot_GetAttachmentPoints(a, j, mem)) rec.q.push([0, 1, 2, 3, 4, 5, 6, 7].map(x => f32(mem + 4 * x)));
          rec.r = P.FPDFAnnot_GetRect(a, mem) ? [1, f32(mem), f32(mem + 4), f32(mem + 8), f32(mem + 12)] : [0];
          out.push(rec);
        } finally { P.FPDFPage_CloseAnnot(a); }
      }
    } finally { free(mem); }
    return JSON.stringify(out);
  }
  /* рисунки: место, размеры в точках, фильтры сжатия; сами данные — imageData / imageBitmap */
  function pageImages(id, i) {
    const pg = page(id, i), out = [], mem = malloc(64);
    try {
      for (const [k, o] of objects(pg, 3)) {
        const rec = {t: 3, k};
        rec.b = P.FPDFPageObj_GetBounds(o, mem, mem + 4, mem + 8, mem + 12) ? [1, f32(mem), f32(mem + 4), f32(mem + 8), f32(mem + 12)] : [0];
        rec.md = P.FPDFImageObj_GetImageMetadata(o, pg, mem + 16)
          ? [1, u32(mem + 16), u32(mem + 20), f32(mem + 24), f32(mem + 28), u32(mem + 32), i32(mem + 36), i32(mem + 40)] : [0, 0, 0, 0, 0, 0, 0, -1];
        const f = [], nf = P.FPDFImageObj_GetImageFilterCount(o);
        for (let j = 0; j < nf; j++) {
          const len = P.FPDFImageObj_GetImageFilter(o, j, 0, 0);
          if (len <= 0) continue;
          const b = malloc(len);
          try { P.FPDFImageObj_GetImageFilter(o, j, b, len); f.push(M().UTF8ToString(b, len)); } finally { free(b); }
        }
        rec.f = f;
        out.push(rec);
      }
    } finally { free(mem); }
    return JSON.stringify(out);
  }
  function imageData(id, i, k, decoded) {
    const o = P.FPDFPage_GetObject(page(id, i), k);
    const fn = decoded ? P.FPDFImageObj_GetImageDataDecoded : P.FPDFImageObj_GetImageDataRaw;
    const len = fn(o, 0, 0);
    if (len <= 0) return new Uint8Array(0);
    const b = malloc(len);
    try { fn(o, b, len); return M().HEAPU8.slice(b, b + len); } finally { free(b); }
  }
  function imageBitmap(id, i, k) {
    const o = P.FPDFPage_GetObject(page(id, i), k);
    const bm = o && P.FPDFImageObj_GetBitmap(o);
    if (!bm) return null;
    try {
      const w = P.FPDFBitmap_GetWidth(bm), h = P.FPDFBitmap_GetHeight(bm), stride = P.FPDFBitmap_GetStride(bm);
      const fmt = P.FPDFBitmap_GetFormat(bm), p = P.FPDFBitmap_GetBuffer(bm);
      return {w, h, stride, fmt, data: M().HEAPU8.slice(p, p + stride * h)};
    } finally { P.FPDFBitmap_Destroy(bm); }
  }

  /* рамки куска текста страницы (символы s … s+n) — для выделения фразы в PDF (1.7.2): [[left, bottom, right, top]] */
  function textRects(id, i, s, n) {
    const tp = P.FPDFText_LoadPage(page(id, i)), out = [], mem = malloc(32);
    try {
      const c = tp ? P.FPDFText_CountRects(tp, s, n) : 0;
      for (let k = 0; k < c; k++) {
        if (P.FPDFText_GetRect(tp, k, mem, mem + 8, mem + 16, mem + 24)) out.push([f64(mem), f64(mem + 24), f64(mem + 16), f64(mem + 8)]);
      }
    } finally { free(mem); if (tp) P.FPDFText_ClosePage(tp); }
    return JSON.stringify(out);
  }
  /* копия документа с выделениями-примечаниями: [{p: страница, c: [R, G, B, A], q: [[x1 … y4]], r: [l, t, r, b]}] → байты */
  function saveHighlights(id, json) {
    const d = docs.get(id), list = JSON.parse(json || '[]'), mem = malloc(64);
    try {
      for (const a of list) {
        const an = P.FPDFPage_CreateAnnot(page(id, a.p), 9);           // FPDF_ANNOT_HIGHLIGHT
        if (!an) continue;
        try {
          P.FPDFAnnot_SetColor(an, 0, a.c[0], a.c[1], a.c[2], a.c[3]);
          for (const q of a.q) { q.forEach((v, j) => { M().HEAPF32[(mem >> 2) + j] = v; }); P.FPDFAnnot_AppendAttachmentPoints(an, mem); }
          if (a.r) { a.r.forEach((v, j) => { M().HEAPF32[(mem >> 2) + 8 + j] = v; }); P.FPDFAnnot_SetRect(an, mem + 32); }
        } finally { P.FPDFPage_CloseAnnot(an); }
      }
    } finally { free(mem); }
    const w = P.PDFiumExt_OpenFileWriter();
    try {
      if (!P.PDFiumExt_SaveAsCopy(d.doc, w)) throw new Error('PDF не сохраняется');
      const n = P.PDFiumExt_GetFileWriterSize(w), b = malloc(n || 1);
      try { P.PDFiumExt_GetFileWriterData(w, b, n); return M().HEAPU8.slice(b, b + n); } finally { free(b); }
    } finally { P.PDFiumExt_CloseFileWriter(w); }
  }

  return {load, ready: () => !!P, open, close, pageCount, pageSize, closePage, meta,
    pageText, pagePaths, pageAnnots, pageImages, imageData, imageBitmap, textRects, saveHighlights};
})();
