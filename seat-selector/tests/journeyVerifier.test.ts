import { describe, it, expect } from 'vitest';
import { toCanonicalDate, normalizeStation } from '../src/railway/journeyVerifier.js';

describe('JourneyVerifier Date Normalization & Station Matching (CQ-005)', () => {
  it('correctly maps ISO YYYY-MM-DD to canonical date', () => {
    expect(toCanonicalDate('2026-10-11')).toBe('2026-10-11');
  });

  it('correctly maps DD-MMM-YYYY to canonical date matching ISO date', () => {
    expect(toCanonicalDate('11-Oct-2026')).toBe('2026-10-11');
    expect(toCanonicalDate('11-OCT-2026')).toBe('2026-10-11');
    expect(toCanonicalDate('11 Oct 2026')).toBe('2026-10-11');
  });

  it('correctly recognizes equivalent dates across different formats', () => {
    const urlDoj = '11-Oct-2026';
    const journeyDate = '2026-10-11';
    expect(toCanonicalDate(urlDoj)).toBe(toCanonicalDate(journeyDate));
  });

  it('correctly rejects non-equivalent dates', () => {
    const urlDoj = '12-Oct-2026';
    const journeyDate = '2026-10-11';
    expect(toCanonicalDate(urlDoj)).not.toBe(toCanonicalDate(journeyDate));
  });

  it('normalizes station names for case and punctuation insensitivity', () => {
    expect(normalizeStation("Cox's Bazar")).toBe('coxsbazar');
    expect(normalizeStation('DHAKA')).toBe('dhaka');
    expect(normalizeStation('Dhaka ')).toBe('dhaka');
  });

  it('identifies reversed route parameters', () => {
    const urlFrom = 'Khulna';
    const urlTo = 'Dhaka';
    const journeyFrom = 'Dhaka';
    const journeyTo = 'Khulna';

    const isReversed =
      normalizeStation(urlFrom) === normalizeStation(journeyTo) &&
      normalizeStation(urlTo) === normalizeStation(journeyFrom);

    expect(isReversed).toBe(true);
  });
});
