## 2025-05-18 - Icon-Only Buttons and Modal Close Controls
**Learning:** Icon-only buttons relying solely on `title` attributes are often skipped or inconsistently announced by screen readers.
**Action:** Always provide explicit `aria-label` attributes on icon-only buttons and mark nested SVGs with `aria-hidden="true"` and `focusable="false"`.
