## 2026-09-18 - Pre-index visits by date key for calendar rendering
**Learning:** `PatientStatsComponent` generated calendar day cells (35–42 cells per grid) by invoking `.filter()` across all patient visits for every cell, executing `O(CELLS * VISITS)` timestamp parsing and date matching. Pre-building an `O(N)` map keyed by `YYYY-MM-DD` reduces lookups to `O(1)`.
**Action:** When rendering calendar/grid components displaying visits or appointments, check if events are filtered per cell and pre-aggregate into a date-keyed Map beforehand.

## 2026-09-19 - Pre-group board cards by status Map to prevent redundant template filtering
**Learning:** Kanban board components (`AppointmentStatusBoardComponent`, `ReceptionAppointmentBoardComponent`) called `cardsFor(col.id)` in templates 3 times per column for length, empty check, and iteration. This caused $O(\text{Columns} \times N)$ array filtering and memory allocations on every Angular change detection pass. Pre-grouping items into a status-keyed Map on input changes reduces `cardsFor(status)` to an $O(1)$ lookup returning a stable array reference.
**Action:** In Angular components with column/category templates calling filtering methods, pre-group array inputs into a Map by status/category during `ngOnChanges` or reference checks.
