import { Seat } from './seat.types.js';

export interface VerificationResult {
  success: boolean;
  mismatches: string[];
}

export class SelectionVerifier {
  /**
   * Compares intended candidate seats against what is currently selected in the DOM and Seat Details panel.
   */
  public static verify(
    intendedSeats: Seat[],
    seatMapSelectedLabels: string[],
    seatDetailsLabels: string[],
    expectedCount: number
  ): VerificationResult {
    const mismatches: string[] = [];

    // 1. Verify seat counts
    if (seatMapSelectedLabels.length !== expectedCount) {
      mismatches.push(
        `Seat-map selected count (${seatMapSelectedLabels.length}) does not match expected count (${expectedCount}).`
      );
    }

    if (seatDetailsLabels.length > 0 && seatDetailsLabels.length !== expectedCount) {
      mismatches.push(
        `Seat Details panel count (${seatDetailsLabels.length}) does not match expected count (${expectedCount}).`
      );
    }

    // 2. Verify all intended labels are present in seat map selections
    const intendedSet = new Set(intendedSeats.map(s => s.label.toUpperCase()));
    for (const label of seatMapSelectedLabels) {
      if (!intendedSet.has(label.toUpperCase())) {
        mismatches.push(`Unexpected seat selected in seat-map: ${label}`);
      }
    }

    for (const seat of intendedSeats) {
      if (!seatMapSelectedLabels.some(l => l.toUpperCase() === seat.label.toUpperCase())) {
        mismatches.push(`Intended seat ${seat.coach}-${seat.label} is NOT recorded as selected in seat map.`);
      }
    }

    // 3. Verify Seat Details panel labels (if panel is present)
    if (seatDetailsLabels.length > 0) {
      for (const seat of intendedSeats) {
        if (!seatDetailsLabels.some(l => l.toUpperCase().includes(seat.label.toUpperCase()))) {
          mismatches.push(`Intended seat ${seat.coach}-${seat.label} is NOT displayed in Seat Details panel.`);
        }
      }
    }

    return {
      success: mismatches.length === 0,
      mismatches,
    };
  }
}
