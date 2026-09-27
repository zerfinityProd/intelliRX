import { describe, it, expect, beforeEach } from 'vitest';
import { MomentDatePipe } from './moment-date.pipe';

describe('MomentDatePipe', () => {
  let pipe: MomentDatePipe;

  beforeEach(() => {
    pipe = new MomentDatePipe();
  });

  it('should return N/A for empty or invalid values', () => {
    expect(pipe.transform(null)).toBe('N/A');
    expect(pipe.transform(undefined)).toBe('N/A');
    expect(pipe.transform('invalid date')).toBe('N/A');
  });

  it('should format default date format correctly', () => {
    const formatted = pipe.transform('2025-03-06T00:00:00.000Z');
    expect(formatted).toContain('2025');
  });

  it('should format preset formats (datetime, numeric, time)', () => {
    const dateStr = '2025-03-06T15:30:00.000Z';
    expect(pipe.transform(dateStr, 'numeric')).toBe('06/03/2025');
  });

  it('should handle Firestore Timestamp-like objects', () => {
    const fakeTimestamp = {
      toDate: () => new Date('2025-03-06T10:00:00.000Z')
    };
    expect(pipe.transform(fakeTimestamp, 'numeric')).toBe('06/03/2025');
  });

  it('should return cached result on subsequent calls for same input', () => {
    const dateStr = '2025-05-20T10:00:00.000Z';
    const firstCall = pipe.transform(dateStr, 'numeric');
    const secondCall = pipe.transform(dateStr, 'numeric');

    expect(firstCall).toBe('20/05/2025');
    expect(secondCall).toBe(firstCall);
  });
});
