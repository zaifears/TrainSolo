import { chromium } from 'playwright';
import path from 'path';

async function takeScreenshot() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0].pages().find(p => p.url().includes('railway.gov.bd'));
  if (!page) {
    console.log('No page found');
    await browser.close();
    return;
  }

  const screenshotPath = 'A:/TrainSolo/seat-selector/live-brave-screen.png';
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log('Screenshot saved to:', screenshotPath);
  await browser.close();
}

takeScreenshot().catch(console.error);
