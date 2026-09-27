# Palette UX & Accessibility Journal

## 2026-09-27 - Disabled Time-Slot Accessibility & Status Context
**Learning:** Grid buttons that are disabled (e.g., booked slots, doctor leave, past times) often lack explicit screen reader feedback and hover tooltips, leaving users unaware of why a slot cannot be selected.
**Action:** Always provide descriptive `[attr.aria-label]`, `[attr.aria-pressed]`, and hover `[attr.title]` attributes using a status helper method for grid button components.
