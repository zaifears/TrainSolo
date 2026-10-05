import { Browser, Page } from 'playwright';
import { Logger } from '../logging/redactor.js';

export class PageResolver {
  private browser: Browser;
  private railwayHost: string;
  private logger: Logger;

  constructor(browser: Browser, railwayHost: string, logger: Logger) {
    this.browser = browser;
    this.railwayHost = railwayHost;
    this.logger = logger;
  }

  /**
   * Finds an existing tab on eticket.railway.gov.bd or opens one if not found.
   */
  public async resolveRailwayPage(): Promise<Page> {
    const contexts = this.browser.contexts();
    if (contexts.length === 0) {
      throw new Error('No browser contexts found in attached browser session.');
    }

    const context = contexts[0];
    const pages = context.pages();

    // Look for existing railway tab
    for (const page of pages) {
      try {
        const urlStr = page.url();
        if (urlStr && urlStr !== 'about:blank') {
          const u = new URL(urlStr);
          if (u.hostname === this.railwayHost || u.hostname.endsWith(this.railwayHost)) {
            this.logger.info(`Found existing Bangladesh Railway tab: ${urlStr}`);
            await page.bringToFront();
            return page;
          }
        }
      } catch {
        // Continue searching
      }
    }

    // If none found, create a new tab in the first context
    this.logger.info(`No active Railway tab found. Creating new tab for https://${this.railwayHost}...`);
    const newPage = await context.newPage();
    await newPage.goto(`https://${this.railwayHost}`, { waitUntil: 'domcontentloaded' });
    return newPage;
  }
}
