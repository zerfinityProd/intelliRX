## 2026-09-18 - Pre-index visits by date key for calendar rendering
**Learning:** `PatientStatsComponent` generated calendar day cells (35–42 cells per grid) by invoking `.filter()` across all patient visits for every cell, executing `O(CELLS * VISITS)` timestamp parsing and date matching. Pre-building an `O(N)` map keyed by `YYYY-MM-DD` reduces lookups to `O(1)`.
**Action:** When rendering calendar/grid components displaying visits or appointments, check if events are filtered per cell and pre-aggregate into a date-keyed Map beforehand.

## 2026-10-08 - Pre-index appointments by status in Kanban board components
**Learning:** Template methods bound in `*ngFor` or `*ngIf` expressions (such as `cardsFor(status)`) run multiple times per column on every change detection cycle. Executing `.filter()` inside these methods causes `O(COLUMNS * N)` array passes per change detection pass. Pre-indexing into `Record<string, Appointment[]>` in `ngOnChanges` reduces lookups to `O(1)`.
**Action:** In Angular Kanban or status-column components, avoid calling `.filter()` in template methods. Instead, implement `OnChanges` and pre-group items by column status into a Record or Map.
