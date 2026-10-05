import { Seat, SeatType } from './seat.types.js';

export interface RawDomSeatData {
  coach: string;
  label: string;
  ariaLabel?: string | null;
  classList: string[];
  disabled: boolean;
  ariaDisabled: boolean;
  selected: boolean;
  visible: boolean;
  width: number;
  height: number;
  isLegend: boolean;
  seatTypeAttr?: string | null;
  locatorKey: string;
}

export class SeatParser {
  /**
   * Filters and normalizes raw DOM seat objects into verified Seat instances.
   * Rejects legends, zero-sized elements, unavailable/occupied seats, and duplicate labels.
   */
  public static parseSeats(rawSeats: RawDomSeatData[], expectedCoach?: string): Seat[] {
    const validSeats: Seat[] = [];
    const seenLabels = new Set<string>();

    for (const raw of rawSeats) {
      // 1. Legend filter
      if (raw.isLegend) continue;

      // 2. Visible and non-zero size
      if (!raw.visible || raw.width <= 0 || raw.height <= 0) continue;

      // 3. Meaningful label
      const cleanLabel = (raw.label || '').trim();
      if (!cleanLabel || cleanLabel.length > 10) continue;

      // Filter out common legend text labels
      const lower = cleanLabel.toLowerCase();
      if (['available', 'booked', 'selected', 'legend', 'toilet', 'door'].includes(lower)) {
        continue;
      }

      // 4. Coach match if specified
      const cleanCoach = (raw.coach || '').split(/[- (]/)[0].trim().toUpperCase();
      const cleanExpected = expectedCoach ? expectedCoach.split(/[- (]/)[0].trim().toUpperCase() : '';
      if (cleanExpected && cleanCoach && cleanCoach !== cleanExpected) {
        continue;
      }

      // 5. Unique label check per coach
      const uniqueKey = `${cleanCoach}-${cleanLabel}`;
      if (seenLabels.has(uniqueKey)) {
        continue;
      }
      seenLabels.add(uniqueKey);

      // 6. Check occupancy from classes, attributes, or disabled state
      const classStr = raw.classList.join(' ').toLowerCase();
      const isOccupiedClass = classStr.includes('booked') || 
                              classStr.includes('occupied') || 
                              classStr.includes('unavailable') || 
                              classStr.includes('disabled') ||
                              classStr.includes('seat-in-progress');
      const isAvailableClass = (classStr.includes('available') || classStr.includes('seat-available')) && !isOccupiedClass;
      
      const isEnabled = !raw.disabled && !raw.ariaDisabled && !isOccupiedClass;
      const isAvailable = (isAvailableClass || isEnabled) && !isOccupiedClass;

      // 7. Parse seat type (WINDOW, AISLE, etc.) only if reliably indicated
      let type: SeatType = 'UNKNOWN';
      const typeAttr = (raw.seatTypeAttr || raw.ariaLabel || '').toLowerCase();
      if (typeAttr.includes('window')) {
        type = 'WINDOW';
      } else if (typeAttr.includes('aisle')) {
        type = 'AISLE';
      } else if (typeAttr.includes('middle')) {
        type = 'MIDDLE';
      } else if (typeAttr.includes('berth')) {
        type = 'BERTH';
      }

      // 8. Try to extract row / column if structured
      let row: string | undefined;
      let col: string | undefined;
      const match = cleanLabel.match(/^([A-Za-z]+)(\d+)$/);
      if (match) {
        row = match[1].toUpperCase();
        col = match[2];
      }

      validSeats.push({
        coach: cleanCoach || 'DEFAULT',
        label: cleanLabel,
        row,
        column: col,
        type,
        available: isAvailable,
        enabled: isEnabled,
        selected: raw.selected || classStr.includes('selected'),
        locatorKey: raw.locatorKey,
      });
    }

    return validSeats;
  }
}
