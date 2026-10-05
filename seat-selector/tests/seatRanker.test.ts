import { describe, it, expect } from 'vitest';
import { SeatRanker } from '../src/seats/seatRanker.js';
import { Seat } from '../src/seats/seat.types.js';
import { AppConfig } from '../src/config/schema.js';

const baseConfig: AppConfig = {
  cdpEndpoint: 'http://127.0.0.1:9222',
  railwayHost: 'eticket.railway.gov.bd',
  journey: {
    from: 'Dhaka',
    to: 'Khulna',
    date: '25-Sep-2026',
    trainNames: ['SUNDARBAN EXPRESS'],
    classes: ['S_CHAIR'],
    seatCount: 2,
  },
  preferences: {
    exactSeats: [],
    preferredCoaches: ['KA', 'KHA'],
    preferWindow: true,
    requireAdjacent: true,
    allowSameRowFallback: true,
    allowSameCoachFallback: true,
    allowSeparateFallback: false,
  },
  safety: {
    dryRun: true,
    maximumSeatClickAttempts: 2,
    allowContinuePurchase: false,
    stopOnSessionExpiry: true,
    stopOnJourneyMismatch: true,
  },
  logging: {
    level: 'info',
    redactTokens: true,
    screenshotsOnFailure: true,
    retainDays: 3,
  },
};

const createMockSeat = (coach: string, label: string, extra: Partial<Seat> = {}): Seat => ({
  coach,
  label,
  available: true,
  enabled: true,
  selected: false,
  locatorKey: `loc-${coach}-${label}`,
  type: 'UNKNOWN',
  ...extra,
});

describe('SeatRanker Ranking Order and Strategy Tests', () => {
  it('gives exact requested seats absolute precedence', () => {
    const config: AppConfig = {
      ...baseConfig,
      preferences: {
        ...baseConfig.preferences,
        exactSeats: ['GA-15', 'GA-16'],
      },
    };

    const seats: Seat[] = [
      createMockSeat('KA', '1', { type: 'WINDOW' }),
      createMockSeat('KA', '2'),
      createMockSeat('GA', '15'),
      createMockSeat('GA', '16'),
    ];

    const result = SeatRanker.rankAndSelect(seats, config);
    expect(result).not.toBeNull();
    expect(result?.strategy).toBe('EXACT');
    expect(result?.seats.map(s => s.label)).toEqual(['15', '16']);
    expect(result?.coach).toBe('GA');
  });

  it('selects adjacent seats in preferred coach before non-preferred coach', () => {
    const seats: Seat[] = [
      createMockSeat('GA', '5'),
      createMockSeat('GA', '6'), // adjacent in non-preferred coach
      createMockSeat('KA', '21'),
      createMockSeat('KA', '22'), // adjacent in preferred coach KA
    ];

    const result = SeatRanker.rankAndSelect(seats, baseConfig);
    expect(result).not.toBeNull();
    expect(result?.strategy).toBe('ADJACENT_PREFERRED');
    expect(result?.coach).toBe('KA');
    expect(result?.seats.map(s => s.label)).toEqual(['21', '22']);
  });

  it('selects adjacent seats in any coach when preferred coach has no adjacent seats', () => {
    const seats: Seat[] = [
      createMockSeat('KA', '1'),
      createMockSeat('KA', '10'), // non-adjacent in preferred coach
      createMockSeat('GA', '30'),
      createMockSeat('GA', '31'), // adjacent in non-preferred coach GA
    ];

    const result = SeatRanker.rankAndSelect(seats, baseConfig);
    expect(result).not.toBeNull();
    expect(result?.strategy).toBe('ADJACENT_ANY');
    expect(result?.coach).toBe('GA');
    expect(result?.seats.map(s => s.label)).toEqual(['30', '31']);
  });

  it('falls back to same-row seats when adjacent seats are not available', () => {
    const config: AppConfig = {
      ...baseConfig,
      journey: { ...baseConfig.journey, seatCount: 2 },
      preferences: {
        ...baseConfig.preferences,
        requireAdjacent: false, // allow same-row fallback
      },
    };

    const seats: Seat[] = [
      createMockSeat('KA', '1', { row: 'ROW_1', column: '1' }),
      createMockSeat('KA', '3', { row: 'ROW_1', column: '3' }), // same row, not adjacent col
    ];

    const result = SeatRanker.rankAndSelect(seats, config);
    expect(result).not.toBeNull();
    expect(result?.strategy).toBe('SAME_ROW_PREFERRED');
    expect(result?.seats.map(s => s.label)).toEqual(['1', '3']);
  });

  it('falls back to same coach when same-row is unavailable', () => {
    const config: AppConfig = {
      ...baseConfig,
      preferences: {
        ...baseConfig.preferences,
        requireAdjacent: false,
        allowSameRowFallback: false,
        allowSameCoachFallback: true,
      },
    };

    const seats: Seat[] = [
      createMockSeat('KA', '1'),
      createMockSeat('KA', '50'),
    ];

    const result = SeatRanker.rankAndSelect(seats, config);
    expect(result).not.toBeNull();
    expect(result?.strategy).toBe('SAME_COACH');
    expect(result?.coach).toBe('KA');
  });

  it('refuses separate seats when allowSeparateFallback is false', () => {
    const config: AppConfig = {
      ...baseConfig,
      preferences: {
        ...baseConfig.preferences,
        requireAdjacent: true,
        allowSameRowFallback: false,
        allowSameCoachFallback: false,
        allowSeparateFallback: false,
      },
    };

    const seats: Seat[] = [
      createMockSeat('KA', '1'),
      createMockSeat('KHA', '2'),
    ];

    const result = SeatRanker.rankAndSelect(seats, config);
    expect(result).toBeNull();
  });

  it('permits separate seats only when allowSeparateFallback is explicitly true', () => {
    const config: AppConfig = {
      ...baseConfig,
      preferences: {
        ...baseConfig.preferences,
        requireAdjacent: false,
        allowSameRowFallback: false,
        allowSameCoachFallback: false,
        allowSeparateFallback: true,
      },
    };

    const seats: Seat[] = [
      createMockSeat('KA', '1'),
      createMockSeat('KHA', '2'),
    ];

    const result = SeatRanker.rankAndSelect(seats, config);
    expect(result).not.toBeNull();
    expect(result?.strategy).toBe('SEPARATE');
  });

  it('returns null when available seats are less than requested seatCount', () => {
    const seats: Seat[] = [createMockSeat('KA', '1')];
    const result = SeatRanker.rankAndSelect(seats, baseConfig); // requires 2 seats
    expect(result).toBeNull();
  });
});
