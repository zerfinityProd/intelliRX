import { Pipe, PipeTransform } from '@angular/core';
import moment from 'moment';

/**
 * MomentDatePipe — shared date formatter using moment.js with memoization cache.
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

  // Maximum number of entries kept in memoization cache to prevent memory leaks
  private static readonly MAX_CACHE_SIZE = 500;

  // Memoization cache mapping `${cacheKey}` -> formatted date string
  private static readonly CACHE = new Map<string, string>();

  // Preset format map
  private readonly FORMATS: Record<string, string> = {
    'default':  'DD MMM YYYY',           // 06 Mar 2025  — ISO-style date
    'datetime': 'DD MMM YYYY, hh:mm A',  // 06 Mar 2025, 05:13 PM
    'time':     'hh:mm A',              // 05:13 PM
    'long':     'DD MMMM YYYY',          // 06 March 2025
    'short':    'DD MMM YY',             // 06 Mar 25
    'numeric':  'DD/MM/YYYY',            // 06/03/2025
  };

  transform(value: any, format: string = 'default'): string {
    if (!value) return 'N/A';

    // Handle Firestore Timestamp objects (convert to Date instance)
    if (value && typeof value.toDate === 'function') {
      value = value.toDate();
    }

    // Do not cache 'relative' format as time progresses dynamically (e.g., "2 minutes ago" -> "3 minutes ago")
    const isRelative = format === 'relative';

    // Build memoization key for string, number, or Date inputs
    let cacheKey: string | null = null;
    if (!isRelative) {
      if (typeof value === 'string' || typeof value === 'number') {
        cacheKey = `${format}:${value}`;
      } else if (value instanceof Date) {
        cacheKey = `${format}:${value.getTime()}`;
      }
    }

    if (cacheKey && MomentDatePipe.CACHE.has(cacheKey)) {
      return MomentDatePipe.CACHE.get(cacheKey)!;
    }

    const m = moment(value);
    if (!m.isValid()) return 'N/A';

    let result: string;
    // 'relative' is a special case → "2 hours ago"
    if (isRelative) {
      result = m.fromNow();
    } else {
      // Look up preset or use as raw moment format string
      const fmt = this.FORMATS[format] ?? format;
      result = m.format(fmt);
    }

    // Store in cache if key present
    if (cacheKey) {
      if (MomentDatePipe.CACHE.size >= MomentDatePipe.MAX_CACHE_SIZE) {
        // Evict oldest entry (first key in Map insertion order)
        const firstKey = MomentDatePipe.CACHE.keys().next().value;
        if (firstKey !== undefined) {
          MomentDatePipe.CACHE.delete(firstKey);
        }
      }
      MomentDatePipe.CACHE.set(cacheKey, result);
    }

    return result;
  }
}
