import { TimeSlotsConfig, DEFAULT_SYSTEM_SETTINGS } from '../config/systemSettings';
import { ClinicTiming } from '../models/clinic.model';

/**
 * Generates slot start times like `09:00`, `09:30`, ... based on configuration.
 * Assumes fixed-length slots (slotMinutes) starting at whole hours.
 */
export function generateTimeSlotsFromConfig(config: TimeSlotsConfig): string[] {
  const slots: string[] = [];
  const start = config.startHour * 60;
  const end = config.endHour * 60; // exclusive

  for (let totalMinutes = start; totalMinutes < end; totalMinutes += config.slotMinutes) {
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
  }

  return slots;
}

/**
 * Generates time slots from a clinic's timing blocks.
 * Each ClinicTiming defines a window (e.g. FH 09:00–13:00, SH 14:00–18:00).
 * Slots are generated within each window and merged into a single sorted array.
 *
 * Falls back to the global DEFAULT_SYSTEM_SETTINGS when no timings are provided.
 */
export function generateTimeSlotsFromClinicTimings(
  timings: ClinicTiming[] | undefined | null,
  slotMinutes: number = 30
): string[] {
  if (!timings || timings.length === 0) {
    return generateTimeSlotsFromConfig(DEFAULT_SYSTEM_SETTINGS.timeSlots);
  }

  const slotSet = new Set<string>();

  for (const t of timings) {
    if (!t.start || !t.end) continue;
    const [sH, sM] = t.start.split(':').map(Number);
    const [eH, eM] = t.end.split(':').map(Number);
    let startMin = sH * 60 + (sM || 0);
    const endMin = eH * 60 + (eM || 0);

    while (startMin < endMin) {
      const h = Math.floor(startMin / 60);
      const m = startMin % 60;
      slotSet.add(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
      startMin += slotMinutes;
    }
  }

  // If all timing blocks were invalid, fall back to global config
  if (slotSet.size === 0) {
    return generateTimeSlotsFromConfig(DEFAULT_SYSTEM_SETTINGS.timeSlots);
  }

  return Array.from(slotSet).sort();
}

/**
 * Looks up a doctor's available timing labels for a specific date from the
 * availability map, trying ALL known day-key formats so it works regardless
 * of which admin UI saved the data:
 *
 *   • admin-dashboard / admin-setup  → short codes: 'Su','M','T','W','Th','F','Sa'
 *   • staff-config-modal (owner)     → 3-letter lowercase: 'sun','mon','tue','wed','thu','fri','sat'
 *
 * Returns:
 *   labels    – the timing labels for that day (e.g. ['FH']) or undefined if not found.
 *   scheduled – true when the availability map has ANY days configured, meaning
 *               an unfound day means "doctor not working" (not "no restriction").
 */
export function getAvailabilityLabelsForDay(
  availability: Record<string, string[]>,
  date: Date
): { labels: string[] | undefined; scheduled: boolean } {
  const dayIndex = date.getDay(); // 0=Sun … 6=Sat

  // All known formats for each weekday, in priority order
  const SHORT_CODES = ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa'];
  const THREE_LETTER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  const keysToTry = [
    SHORT_CODES[dayIndex],   // 'Th'  – admin-dashboard / admin-setup
    THREE_LETTER[dayIndex],  // 'thu' – staff-config-modal (owner dashboard)
  ];

  const scheduled = Object.keys(availability).length > 0;

  for (const key of keysToTry) {
    if (Object.prototype.hasOwnProperty.call(availability, key)) {
      return { labels: availability[key], scheduled };
    }
  }

  // Day not listed in the map
  return { labels: undefined, scheduled };
}


/**
 * Convert a Date to a short weekday code matching the clinic schedule.weekdays format.
 * Returns: "Su", "M", "T", "W", "Th", "F", "Sa"
 */
export function getWeekdayCode(date: Date): string {
  const codes = ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa'];
  return codes[date.getDay()];
}

/**
 * Check if a clinic is open on a given date based on its schedule.weekdays array.
 * The weekdays array uses short codes like ["M","T","W","Th","F"].
 *
 * Returns true if the date's weekday appears in the array,
 * or if the weekdays array is empty/undefined (no schedule configured → assume open).
 */
export function isClinicOpenOnDate(weekdays: string[] | undefined | null, date: Date): boolean {
  if (!weekdays || weekdays.length === 0) return true; // no schedule → assume open
  const dayCode = getWeekdayCode(date);
  // Case-insensitive comparison to handle variations
  return weekdays.some(w => w.toLowerCase() === dayCode.toLowerCase());
}

/**
 * Filter a clinic's timing blocks to only those whose labels appear in
 * the doctor's availability list for a specific weekday.
 *
 * @param timings - The clinic's timing blocks to filter.
 * @param availableLabels - The labels the doctor is available for on this day.
 * @param dayExistsInAvailability - When true, the availability map exists AND
 *   was queried for a specific day. If `availableLabels` is empty/undefined AND
 *   this flag is true, it means the doctor explicitly has NO availability on this
 *   day → return empty array. When false (default), missing labels means "no
 *   restriction configured" → return all timings.
 */
export function filterTimingsByAvailability(
  timings: ClinicTiming[],
  availableLabels: string[] | undefined | null,
  dayExistsInAvailability: boolean = false
): ClinicTiming[] {
  if (!availableLabels || availableLabels.length === 0) {
    // If the doctor has an availability map but this day is not in it,
    // that means the doctor does NOT work on this day → return nothing.
    if (dayExistsInAvailability) {
      return [];
    }
    return timings; // no restriction configured → all blocks
  }
  const labelSet = new Set(availableLabels.map(l => l.toUpperCase()));
  return timings.filter(t => labelSet.has((t.label || '').toUpperCase()));
}
