import { AppConfig } from '../config/schema.js';
import { Seat, SeatCombination } from './seat.types.js';

export class SeatRanker {
  /**
   * Evaluates available, enabled seats and selects the optimal combination according to
   * preferences and strict safety constraints.
   */
  public static rankAndSelect(seats: Seat[], config: AppConfig): SeatCombination | null {
    const { seatCount } = config.journey;
    const {
      exactSeats,
      preferredCoaches,
      preferWindow,
      requireAdjacent,
      allowSameRowFallback,
      allowSameCoachFallback,
      allowSeparateFallback,
    } = config.preferences;

    // Filter to available, enabled, and unselected seats only
    const availableSeats = seats.filter(s => s.available && s.enabled && !s.selected);

    if (availableSeats.length < seatCount) {
      return null;
    }

    // 1. Exact requested seats
    if (exactSeats.length >= seatCount) {
      const matched = availableSeats.filter(s => 
        exactSeats.some(e => e.toUpperCase() === s.label.toUpperCase() || e.toUpperCase() === `${s.coach}-${s.label}`.toUpperCase())
      );
      if (matched.length >= seatCount) {
        return {
          coach: matched[0].coach,
          seats: matched.slice(0, seatCount),
          score: 1000,
          strategy: 'EXACT',
        };
      }
    }

    // Group seats by coach
    const coachMap = new Map<string, Seat[]>();
    for (const seat of availableSeats) {
      const list = coachMap.get(seat.coach) || [];
      list.push(seat);
      coachMap.set(seat.coach, list);
    }

    // Sort coaches: preferred coaches first
    const coachEntries = Array.from(coachMap.entries()).sort(([coachA], [coachB]) => {
      const aPref = preferredCoaches.some(p => p.toUpperCase() === coachA.toUpperCase());
      const bPref = preferredCoaches.some(p => p.toUpperCase() === coachB.toUpperCase());
      if (aPref && !bPref) return -1;
      if (!aPref && bPref) return 1;
      return coachA.localeCompare(coachB);
    });

    // Helper: Sort seats in a coach by label / numeric index
    const sortSeats = (coachSeats: Seat[]) => {
      return [...coachSeats].sort((a, b) => {
        const numA = parseInt(a.label.replace(/\D/g, ''), 10);
        const numB = parseInt(b.label.replace(/\D/g, ''), 10);
        if (!isNaN(numA) && !isNaN(numB)) {
          return numA - numB;
        }
        return a.label.localeCompare(b.label);
      });
    };

    // Helper: Check if an array of seats is adjacent
    const areAdjacent = (seatGroup: Seat[]): boolean => {
      if (seatGroup.length <= 1) return true;
      const sorted = sortSeats(seatGroup);

      // Check numeric sequence
      const nums = sorted.map(s => parseInt(s.label.replace(/\D/g, ''), 10));
      const allNumbers = nums.every(n => !isNaN(n));
      if (allNumbers) {
        for (let i = 0; i < nums.length - 1; i++) {
          if (nums[i + 1] - nums[i] !== 1) {
            return false;
          }
        }
        return true;
      }

      // Check row + column sequence
      if (sorted.every(s => s.row && s.column)) {
        const firstRow = sorted[0].row;
        if (!sorted.every(s => s.row === firstRow)) return false;
        const cols = sorted.map(s => parseInt(s.column!, 10));
        for (let i = 0; i < cols.length - 1; i++) {
          if (cols[i + 1] - cols[i] !== 1) return false;
        }
        return true;
      }

      return false;
    };

    // Helper: Check if seats share the same row
    const areSameRow = (seatGroup: Seat[]): boolean => {
      if (seatGroup.length <= 1) return true;
      if (seatGroup.every(s => s.row)) {
        return seatGroup.every(s => s.row === seatGroup[0].row);
      }
      // Heuristic for 4-across numbering (e.g. 1-4 is row 1, 5-8 is row 2)
      const nums = seatGroup.map(s => parseInt(s.label.replace(/\D/g, ''), 10));
      if (nums.every(n => !isNaN(n))) {
        const rowId = Math.floor((nums[0] - 1) / 4);
        return nums.every(n => Math.floor((n - 1) / 4) === rowId);
      }
      return false;
    };

    // Window preference weighting
    const scoreWindow = (group: Seat[]): number => {
      if (!preferWindow) return 0;
      return group.filter(s => s.type === 'WINDOW').length * 10;
    };

    // Find sliding window or combination of contiguous/adjacent seats in a coach
    const findAdjacentGroup = (coachSeats: Seat[]): Seat[] | null => {
      const sorted = sortSeats(coachSeats);
      for (let i = 0; i <= sorted.length - seatCount; i++) {
        const windowSlice = sorted.slice(i, i + seatCount);
        if (areAdjacent(windowSlice)) {
          return windowSlice;
        }
      }
      return null;
    };

    // 2. Adjacent in preferred coaches
    for (const [coach, coachSeats] of coachEntries) {
      const isPref = preferredCoaches.some(p => p.toUpperCase() === coach.toUpperCase());
      if (isPref && coachSeats.length >= seatCount) {
        const adj = findAdjacentGroup(coachSeats);
        if (adj) {
          return {
            coach,
            seats: adj,
            score: 900 + scoreWindow(adj),
            strategy: 'ADJACENT_PREFERRED',
          };
        }
      }
    }

    // 3. Adjacent in any coach
    if (requireAdjacent) {
      for (const [coach, coachSeats] of coachEntries) {
        if (coachSeats.length >= seatCount) {
          const adj = findAdjacentGroup(coachSeats);
          if (adj) {
            return {
              coach,
              seats: adj,
              score: 800 + scoreWindow(adj),
              strategy: 'ADJACENT_ANY',
            };
          }
        }
      }
    }

    // 4. Same-row in preferred coaches
    if (allowSameRowFallback) {
      for (const [coach, coachSeats] of coachEntries) {
        const isPref = preferredCoaches.some(p => p.toUpperCase() === coach.toUpperCase());
        if (isPref && coachSeats.length >= seatCount) {
          const sorted = sortSeats(coachSeats);
          for (let i = 0; i <= sorted.length - seatCount; i++) {
            const slice = sorted.slice(i, i + seatCount);
            if (areSameRow(slice)) {
              return {
                coach,
                seats: slice,
                score: 700 + scoreWindow(slice),
                strategy: 'SAME_ROW_PREFERRED',
              };
            }
          }
        }
      }

      // 5. Same-row in any coach
      for (const [coach, coachSeats] of coachEntries) {
        if (coachSeats.length >= seatCount) {
          const sorted = sortSeats(coachSeats);
          for (let i = 0; i <= sorted.length - seatCount; i++) {
            const slice = sorted.slice(i, i + seatCount);
            if (areSameRow(slice)) {
              return {
                coach,
                seats: slice,
                score: 600 + scoreWindow(slice),
                strategy: 'SAME_ROW_ANY',
              };
            }
          }
        }
      }
    }

    // 6. Same-coach seats (not adjacent/same-row)
    if (allowSameCoachFallback) {
      for (const [coach, coachSeats] of coachEntries) {
        if (coachSeats.length >= seatCount) {
          const sorted = sortSeats(coachSeats);
          const slice = sorted.slice(0, seatCount);
          return {
            coach,
            seats: slice,
            score: 500 + scoreWindow(slice),
            strategy: 'SAME_COACH',
          };
        }
      }
    }

    // 7. Separate seats across coaches (only if explicitly enabled)
    if (allowSeparateFallback) {
      const sortedAll = sortSeats(availableSeats);
      return {
        coach: 'MULTIPLE',
        seats: sortedAll.slice(0, seatCount),
        score: 100,
        strategy: 'SEPARATE',
      };
    }

    return null;
  }
}
