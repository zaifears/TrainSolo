import { chromium } from 'playwright';

async function inspectBogie() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0].pages().find(p => p.url().includes('railway.gov.bd'));
  if (!page) {
    console.log('No page found');
    await browser.close();
    return;
  }

  const bogieHtml = await page.evaluate(() => {
    const el = document.querySelector('.bogie-selection');
    return el ? el.outerHTML : 'NOT FOUND';
  });

  console.log('Bogie Selection HTML:');
  console.log(bogieHtml);
  await browser.close();
}

inspectBogie().catch(console.error);
