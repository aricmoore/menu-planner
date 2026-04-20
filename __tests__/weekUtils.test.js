import { describe, it, expect } from 'vitest';
import {
  getWeekId,
  getWeekStartDate,
  getWeekEndDate,
  getWeekIdFromDate,
  formatWeekRange,
  isDateInWeek,
  getAdjacentWeekId,
  getPastWeekIds,
  createWeekRecord,
} from '../utils/weekUtils.js';

// ─── getWeekId ────────────────────────────────────────────────────────────────
// ISO 8601: week 1 is the week containing the first Thursday of the year.
// Jan 1 2026 is a Thursday → Week 1 starts Mon Dec 29, 2025.

describe('getWeekId', () => {
  it('returns correct ISO week for a known Thursday', () => {
    // Jan 1 2026 is Thursday — that is week 1 of 2026
    expect(getWeekId(new Date('2026-01-01T12:00:00'))).toBe('2026-W01');
  });

  it('returns correct ISO week for a Monday', () => {
    // Jan 5 2026 is Monday — that is week 2 of 2026
    expect(getWeekId(new Date('2026-01-05T12:00:00'))).toBe('2026-W02');
  });

  it('returns correct ISO week for a Sunday', () => {
    // Jan 4 2026 is Sunday — still in week 1 (week ends Sunday)
    expect(getWeekId(new Date('2026-01-04T12:00:00'))).toBe('2026-W01');
  });

  it('handles year boundary correctly (ISO week year differs from calendar year)', () => {
    // Dec 29 2025 is Monday — it's week 1 of *2026* (ISO year)
    expect(getWeekId(new Date('2025-12-29T12:00:00'))).toBe('2026-W01');
  });

  it('returns consistent result format', () => {
    const id = getWeekId(new Date('2026-04-13T12:00:00'));
    expect(id).toMatch(/^\d{4}-W\d{2}$/);
  });
});

// ─── getWeekStartDate ─────────────────────────────────────────────────────────

