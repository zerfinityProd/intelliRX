## 2026-09-30 - Memoize Kanban column appointment grouping in Angular template bindings
**Learning:** `ReceptionAppointmentBoardComponent` and `AppointmentStatusBoardComponent` evaluated `cardsFor(col.id)` up to 3 times per column per change detection pass (e.g. `{{ cardsFor().length }}`, `*ngIf`, `*ngFor`), triggering 9–12 redundant $O(N)$ full array filter passes and array allocations per change detection pass. Pre-grouping `filteredAppointments` by status into an internal dictionary during `ngOnChanges` converts column lookups into $O(1)$ operations.
**Action:** In Angular Kanban board or column-list components, avoid calling array `.filter()` inside template methods; pre-group items by category in `ngOnChanges` or reactive pipeline.

## 2026-09-18 - Pre-index visits by date key for calendar rendering
**Learning:** `PatientStatsComponent` generated calendar day cells (35–42 cells per grid) by invoking `.filter()` across all patient visits for every cell, executing `O(CELLS * VISITS)` timestamp parsing and date matching. Pre-building an `O(N)` map keyed by `YYYY-MM-DD` reduces lookups to `O(1)`.
**Action:** When rendering calendar/grid components displaying visits or appointments, check if events are filtered per cell and pre-aggregate into a date-keyed Map beforehand.
