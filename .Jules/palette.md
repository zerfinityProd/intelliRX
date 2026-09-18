# Palette's Journal - Critical Learnings

## 2026-09-18 - Accessibility Labels for Calendar Navigation Buttons
**Learning:** Icon-only navigation buttons in UI widgets (such as calendar month navigation buttons) are read as unlabelled controls by screen readers if `aria-label` is missing and SVG icons lack `aria-hidden="true"`.
**Action:** Always ensure all icon-only buttons have descriptive `aria-label` attributes and embedded SVG icons have `aria-hidden="true"` and `focusable="false"`.
