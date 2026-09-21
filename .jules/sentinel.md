## 2025-05-18 - Information Leakage in Cloudflare Worker Error Responses
**Vulnerability:** The Cloudflare worker catch block was returning `error.message` in HTTP 500 error responses, which exposed raw Meta API error responses (potentially containing tokens, internal IDs, or endpoint details) to client applications.
**Learning:** Returning exception error messages directly in HTTP responses can leak downstream API responses and internal details to unauthenticated or external callers.
**Prevention:** Log detailed error details server-side using `console.error` and return generic error messages (e.g., `{ error: 'Internal server error' }`) to HTTP clients.
