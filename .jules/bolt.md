## 2026-09-18 - Pre-index visits by date key for calendar rendering
**Learning:** `PatientStatsComponent` generated calendar day cells (35–42 cells per grid) by invoking `.filter()` across all patient visits for every cell, executing `O(CELLS * VISITS)` timestamp parsing and date matching. Pre-building an `O(N)` map keyed by `YYYY-MM-DD` reduces lookups to `O(1)`.
**Action:** When rendering calendar/grid components displaying visits or appointments, check if events are filtered per cell and pre-aggregate into a date-keyed Map beforehand.

## 2026-09-28 - Pre-index Kanban board cards by status to eliminate template change detection filter overhead
**Learning:** Kanban components (`ReceptionAppointmentBoardComponent` and `AppointmentStatusBoardComponent`) evaluated `cardsFor(status)` in Angular template bindings multiple times per column on every change detection pass, triggering repeated $O(\text{COLUMNS} \times \text{APPOINTMENTS})$ `filter()` runs and instantiating new Date objects per card in `isToday()`. Pre-grouping appointments into a `cardsByStatusMap` Map on `ngOnChanges` provides $O(1)$ stable array reference lookups and avoids GC pressure.
**Action:** For Angular components rendering lists grouped by category or status, pre-aggregate items on input change rather than filtering dynamically inside template method calls.
