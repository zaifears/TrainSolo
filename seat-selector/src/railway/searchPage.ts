import { Page } from 'playwright';
import { JourneyConfig } from '../config/schema.js';
import { Logger } from '../logging/redactor.js';

export class SearchPage {
  private page: Page;
  private logger: Logger;

  constructor(page: Page, logger: Logger) {
    this.page = page;
    this.logger = logger;
  }

  /**
   * Navigates directly to the official search URL for the specified journey.
   */
  public async navigateToJourney(journey: JourneyConfig, preferredClass?: string): Promise<void> {
    const cls = preferredClass || journey.classes[0] || 'S_CHAIR';
    const targetUrl = `https://eticket.railway.gov.bd/booking/train/search?fromcity=${encodeURIComponent(journey.from)}&tocity=${encodeURIComponent(journey.to)}&doj=${encodeURIComponent(journey.date)}&class=${encodeURIComponent(cls)}`;
    
    this.logger.info(`Opening journey booking search URL: ${targetUrl}`);
    await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  }

  /**
   * Waits for train cards / search results to appear.
   */
  public async waitForResults(): Promise<void> {
    this.logger.info('Waiting for train availability results to render...');
    // Look for train list container or train items
    await this.page.waitForSelector('.single-trip-wrapper, .train-name, text=Available Tickets, .trip-wrapper', {
      timeout: 15000,
    }).catch(() => {
      this.logger.warn('Wait for train cards timed out or results rendered with alternative markup.');
    });
  }
}
