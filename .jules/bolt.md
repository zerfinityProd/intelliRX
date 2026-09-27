## 2026-09-27 - Memoization of Date Parsing/Formatting Pipes in Angular
**Learning:** Moment.js date parsing and string formatting in template pipes (e.g. `MomentDatePipe`) is heavily executed during Angular change detection cycles. Caching formatted date strings using a bounded Map cache speeds up rendering by ~45x for repeated calls while using negligible memory.
**Action:** When working with template formatting pipes that rely on heavy libraries like Moment.js, add a bounded cache (`Map<string, string>`) for static date inputs, while bypassing dynamic formats like `'relative'`.