describe('getWeekStartDate', () => {
  it('returns Monday of the given week', () => {
    // Week 4 of 2026: Mon Jan 19 – Sun Jan 25
    expect(getWeekStartDate('2026-W04')).toBe('2026-01-19');
  });

  it('returns Monday for week 1 of 2026', () => {
    // Week 1 of 2026 starts Dec 29, 2025
    expect(getWeekStartDate('2026-W01')).toBe('2025-12-29');
  });

  it('returns a string in YYYY-MM-DD format', () => {
    const result = getWeekStartDate('2026-W16');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a fallback for an invalid weekId', () => {
    // Should not throw — returns a valid date string as fallback
    const result = getWeekStartDate('not-a-week');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a fallback for null or undefined', () => {
    expect(getWeekStartDate(null)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(getWeekStartDate(undefined)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── getWeekEndDate ───────────────────────────────────────────────────────────

describe('getWeekEndDate', () => {
  it('returns Sunday of the given week', () => {
    // Week 4 of 2026: Mon Jan 19 – Sun Jan 25
    expect(getWeekEndDate('2026-W04')).toBe('2026-01-25');
  });

  it('is always 6 days after the start date', () => {
    const start = new Date(getWeekStartDate('2026-W16') + 'T12:00:00');
    const end = new Date(getWeekEndDate('2026-W16') + 'T12:00:00');
    const diffDays = (end - start) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(6);
  });
});

// ─── getWeekIdFromDate ────────────────────────────────────────────────────────

describe('getWeekIdFromDate', () => {
  it('converts a date string to a week ID', () => {
    expect(getWeekIdFromDate('2026-01-19')).toBe('2026-W04');
  });

  it('handles Sunday correctly (still in same week as Monday)', () => {
    // Jan 25 2026 is Sunday, same week as Jan 19
    expect(getWeekIdFromDate('2026-01-25')).toBe('2026-W04');
  });

  it('correctly handles year-boundary dates', () => {
    expect(getWeekIdFromDate('2025-12-29')).toBe('2026-W01');
    expect(getWeekIdFromDate('2025-12-28')).toBe('2025-W52');
  });
});

// ─── Round-trip consistency ───────────────────────────────────────────────────

describe('round-trip: getWeekIdFromDate(getWeekStartDate(id)) === id', () => {
  const weekIds = ['2026-W01', '2026-W04', '2026-W16', '2026-W52', '2025-W52'];

  weekIds.forEach(weekId => {
    it(`round-trips correctly for ${weekId}`, () => {
      const start = getWeekStartDate(weekId);
      const recovered = getWeekIdFromDate(start);
      expect(recovered).toBe(weekId);
    });
  });
});

// ─── formatWeekRange ──────────────────────────────────────────────────────────

describe('formatWeekRange', () => {
  it('formats a week within the same month', () => {
    // Week 4: Jan 19 – Jan 25 2026
    expect(formatWeekRange('2026-W04')).toBe('Jan 19 - 25, 2026');
  });

  it('formats a week that spans two months', () => {
    // Week 5: Jan 26 – Feb 1 2026
    expect(formatWeekRange('2026-W05')).toBe('Jan 26 - Feb 1, 2026');
  });
});

// ─── isDateInWeek ─────────────────────────────────────────────────────────────

describe('isDateInWeek', () => {
  it('returns true for a date inside the week', () => {
    expect(isDateInWeek('2026-01-21', '2026-W04')).toBe(true); // Wednesday
  });

  it('returns true for the first day of the week (Monday)', () => {
    expect(isDateInWeek('2026-01-19', '2026-W04')).toBe(true);
  });

  it('returns true for the last day of the week (Sunday)', () => {
    expect(isDateInWeek('2026-01-25', '2026-W04')).toBe(true);
  });

  it('returns false for a date in the previous week', () => {
    expect(isDateInWeek('2026-01-18', '2026-W04')).toBe(false);
  });

  it('returns false for a date in the next week', () => {
    expect(isDateInWeek('2026-01-26', '2026-W04')).toBe(false);
  });
});

// ─── getAdjacentWeekId ────────────────────────────────────────────────────────

describe('getAdjacentWeekId', () => {
  it('returns the next week', () => {
    expect(getAdjacentWeekId('2026-W04', 1)).toBe('2026-W05');
  });

  it('returns the previous week', () => {
    expect(getAdjacentWeekId('2026-W04', -1)).toBe('2026-W03');
  });

  it('handles crossing year boundaries forward', () => {
    // Last week of 2025 → first week of 2026
    expect(getAdjacentWeekId('2025-W52', 1)).toBe('2026-W01');
  });

  it('handles crossing year boundaries backward', () => {
    expect(getAdjacentWeekId('2026-W01', -1)).toBe('2025-W52');
  });
});

// ─── getPastWeekIds ───────────────────────────────────────────────────────────

describe('getPastWeekIds', () => {
  it('returns the requested number of unique week IDs', () => {
    const weeks = getPastWeekIds(4);
    expect(weeks.length).toBe(4);
  });

  it('returns week IDs in the correct format', () => {
    getPastWeekIds(3).forEach(id => {
      expect(id).toMatch(/^\d{4}-W\d{2}$/);
    });
  });

  it('defaults to 4 weeks', () => {
    expect(getPastWeekIds().length).toBe(4);
  });
});

// ─── createWeekRecord ─────────────────────────────────────────────────────────

describe('createWeekRecord', () => {
  it('creates a record with the correct weekId', () => {
    const record = createWeekRecord('2026-W04');
    expect(record.weekId).toBe('2026-W04');
  });

  it('sets status to draft', () => {
    const record = createWeekRecord('2026-W04');
    expect(record.status).toBe('draft');
  });

  it('includes startDate and endDate', () => {
    const record = createWeekRecord('2026-W04');
    expect(record.startDate).toBe('2026-01-19');
    expect(record.endDate).toBe('2026-01-25');
  });

  it('initializes operational state as empty', () => {
    const record = createWeekRecord('2026-W04');
    expect(record.kdsStatus).toEqual({});
    expect(record.readyForDelivery).toEqual([]);
    expect(record.deliveryLog).toEqual([]);
    expect(record.groceryBills).toEqual([]);
  });
});
