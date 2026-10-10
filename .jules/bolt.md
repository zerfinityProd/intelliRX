## 2026-10-10 - Pre-index board cards by status to eliminate template change detection overhead
**Learning:** `ReceptionAppointmentBoardComponent` and `AppointmentStatusBoardComponent` evaluated `cardsFor(status)` multiple times per column on every change detection pass, calling `.filter()` across all appointments each time and allocating new arrays. Pre-grouping appointments into a `Map<string, Appointment[]>` in an `@Input()` setter reduces template calls from `O(C * E * N)` array scanning and creation to `O(1)` Map lookups.
**Action:** In Angular components with Kanban columns or categorized lists, pre-group items by status/category in an `@Input()` setter or `ngOnChanges` instead of evaluating `.filter()` inside template helper functions.

## 2026-09-18 - Pre-index visits by date key for calendar rendering
**Learning:** `PatientStatsComponent` generated calendar day cells (35–42 cells per grid) by invoking `.filter()` across all patient visits for every cell, executing `O(CELLS * VISITS)` timestamp parsing and date matching. Pre-building an `O(N)` map keyed by `YYYY-MM-DD` reduces lookups to `O(1)`.
**Action:** When rendering calendar/grid components displaying visits or appointments, check if events are filtered per cell and pre-aggregate into a date-keyed Map beforehand.
