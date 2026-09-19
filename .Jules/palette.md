## 2026-09-19 - Accessible Labels for Sub-component Calendar Controls & Kanban Action Buttons
**Learning:** Custom calendar dropdowns and Kanban board action buttons in sub-components often omit `aria-label` attributes, making them ambiguous to screen reader users in multi-card contexts. Adding context-rich `aria-label` and `[attr.aria-label]` properties improves screen reader navigation significantly without altering visual layout.
**Action:** Always verify icon-only sub-component controls and repeat action buttons in lists/grids include descriptive ARIA labels.
