## 2026-09-25 - TrackBy on Angular *ngFor loops
**Learning:** Large list/board re-renders in Angular Kanban components (like `AppointmentStatusBoardComponent`) can cause expensive DOM tear-down and re-creation without explicit `trackBy` identity functions.
**Action:** Always add `trackBy` identity tracking functions (e.g. tracking by unique `id` or fallback index) when iterating over dynamic lists in Angular `*ngFor` directives.
