import { describe, it, expect } from 'vitest';
import { SeatParser, RawDomSeatData } from '../src/seats/seatParser.js';

describe('SeatParser Unit & Fixture Tests', () => {
  it('rejects legend elements resembling seats', () => {
    const raw: RawDomSeatData[] = [
      {
        coach: 'KA',
        label: 'Available',
        classList: ['seat-legend', 'available'],
        disabled: false,
        ariaDisabled: false,
        selected: false,
        visible: true,
        width: 30,
        height: 30,
        isLegend: true,
        locatorKey: 'legend-1',
      },
      {
        coach: 'KA',
        label: 'KA-1',
        classList: ['seat', 'available'],
        disabled: false,
        ariaDisabled: false,
        selected: false,
        visible: true,
        width: 30,
        height: 30,
        isLegend: false,
        locatorKey: 'seat-1',
      },
    ];

    const result = SeatParser.parseSeats(raw);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('KA-1');
  });

  it('filters out booked, occupied, or disabled seats', () => {
    const raw: RawDomSeatData[] = [
      {
        coach: 'KA',
        label: 'KA-1',
        classList: ['seat', 'seat-booked'],
        disabled: true,
        ariaDisabled: false,
        selected: false,
        visible: true,
        width: 30,
        height: 30,
        isLegend: false,
        locatorKey: 's1',
      },
      {
        coach: 'KA',
        label: 'KA-2',
        classList: ['seat', 'seat-available'],
        disabled: false,
        ariaDisabled: false,
        selected: false,
        visible: true,
        width: 30,
        height: 30,
        isLegend: false,
        locatorKey: 's2',
      },
      {
        coach: 'KA',
        label: 'KA-3',
        classList: ['seat', 'occupied'],
        disabled: false,
        ariaDisabled: false,
        selected: false,
        visible: true,
        width: 30,
        height: 30,
        isLegend: false,
        locatorKey: 's3',
      },
    ];

    const result = SeatParser.parseSeats(raw);
    expect(result).toHaveLength(3);
    expect(result.find(s => s.label === 'KA-1')?.available).toBe(false);
    expect(result.find(s => s.label === 'KA-2')?.available).toBe(true);
    expect(result.find(s => s.label === 'KA-3')?.available).toBe(false);
  });

  it('rejects duplicate seat labels and hidden zero-size elements', () => {
    const raw: RawDomSeatData[] = [
      {
        coach: 'KA',
        label: '1',
        classList: ['seat', 'available'],
        disabled: false,
        ariaDisabled: false,
        selected: false,
        visible: true,
        width: 30,
        height: 30,
        isLegend: false,
        locatorKey: 's1',
      },
      {
        coach: 'KA',
        label: '1', // duplicate
        classList: ['seat', 'available'],
        disabled: false,
        ariaDisabled: false,
        selected: false,
        visible: true,
        width: 30,
        height: 30,
        isLegend: false,
        locatorKey: 's1-dup',
      },
      {
        coach: 'KA',
        label: '2',
        classList: ['seat', 'available'],
        disabled: false,
        ariaDisabled: false,
        selected: false,
        visible: false, // hidden!
        width: 0,
        height: 0,
        isLegend: false,
        locatorKey: 's2-hidden',
      },
    ];

    const result = SeatParser.parseSeats(raw);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('1');
  });

  it('identifies window and aisle seat attributes correctly when present', () => {
    const raw: RawDomSeatData[] = [
      {
        coach: 'KHA',
        label: '1',
        ariaLabel: 'Seat 1 Window',
        classList: ['seat', 'available'],
        disabled: false,
        ariaDisabled: false,
        selected: false,
        visible: true,
        width: 30,
        height: 30,
        isLegend: false,
        locatorKey: 's1',
      },
      {
        coach: 'KHA',
        label: '2',
        ariaLabel: 'Seat 2 Aisle',
        classList: ['seat', 'available'],
        disabled: false,
        ariaDisabled: false,
        selected: false,
        visible: true,
        width: 30,
        height: 30,
        isLegend: false,
        locatorKey: 's2',
      },
    ];

    const result = SeatParser.parseSeats(raw);
    expect(result[0].type).toBe('WINDOW');
    expect(result[1].type).toBe('AISLE');
  });
});
