import { describe, it, expect } from 'vitest';
import { SelectionVerifier } from '../src/seats/selectionVerifier.js';
import { Seat } from '../src/seats/seat.types.js';

const mockSeat = (coach: string, label: string): Seat => ({
  coach,
  label,
  available: true,
  enabled: true,
  selected: true,
  locatorKey: `loc-${coach}-${label}`,
  type: 'UNKNOWN',
});

describe('SelectionVerifier Post-Click Verification Tests', () => {
  it('passes when intended seats, map selections, and details panel match exactly', () => {
    const intended: Seat[] = [mockSeat('KA', '10'), mockSeat('KA', '11')];
    const mapLabels = ['10', '11'];
    const detailsLabels = ['KA-10', 'KA-11'];

    const result = SelectionVerifier.verify(intended, mapLabels, detailsLabels, 2);
    expect(result.success).toBe(true);
    expect(result.mismatches).toHaveLength(0);
  });

  it('fails and detects count mismatch when seat-map selected count differs from expected', () => {
    const intended: Seat[] = [mockSeat('KA', '10'), mockSeat('KA', '11')];
    const mapLabels = ['10']; // Only 1 clicked
    const detailsLabels = ['KA-10'];

    const result = SelectionVerifier.verify(intended, mapLabels, detailsLabels, 2);
    expect(result.success).toBe(false);
    expect(result.mismatches.some(m => m.includes('Seat-map selected count (1)'))).toBe(true);
  });

  it('fails when an unexpected seat is selected in the DOM', () => {
    const intended: Seat[] = [mockSeat('KA', '10')];
    const mapLabels = ['99']; // Wrong seat clicked
    const detailsLabels = ['KA-99'];

    const result = SelectionVerifier.verify(intended, mapLabels, detailsLabels, 1);
    expect(result.success).toBe(false);
    expect(result.mismatches.some(m => m.includes('Unexpected seat selected in seat-map: 99'))).toBe(true);
  });

  it('fails when Seat Details panel disagrees with intended seats', () => {
    const intended: Seat[] = [mockSeat('KA', '10')];
    const mapLabels = ['10'];
    const detailsLabels = ['KA-20']; // Disagreement in panel

    const result = SelectionVerifier.verify(intended, mapLabels, detailsLabels, 1);
    expect(result.success).toBe(false);
    expect(result.mismatches.some(m => m.includes('is NOT displayed in Seat Details panel'))).toBe(true);
  });
});
