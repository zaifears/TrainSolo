import fs from 'fs';
import path from 'path';

/**
 * Persistent seat-click ledger.
 *
 * The portal reportedly disables seat selection for 1 hour after 3+ selections
 * within 15 minutes. An in-memory counter resets every time the script is
 * re-run, so the budget has to live on disk and be shared across runs.
 */
const LEDGER_PATH = path.resolve(process.cwd(), '.seat-click-ledger.json');
const WINDOW_MS = 15 * 60 * 1000;

interface LedgerEntry {
  at: number;
  seat: string;
  outcome: 'selected' | 'contested' | 'unknown';
}

function read(): LedgerEntry[] {
  try {
    const raw = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function write(entries: LedgerEntry[]): void {
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(entries, null, 2));
}

export class ClickLedger {
  constructor(private readonly maxClicksPerWindow: number) {}

  /** Clicks recorded inside the trailing 15-minute window. */
  public recent(): LedgerEntry[] {
    const cutoff = Date.now() - WINDOW_MS;
    return read().filter(e => e.at >= cutoff);
  }

  public remaining(): number {
    return Math.max(0, this.maxClicksPerWindow - this.recent().length);
  }

  /** Milliseconds until the oldest click in the window expires. */
  public msUntilNextSlot(): number {
    const recent = this.recent().sort((a, b) => a.at - b.at);
    if (recent.length < this.maxClicksPerWindow) return 0;
    return recent[0].at + WINDOW_MS - Date.now();
  }

  public record(seat: string, outcome: LedgerEntry['outcome']): void {
    const cutoff = Date.now() - WINDOW_MS;
    const kept = read().filter(e => e.at >= cutoff);
    kept.push({ at: Date.now(), seat, outcome });
    write(kept);
  }
}
