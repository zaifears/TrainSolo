import { chromium, Browser } from 'playwright';
import { Logger } from '../logging/redactor.js';

export class CdpConnector {
  private endpoint: string;
  private logger: Logger;
  private browser: Browser | null = null;

  constructor(endpoint: string, logger: Logger) {
    this.endpoint = endpoint;
    this.logger = logger;
  }

  /**
   * Connects to a running Chromium instance via Chrome DevTools Protocol (CDP).
   * Enforces loopback-only connection for strict local security.
   */
  public async connect(): Promise<Browser> {
    const url = new URL(this.endpoint);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
      throw new Error(`Security Exception: CDP endpoint must be bound to loopback (127.0.0.1 or localhost), got ${url.hostname}`);
    }

    this.logger.info(`Connecting to Chromium over CDP at ${this.endpoint}...`);
    try {
      this.browser = await chromium.connectOverCDP(this.endpoint);
      this.logger.info(`Connected to Chromium successfully. Context count: ${this.browser.contexts().length}`);
      return this.browser;
    } catch (err: any) {
      this.logger.error(`Failed to connect over CDP to ${this.endpoint}: ${err.message}`);
      throw new Error(
        `Could not connect to browser over CDP at ${this.endpoint}.\n` +
        `Ensure you launched your dedicated Chrome profile with:\n` +
        `  chrome.exe --remote-debugging-port=9222 --user-data-dir="<path_to_profile>"`
      );
    }
  }

  public async disconnect(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
