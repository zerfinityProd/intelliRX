/**
 * Returns the current local date as a YYYY-MM-DD string.
 *
 * Unlike `new Date().toISOString().split('T')[0]`, this uses
 * local time components so the result matches the user's timezone.
 */
export function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
