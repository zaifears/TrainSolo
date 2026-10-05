import { CdpConnector } from './browser/cdpConnector.js';
import { Logger } from './logging/redactor.js';

async function testCdp() {
  const logger = new Logger({ level: 'debug', redactTokens: true, screenshotsOnFailure: false, retainDays: 3 });
  const connector = new CdpConnector('http://127.0.0.1:9222', logger);
  console.log('Testing connector...');
  try {
    const browser = await connector.connect();
    console.log('Connected! Contexts:', browser.contexts().length);
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        console.log('Page:', p.url());
      }
    }
  } catch (err: any) {
    console.error('Connector failed:', err.message);
  }
}

testCdp();
