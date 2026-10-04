## 2026-09-18 - Pre-index visits by date key for calendar rendering
**Learning:** `PatientStatsComponent` generated calendar day cells (35–42 cells per grid) by invoking `.filter()` across all patient visits for every cell, executing `O(CELLS * VISITS)` timestamp parsing and date matching. Pre-building an `O(N)` map keyed by `YYYY-MM-DD` reduces lookups to `O(1)`.
**Action:** When rendering calendar/grid components displaying visits or appointments, check if events are filtered per cell and pre-aggregate into a date-keyed Map beforehand.

## 2026-10-04 - Pre-group Kanban board cards by status
**Learning:** `AppointmentStatusBoardComponent` and `ReceptionAppointmentBoardComponent` evaluated `cardsFor(status)` 3 times per column across 3 columns (9 times per change detection pass), executing `$O(N)$` array filtering and instantiating 9 new arrays on every template evaluation cycle. Pre-grouping appointments into a `cardsByStatus` Map on `ngOnChanges` / `ngDoCheck` reduces lookups to `$O(1)$` and returns stable array references that prevent unnecessary Angular change detection re-evaluations.
**Action:** When rendering multi-column or multi-category board templates, pre-group items by category in component lifecycle hooks rather than filtering inline in template methods.
