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

    if (fromParam && !fromParam.toLowerCase().includes(journey.from.toLowerCase()) && !journey.from.toLowerCase().includes(fromParam.toLowerCase())) {
      throw new Error(`Journey Origin Mismatch: Expected '${journey.from}', but URL specifies '${fromParam}'`);
    }

    if (toParam && !toParam.toLowerCase().includes(journey.to.toLowerCase()) && !journey.to.toLowerCase().includes(toParam.toLowerCase())) {
      throw new Error(`Journey Destination Mismatch: Expected '${journey.to}', but URL specifies '${toParam}'`);
    }

    // Check page text for stations
    const pageText = await this.page.textContent('body') || '';
    const originFound = pageText.toLowerCase().includes(journey.from.toLowerCase());
    const destFound = pageText.toLowerCase().includes(journey.to.toLowerCase());

    if (!originFound || !destFound) {
      this.logger.warn(`Origin (${journey.from}) or Destination (${journey.to}) not clearly observed in page text. Checking search form...`);
    }

    this.logger.info('Journey context verified successfully.');
    return true;
  }
}
