## 2026-10-06 - Interactive Calendar Accessibility Pattern
**Learning:** Custom interactive elements (such as `<div>` grid cells in calendar widgets) must include explicit `role="button"`, `tabindex="0"`, dynamic `aria-label` describing content/state, and keydown handlers (`keydown.enter`, `keydown.space`) to be fully accessible for keyboard and screen reader users.
**Action:** Always add semantic roles, keyboard bindings, and descriptive ARIA labels when making non-native elements clickable in Angular component templates.
