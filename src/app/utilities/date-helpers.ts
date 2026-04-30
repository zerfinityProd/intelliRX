/**
 * Shared date/time helper functions.
 *
 * Extracted from home.ts, reception-home.ts, appointments-list.ts,
 * and add-appointment.ts to eliminate duplication.
 */

// ── Date comparison ─────────────────────────────────────────

/** True when both dates fall on the same calendar day (local time). */
export function isSameLocalDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

/** True when `date` is today (local time). */
export function isToday(date: Date): boolean {
    return isSameLocalDay(date, new Date());
}

/** True when `date` is strictly before today (local time). */
export function isDateInPast(date: Date): boolean {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return target < todayStart;
}

/** True when `date` is strictly after right now. */
export function isFuture(date: Date): boolean {
    return new Date(date) > new Date();
}

// ── Phone helpers ───────────────────────────────────────────

/** Strip all non-digit characters from a phone string. */
export function normalizePhoneDigits(phone: string): string {
    return String(phone || '').replace(/\D/g, '');
}

// ── Time formatting ─────────────────────────────────────────

/**
 * Format a time (Date or "HH:mm" string) into "h:mm AM/PM".
 *
 * Examples:
 *   formatTime(new Date(2026,0,1,14,30)) → "2:30 PM"
 *   formatTime("09:05")                  → "9:05 AM"
 */
export function formatTime(time: Date | string): string {
    if (!time) return '';
    if (time instanceof Date) {
        const h = time.getHours();
        const m = time.getMinutes();
        return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
    }
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${period}`;
}

/**
 * Format a slot time "HH:mm" into "h:mm AM/PM".
 * (Alias of `formatTime` for string inputs.)
 */
export function formatSlotLabel(time: string): string {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${period}`;
}

// ── Date formatting ─────────────────────────────────────────

/** Format a Date to "MMM d, yyyy" (e.g. "Apr 19, 2026"). */
export function formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });
}

/** Format a Date to local "YYYY-MM-DD" string. */
export function formatLocalDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// ── Slot helpers ────────────────────────────────────────────

/**
 * True when a time slot ("HH:mm") has already passed for a given date string.
 * Only returns true when the date is today; future dates always return false.
 */
export function isSlotInPast(slot: string, dateStr: string): boolean {
    if (!dateStr) return false;
    const today = new Date();
    const [y, mo, day] = dateStr.split('-').map(Number);
    const isDateToday = today.getFullYear() === y
        && today.getMonth() === mo - 1
        && today.getDate() === day;
    if (!isDateToday) return false;
    const [h, m] = slot.split(':').map(Number);
    const slotMinutes = h * 60 + m;
    const nowMinutes = today.getHours() * 60 + today.getMinutes();
    return slotMinutes <= nowMinutes;
}

/** Extract "HH:mm" time string from a Date. */
export function extractTimeSlot(dt: Date): string {
    return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}
