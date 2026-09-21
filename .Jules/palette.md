## 2026-09-21 - Accessible Icon Buttons in Angular Views
**Learning:** Icon-only action buttons (such as edit and delete buttons in table rows or card headers) with SVG icons only provide visual tooltips via `title="..."`, which may not be announced correctly or consistently by all screen readers without an explicit `aria-label`.
**Action:** Always include an explicit `aria-label="..."` attribute alongside `title="..."` on icon-only `<button>` elements across Angular templates.
