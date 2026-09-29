## 2026-09-18 - Pre-index visits by date key for calendar rendering
**Learning:** `PatientStatsComponent` generated calendar day cells (35–42 cells per grid) by invoking `.filter()` across all patient visits for every cell, executing `O(CELLS * VISITS)` timestamp parsing and date matching. Pre-building an `O(N)` map keyed by `YYYY-MM-DD` reduces lookups to `O(1)`.
**Action:** When rendering calendar/grid components displaying visits or appointments, check if events are filtered per cell and pre-aggregate into a date-keyed Map beforehand.

## 2026-09-29 - Pre-index status cards and calendar cells via input setters
**Learning:** Template methods returning new filtered array instances on every call cause Angular to re-evaluate expressions and run O(K * N) filtering on every change detection cycle (e.g. `cardsFor(status)` or `appointmentsOnDate(date)`). Pre-grouping inputs into Map caches via `@Input()` setters eliminates redundant array allocations and provides O(1) lookups with stable array references.
**Action:** For Angular components rendering columns/grids from `@Input()` arrays, use setter functions to pre-group items into Map lookup caches when array references change.
