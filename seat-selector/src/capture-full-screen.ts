import { chromium } from 'playwright';

async function takeFullScreenshot() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0].pages().find(p => p.url().includes('railway.gov.bd'));
  if (!page) {
    console.log('No page found');
    await browser.close();
    return;
  }

  const screenshotPath = 'A:/TrainSolo/seat-selector/live-brave-full.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Full screenshot saved to:', screenshotPath);
  await browser.close();
}

takeFullScreenshot().catch(console.error);
