import { Page } from 'playwright';
import { JourneyConfig } from '../config/schema.js';
import { Logger } from '../logging/redactor.js';

const MONTH_MAP: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

/**
 * Normalizes dates from various formats (YYYY-MM-DD, DD-MMM-YYYY, DD-MM-YYYY, DD/MM/YYYY)
 * into canonical ISO YYYY-MM-DD for reliable comparison.
 */
export function toCanonicalDate(dateStr: string): string | null {
  if (!dateStr) return null;
  const s = dateStr.trim().toLowerCase();

  // YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD-MMM-YYYY (e.g., 11-Oct-2026, 11-OCT-2026, 11 Oct 2026)
  const dmmmyMatch = s.match(/^(\d{1,2})[-/.\s]+([a-z]{3,})[-/.\s]+(\d{4})$/);
  if (dmmmyMatch) {
    const [, d, monStr, y] = dmmmyMatch;
    const m = MONTH_MAP[monStr.slice(0, 3)];
    if (m) {
      return `${y}-${m}-${d.padStart(2, '0')}`;
    }
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return null;
}

export function normalizeStation(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export class JourneyVerifier {
  private page: Page;
  private logger: Logger;

  constructor(page: Page, logger: Logger) {
    this.page = page;
    this.logger = logger;
  }

  /**
   * Verifies that the current browser page context matches configured journey parameters.
   */
  public async verifyJourneyContext(journey: JourneyConfig): Promise<boolean> {
    this.logger.info(`Verifying journey context: ${journey.from} → ${journey.to} on ${journey.date}...`);

    const currentUrl = this.page.url();
    const url = new URL(currentUrl);

    // 1. Verify URL parameters if present
    const fromParam = url.searchParams.get('fromcity') || '';
    const toParam = url.searchParams.get('tocity') || '';
    const dojParam = url.searchParams.get('doj') || '';

    if (fromParam && toParam) {
      const normFromParam = normalizeStation(fromParam);
      const normToParam = normalizeStation(toParam);
      const normJourneyFrom = normalizeStation(journey.from);
      const normJourneyTo = normalizeStation(journey.to);

      // Check for reversed route
      if (normFromParam === normJourneyTo && normToParam === normJourneyFrom) {
        throw new Error(
          `Journey Route Reversed: URL specifies '${fromParam} → ${toParam}', but configured route is '${journey.from} → ${journey.to}'.`
        );
      }

      // Check origin
      if (!normFromParam.includes(normJourneyFrom) && !normJourneyFrom.includes(normFromParam)) {
        throw new Error(
          `Journey Origin Mismatch: Expected '${journey.from}', but URL specifies '${fromParam}'.`
        );
      }

      // Check destination
      if (!normToParam.includes(normJourneyTo) && !normJourneyTo.includes(normToParam)) {
        throw new Error(
          `Journey Destination Mismatch: Expected '${journey.to}', but URL specifies '${toParam}'.`
        );
      }
    }

    // 2. Canonical date verification
    if (dojParam) {
      const canonicalUrlDoj = toCanonicalDate(dojParam);
      const canonicalJourneyDate = toCanonicalDate(journey.date);

      if (canonicalUrlDoj && canonicalJourneyDate) {
        if (canonicalUrlDoj !== canonicalJourneyDate) {
          throw new Error(
            `Journey Date Mismatch: Expected '${journey.date}' (${canonicalJourneyDate}), but URL specifies '${dojParam}' (${canonicalUrlDoj}).`
          );
        }
      } else {
        const cleanUrlDoj = dojParam.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanJourneyDate = journey.date.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!cleanUrlDoj.includes(cleanJourneyDate) && !cleanJourneyDate.includes(cleanUrlDoj)) {
          throw new Error(`Journey Date Mismatch: Expected '${journey.date}', but URL specifies '${dojParam}'`);
        }
      }
    }

    // 3. Positive page inspection with ordered directional checking
    const directionalCheck = await this.page.evaluate(({ from, to }) => {
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normF = norm(from);
      const normT = norm(to);

      // Check form inputs specifically
      const fromInput = (document.querySelector('input[name*="from"], input[id*="from"], #fromcity') as HTMLInputElement)?.value || '';
      const toInput = (document.querySelector('input[name*="to"], input[id*="to"], #tocity') as HTMLInputElement)?.value || '';
      if (fromInput && toInput) {
        const nf = norm(fromInput);
        const nt = norm(toInput);
        if (nf === normT && nt === normF) {
          return { verified: false, reversed: true };
        }
        if (nf.includes(normF) && nt.includes(normT)) {
          return { verified: true, reversed: false };
        }
      }

      // Check page text and ordered route headings
      const routeHeadings = Array.from(document.querySelectorAll('h1, h2, h3, .route-title, .journey-title, .search-summary'))
        .map((h) => (h.textContent || '').toLowerCase());
      for (const h of routeHeadings) {
        const idxF = h.indexOf(from.toLowerCase());
        const idxT = h.indexOf(to.toLowerCase());
        if (idxF !== -1 && idxT !== -1) {
          if (idxT < idxF) {
            return { verified: false, reversed: true };
          }
          if (idxF < idxT) {
            return { verified: true, reversed: false };
          }
        }
      }

      const bodyText = (document.body?.textContent || '').toLowerCase();
      const originFound = bodyText.includes(from.toLowerCase());
      const destFound = bodyText.includes(to.toLowerCase());
      return { verified: originFound && destFound, reversed: false };
    }, { from: journey.from, to: journey.to });

    if (directionalCheck.reversed) {
      throw new Error(
        `Journey Verification Failed: Route on page is reversed! Expected '${journey.from} → ${journey.to}'.`
      );
    }

    if (!directionalCheck.verified) {
      throw new Error(
        `Journey Verification Failed: Could not positively verify ordered stations '${journey.from}' and '${journey.to}' on the page.`
      );
    }

    this.logger.info('Journey context verified successfully.');
    return true;
  }
}
