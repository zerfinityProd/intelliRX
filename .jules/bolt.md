## 2026-03-06 - Date Formatting Pipe Memoization
**Learning:** Pure Angular pipes executing external library calls like `moment(value).format()` still incur heavy object creation and parsing costs when evaluated in loops or lists during template checks.
**Action:** Memoize string/primitive date parsing results with a bounded Map cache inside pure pipes to eliminate redundant Moment object instantiations.
