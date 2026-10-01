## 2026-09-19 - URL Protocol Validation in Cloudflare Workers
**Vulnerability:** Unvalidated `pdfUrl` parameter in notification payload could accept arbitrary or unsafe schemes (e.g. `javascript:` or non-http protocols).
**Learning:** Cloudflare worker API endpoints accepting outbound links or media URLs must validate scheme protocols.
**Prevention:** Use standard `URL` parsing to strictly verify `http:` and `https:` schemes before constructing notification API payloads.

## 2026-10-01 - Error Sanitization in Cloudflare Workers
**Vulnerability:** Returning raw `error.message` in 500 HTTP responses exposed internal exceptions and third-party Meta Graph API response payloads (which may contain sensitive tokens, account IDs, or internal errors).
**Learning:** Worker exception handlers must log internal error details server-side via `console.error` and return generic error messages to API callers.
**Prevention:** Always sanitize exception messages in API responses to prevent information exposure.
