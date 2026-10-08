import { Page } from 'playwright';
import { JourneyConfig } from '../config/schema.js';
import { Logger } from '../logging/redactor.js';

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

    // If query params are present in URL:
    const fromParam = url.searchParams.get('fromcity') || '';
    const toParam = url.searchParams.get('tocity') || '';
    const dojParam = url.searchParams.get('doj') || '';

    if (dojParam) {
      const cleanUrlDoj = dojParam.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanJourneyDate = journey.date.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!cleanUrlDoj.includes(cleanJourneyDate) && !cleanJourneyDate.includes(cleanUrlDoj)) {
        throw new Error(`Journey Date Mismatch: Expected '${journey.date}', but URL specifies '${dojParam}'`);
      }
    }

    // Check page text and search form for stations
    const pageText = (await this.page.textContent('body')) || '';
    const originFound = pageText.toLowerCase().includes(journey.from.toLowerCase());
    const destFound = pageText.toLowerCase().includes(journey.to.toLowerCase());

    if (!originFound || !destFound) {
      const formHasStations = await this.page.evaluate(({ from, to }) => {
        const inputs = Array.from(document.querySelectorAll('input, select, .station-name, .city-name, span'));
        const text = inputs.map((i) => (i as HTMLInputElement).value || i.textContent || '').join(' ').toLowerCase();
        return text.includes(from.toLowerCase()) && text.includes(to.toLowerCase());
      }, { from: journey.from, to: journey.to });

      if (!formHasStations) {
        throw new Error(
          `Journey Verification Failed: Could not positively verify stations '${journey.from}' and '${journey.to}' on the page.`
        );
      }
    }

    this.logger.info('Journey context verified successfully.');
    return true;
  }
}
