## 2026-09-24 - DOM XSS in Print Window HTML Generation
**Vulnerability:** Unescaped user inputs (patient names, notes, chief complaints, diagnosis, examinations, medicines) were concatenated into an HTML template string and written directly via `win.document.write(html)` in `openPrintWindow`.
**Learning:** `document.write` with dynamic user content in popup windows is a DOM XSS vector if input strings are not explicitly escaped into HTML entities.
**Prevention:** Sanitize user-provided strings with HTML entity escaping (`&`, `<`, `>`, `"`, `'`) before building dynamic HTML strings for print or popups.
