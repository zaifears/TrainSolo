import { Seat } from './seat.types.js';

export interface VerificationResult {
  success: boolean;
  mismatches: string[];
}

export class SelectionVerifier {
  /**
   * Compares intended candidate seats against what is currently selected in the DOM and Seat Details panel.
   * Strictly verifies both coach and seat identities to ensure no wrong-coach or cross-coach misallocations pass.
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
    const intendedSet = new Set(intendedSeats.map((s) => s.label.toUpperCase()));
    for (const label of seatMapSelectedLabels) {
      const cleanLabel = label.toUpperCase().trim();
      // If label includes coach prefix (e.g. KA-10), check against intended coach+seat
      const match = cleanLabel.match(/^([A-Z0-9_\u0980-\u09FF]+)\s*[-:]\s*([A-Z0-9]+)$/);
      if (match) {
        const coach = match[1];
        const num = match[2];
        const hasMatch = intendedSeats.some(
          (s) => s.coach.toUpperCase() === coach && s.label.toUpperCase() === num
        );
        if (!hasMatch) {
          mismatches.push(`Unexpected seat selected in seat-map: ${label}`);
        }
      } else if (!intendedSet.has(cleanLabel)) {
        mismatches.push(`Unexpected seat selected in seat-map: ${label}`);
      }
    }

    for (const seat of intendedSeats) {
      const expectedCoach = seat.coach.toUpperCase().trim();
      const expectedLabel = seat.label.toUpperCase().trim();
      const hasMatch = seatMapSelectedLabels.some((l) => {
        const upper = l.toUpperCase().trim();
        if (upper === `${expectedCoach}-${expectedLabel}` || upper === expectedLabel) {
          return true;
        }
        const m = upper.match(/^([A-Z0-9_\u0980-\u09FF]+)\s*[-:]\s*([A-Z0-9]+)$/);
        if (m) {
          return m[1] === expectedCoach && m[2] === expectedLabel;
        }
        return false;
      });

      if (!hasMatch) {
        mismatches.push(`Intended seat ${seat.coach}-${seat.label} is NOT recorded as selected in seat map.`);
      }
    }

    // 3. Verify Seat Details panel labels with strict coach preservation
    if (seatDetailsLabels.length > 0) {
      for (const seat of intendedSeats) {
        const expectedCoach = seat.coach.toUpperCase().trim();
        const expectedLabel = seat.label.toUpperCase().trim();
        const fullIdentifier = `${expectedCoach}-${expectedLabel}`;

        const matched = seatDetailsLabels.some((rawLabel) => {
          const upper = rawLabel.toUpperCase().trim();

          // Full identifier match
          if (upper === fullIdentifier) return true;

          // Structured match with coach and seat: "KA-10", "Coach KA Seat 10"
          const matchWithCoach =
            upper.match(/^([A-Z0-9_\u0980-\u09FF]+)\s*[-:]\s*([A-Z0-9]+)$/i) ||
            upper.match(/(?:COACH|BOGIE|বগি)\s*[:]?\s*([A-Z0-9_\u0980-\u09FF]+).*?(?:SEAT|সিট)\s*[:]?\s*([A-Z0-9]+)/i);

          if (matchWithCoach) {
            const detectedCoach = matchWithCoach[1].trim();
            const detectedSeat = matchWithCoach[2].trim();
            // Coach identity MUST match expectedCoach!
            return detectedCoach === expectedCoach && detectedSeat === expectedLabel;
          }

          // If label contains hyphen or colon indicating another coach, reject it
          if (/[-:]/.test(upper)) {
            const parts = upper.split(/[-:]/).map((p) => p.trim());
            if (parts.length >= 2 && parts[0] !== expectedCoach) {
              return false;
            }
          }

          // Solely numeric/alphanumeric seat token without coach prefix
          return upper === expectedLabel;
        });

        if (!matched) {
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
