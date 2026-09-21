import { describe, it, expect, beforeEach } from 'vitest';
import { MomentDatePipe } from './moment-date.pipe';

describe('MomentDatePipe', () => {
  let pipe: MomentDatePipe;

  beforeEach(() => {
    pipe = new MomentDatePipe();
  });

  it('should return N/A for null, undefined, or empty values', () => {
    expect(pipe.transform(null)).toBe('N/A');
    expect(pipe.transform(undefined)).toBe('N/A');
    expect(pipe.transform('')).toBe('N/A');
  });

  it('should format ISO date strings with default format', () => {
    const formatted = pipe.transform('2025-03-06');
    expect(formatted).toBe('06 Mar 2025');
  });

  it('should format dates with custom presets', () => {
    const dateStr = '2025-03-06T17:13:00Z';
    expect(pipe.transform(dateStr, 'short')).toBe('06 Mar 25');
    expect(pipe.transform(dateStr, 'numeric')).toBe('06/03/2025');
    expect(pipe.transform(dateStr, 'long')).toBe('06 March 2025');
  });

  it('should format dates with custom moment format string', () => {
    const dateStr = '2025-03-06';
    expect(pipe.transform(dateStr, 'YYYY/MM/DD')).toBe('2025/03/06');
  });

  it('should handle Date objects and Firestore Timestamp objects', () => {
    const date = new Date(2025, 2, 6);
    expect(pipe.transform(date)).toBe('06 Mar 2025');

    const fakeFirestoreTimestamp = {
      toDate: () => new Date(2025, 2, 6)
    };
    expect(pipe.transform(fakeFirestoreTimestamp)).toBe('06 Mar 2025');
  });

  it('should return N/A for invalid date input', () => {
    expect(pipe.transform('invalid-date-string')).toBe('N/A');
  });

  it('should cache results for identical primitive inputs', () => {
    const input = '1990-05-15';
    const firstCall = pipe.transform(input, 'default');
    const secondCall = pipe.transform(input, 'default');

    expect(firstCall).toBe('15 May 1990');
    expect(secondCall).toBe('15 May 1990');
    expect(firstCall).toBe(secondCall);
  });

  it('should handle relative format without caching error', () => {
    const now = new Date();
    const result = pipe.transform(now, 'relative');
    expect(typeof result).toBe('string');
    expect(result).toContain('ago') || expect(result).toContain('in');
  });
});
