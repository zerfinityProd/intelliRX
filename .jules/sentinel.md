## 2026-10-02 - DOM XSS in Print Preview HTML Document Generation
**Vulnerability:** Unescaped user-supplied inputs (patient names, complaints, diagnosis, examinations, medicine lists) were interpolated into raw HTML template strings and written to a popup window via `win.document.write()`.
**Learning:** Bypassing Angular template rendering via `document.write()` or `window.open()` requires manual HTML entity escaping for all user-controllable fields.
**Prevention:** Always sanitize dynamic strings using HTML entity escaping (`escapeHtml`) before constructing HTML documents manually for popup windows or print frames.

## 2026-09-19 - URL Protocol Validation in Cloudflare Workers
**Vulnerability:** Unvalidated `pdfUrl` parameter in notification payload could accept arbitrary or unsafe schemes (e.g. `javascript:` or non-http protocols).
**Learning:** Cloudflare worker API endpoints accepting outbound links or media URLs must validate scheme protocols.
**Prevention:** Use standard `URL` parsing to strictly verify `http:` and `https:` schemes before constructing notification API payloads.
