import { Pipe, PipeTransform } from '@angular/core';
import moment from 'moment';

/**
 * MomentDatePipe — shared date formatter using moment.js
 *
 * Usage in templates:
 *   {{ date | momentDate }}              → "06 Mar 2025"        (ISO default)
 *   {{ date | momentDate:'datetime' }}   → "06 Mar 2025, 05:13 PM"
 *   {{ date | momentDate:'time' }}       → "05:13 PM"
 *   {{ date | momentDate:'long' }}       → "06 March 2025"
 *   {{ date | momentDate:'relative' }}   → "2 hours ago"
 *   {{ date | momentDate:'YYYY-MM-DD' }} → "2025-03-06"  (any custom moment format)
 */
@Pipe({
  name: 'momentDate',
  standalone: true,
  pure: true
})
export class MomentDatePipe implements PipeTransform {

  // Preset format map
  private readonly FORMATS: Record<string, string> = {
    'default':  'DD MMM YYYY',           // 06 Mar 2025  — ISO-style date
    'datetime': 'DD MMM YYYY, hh:mm A',  // 06 Mar 2025, 05:13 PM
    'time':     'hh:mm A',              // 05:13 PM
    'long':     'DD MMMM YYYY',          // 06 March 2025
    'short':    'DD MMM YY',             // 06 Mar 25
    'numeric':  'DD/MM/YYYY',            // 06/03/2025
  };

  // Performance Optimization (Bolt ⚡): Cache formatted date strings to avoid repeated Moment.js parsing/formatting overhead during change detection.
  private readonly cache = new Map<string, string>();
  private readonly MAX_CACHE_SIZE = 500;

  transform(value: any, format: string = 'default'): string {
    if (!value) return 'N/A';

    // Handle Firestore Timestamp objects
    if (value && typeof value.toDate === 'function') {
      value = value.toDate();
    }

    // Relative format is dynamic relative to current wall time → skip memoization
    if (format === 'relative') {
      const m = moment(value);
      return m.isValid() ? m.fromNow() : 'N/A';
    }

    // Extract primitive cache key value where possible
    let keyVal: any = value;
    if (value instanceof Date) {
      keyVal = value.getTime();
    } else if (typeof value !== 'string' && typeof value !== 'number') {
      // Fallback for non-primitive object types that aren't Date/Timestamp
      const m = moment(value);
      if (!m.isValid()) return 'N/A';
      const fmt = this.FORMATS[format] ?? format;
      return m.format(fmt);
    }

    const cacheKey = `${format}|${keyVal}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const m = moment(value);
    if (!m.isValid()) return 'N/A';

    // Look up preset or use as raw moment format string
    const fmt = this.FORMATS[format] ?? format;
    const result = m.format(fmt);

    // Evict oldest entry if max cache size is reached (simple LRU/FIFO eviction)
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(cacheKey, result);
    return result;
  }
}