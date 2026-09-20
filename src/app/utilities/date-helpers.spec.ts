import { describe, it, expect } from 'vitest';
import { isSlotInPast, formatTime, formatSlotLabel, isToday } from './date-helpers';
import { getWeekdayCode, isClinicOpenOnDate, getAvailabilityLabelsForDay, filterTimingsByAvailability } from './timeSlotUtils';

describe('date-helpers performance & correctness', () => {
  it('isSlotInPast accurately identifies past vs future slots for today', () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;

    // 00:00 is always in the past
    expect(isSlotInPast('00:00', todayStr)).toBe(true);

    // 23:59 is future if current time is before 23:59
    const currentMin = today.getHours() * 60 + today.getMinutes();
    if (currentMin < 23 * 60 + 59) {
      expect(isSlotInPast('23:59', todayStr)).toBe(false);
    }
  });

  it('isSlotInPast returns false for future date strings', () => {
    expect(isSlotInPast('09:00', '2099-01-01')).toBe(false);
    expect(isSlotInPast('14:30', '2099-12-31')).toBe(false);
  });

  it('isSlotInPast handles invalid inputs gracefully', () => {
    expect(isSlotInPast('', '')).toBe(false);
    expect(isSlotInPast('invalid', '2026-01-01')).toBe(false);
  });

  it('formatTime and formatSlotLabel convert 24h to 12h format', () => {
    expect(formatTime('09:05')).toBe('9:05 AM');
    expect(formatTime('14:30')).toBe('2:30 PM');
    expect(formatSlotLabel('18:00')).toBe('6:00 PM');
  });

  it('isToday correctly checks today', () => {
    expect(isToday(new Date())).toBe(true);
    expect(isToday(new Date(2000, 0, 1))).toBe(false);
  });
});

describe('timeSlotUtils performance & correctness', () => {
  it('getWeekdayCode returns correct short weekday string', () => {
    const sunday = new Date('2026-03-01T12:00:00'); // Sunday
    expect(getWeekdayCode(sunday)).toBe('Su');
  });

  it('isClinicOpenOnDate performs case-insensitive weekday matching', () => {
    const thursday = new Date('2026-03-05T12:00:00'); // Thursday ("Th")
    expect(isClinicOpenOnDate(['M', 'T', 'W', 'th', 'F'], thursday)).toBe(true);
    expect(isClinicOpenOnDate(['M', 'T', 'W'], thursday)).toBe(false);
    expect(isClinicOpenOnDate(null, thursday)).toBe(true);
  });

  it('getAvailabilityLabelsForDay handles short codes and 3-letter codes', () => {
    const thursday = new Date('2026-03-05T12:00:00');
    const availShort = { 'Th': ['FH'] };
    const availLong = { 'thu': ['SH'] };

    expect(getAvailabilityLabelsForDay(availShort, thursday).labels).toEqual(['FH']);
    expect(getAvailabilityLabelsForDay(availLong, thursday).labels).toEqual(['SH']);
  });

  it('filterTimingsByAvailability filters timings correctly', () => {
    const timings = [
      { label: 'FH', start: '09:00', end: '13:00' },
      { label: 'SH', start: '14:00', end: '18:00' }
    ];
    const filtered = filterTimingsByAvailability(timings, ['fh']);
    expect(filtered.length).toBe(1);
    expect(filtered[0].label).toBe('FH');
  });
});
