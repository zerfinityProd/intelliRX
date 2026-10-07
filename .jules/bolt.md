## 2026-09-18 - Pre-index visits by date key for calendar rendering
**Learning:** `PatientStatsComponent` generated calendar day cells (35–42 cells per grid) by invoking `.filter()` across all patient visits for every cell, executing `O(CELLS * VISITS)` timestamp parsing and date matching. Pre-building an `O(N)` map keyed by `YYYY-MM-DD` reduces lookups to `O(1)`.
**Action:** When rendering calendar/grid components displaying visits or appointments, check if events are filtered per cell and pre-aggregate into a date-keyed Map beforehand.

## 2026-10-07 - Pre-group Kanban board items by column/status on input change
**Learning:** `AppointmentStatusBoardComponent` called `cardsFor(col.id)` in Angular HTML template expressions multiple times per column (`.length`, `*ngIf`, `*ngFor`). Each invocation executed an `O(N)` `.filter()` on `filteredAppointments`. Pre-building a `cardsByStatusMap` in `ngOnChanges` turns template lookups into $O(1)$ operations and prevents object creation overhead on fallback empty arrays.
**Action:** In Angular components rendered in templates or loops, avoid calling array `.filter()` methods directly in getters/template methods. Pre-aggregate data in `ngOnChanges` into maps with static empty-array fallback references.
