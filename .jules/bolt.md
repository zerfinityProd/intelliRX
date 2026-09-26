# Bolt's Journal - Performance Learnings

## 2026-09-26 - Pre-indexing Date Arrays in Calendar Grid Components
**Learning:** In calendar components with ~35-42 day grid cells, querying list data via `Array.prototype.filter()` per cell re-parses timestamps and performs O(C * N) iterations per render / month navigation.
**Action:** Pre-index items into a Map keyed by date string (`YYYY-M-D`) whenever inputs change (`ngOnChanges`), reducing calendar lookup from O(C * N) to O(1) per cell with zero redundant Date allocations.
