# Сторонние компоненты мобильной версии

Мобильная версия конструктора работает в браузере и включает свободные компоненты.
Тексты лицензий лежат рядом, в этой же папке.

| Компонент | Для чего | Лицензия | Файл лицензии |
|---|---|---|---|
| @aiden0z/pptx-renderer | превью слайдов | Apache-2.0 | LICENSE.pptx-renderer.txt, THIRD_PARTY_NOTICES.md, mtx-decompressor-MPL-2.0.txt, ECMA-text-copyright-notice.txt |
| @mlc-ai/web-llm | встроенная модель ИИ | Apache-2.0 | LICENSE.web-llm.txt |
| @embedpdf/pdfium 2.15.1 | чтение PDF (сборка PDFium в WebAssembly) | MIT | LICENSE.embedpdf-pdfium.txt |
| PDFium (Google) | чтение PDF | BSD-3-Clause и лицензии входящих в него библиотек | LICENSE.pdfium.txt |
| Pyodide 0.25 | Python в браузере (папка runtime/pyodide) | MPL-2.0 | https://github.com/pyodide/pyodide/blob/main/LICENSE |
| Python 3.11 (в составе Pyodide) | движок конструктора | PSF License | https://docs.python.org/3/license.html |

Библиотеки Python движка (архив runtime/site-*.zip) — те же, что в Windows-версии:
Flask, Werkzeug, Jinja2, MarkupSafe, itsdangerous, click, blinker (BSD-3-Clause), python-pptx,
python-docx, openpyxl, et_xmlfile, XlsxWriter, typing_extensions (MIT / BSD / PSF), Pillow
(MIT-CMU), lxml (BSD-3-Clause). Тексты лицензий — в папках *.dist-info внутри архива и на
страницах проектов.
