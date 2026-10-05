export type SeatType = "WINDOW" | "AISLE" | "MIDDLE" | "BERTH" | "UNKNOWN";

export interface Seat {
  coach: string;
  label: string;
  row?: string;
  column?: string;
  type?: SeatType;
  available: boolean;
  enabled: boolean;
  selected: boolean;
  locatorKey: string;
}

export interface SeatCombination {
  coach: string;
  seats: Seat[];
  score: number;
  strategy: 'EXACT' | 'ADJACENT_PREFERRED' | 'ADJACENT_ANY' | 'SAME_ROW_PREFERRED' | 'SAME_ROW_ANY' | 'SAME_COACH' | 'SEPARATE';
}
