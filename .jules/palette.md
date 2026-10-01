## 2026-10-01 - Calendar Widget Day Cell Accessibility Pattern
**Learning:** Custom calendar grids using `<div>`s with `(click)` lack native keyboard focusability (Tab key), button semantics, and screen reader announcements for date and appointment state.
**Action:** Always convert custom calendar date cells to `<button type="button">`, add `[attr.aria-label]` with full date and item count context, use `[attr.aria-pressed]` for selection state, and mark internal visual numbers/dots as `aria-hidden="true"`.
