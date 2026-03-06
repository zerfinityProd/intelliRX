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

  transform(value: any, format: string = 'default'): string {
    if (!value) return 'N/A';

    // Handle Firestore Timestamp objects
    if (value && typeof value.toDate === 'function') {
      value = value.toDate();
    }

    const m = moment(value);
    if (!m.isValid()) return 'N/A';

    // 'relative' is a special case → "2 hours ago"
    if (format === 'relative') return m.fromNow();

    // Look up preset or use as raw moment format string
    const fmt = this.FORMATS[format] ?? format;
    return m.format(fmt);
  }
}