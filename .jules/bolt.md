## 2026-09-19 - Template Getters Trigger Repeated Array Filters in Angular Kanban Boards
**Learning:** Angular template bindings calling methods or getters like `cardsFor(col.id)` in nested loops (e.g., column headers, counts, empty checks, card lists) execute array `.filter(...)` operations 9+ times per change detection cycle.
**Action:** Pre-group items in `ngOnChanges` or reactive signals into a `Map<Status, Item[]>` and perform O(1) Map lookups in template helper functions.
