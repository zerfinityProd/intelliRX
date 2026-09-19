## 2026-09-19 - URL Protocol Validation in Cloudflare Workers
**Vulnerability:** Unvalidated `pdfUrl` parameter in notification payload could accept arbitrary or unsafe schemes (e.g. `javascript:` or non-http protocols).
**Learning:** Cloudflare worker API endpoints accepting outbound links or media URLs must validate scheme protocols.
**Prevention:** Use standard `URL` parsing to strictly verify `http:` and `https:` schemes before constructing notification API payloads.
