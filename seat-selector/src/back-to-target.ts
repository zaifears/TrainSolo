import { DirectCdpPage } from './browser/directCdp.js';

async function backToCoxsBazar() {
  const page = await DirectCdpPage.connect(9222);
  const targetUrl = 'https://eticket.railway.gov.bd/booking/train/search?fromcity=Dhaka&tocity=Cox%27s%20Bazar&doj=11-Oct-2026&class=AC_S';
  console.log('Navigating to target journey...');
  await page.evaluate((url) => { window.location.href = url; }, targetUrl);
  
  // Wait for results
  await page.waitForFunction(() => {
    return document.querySelectorAll('.single-trip-wrapper').length > 0;
  }, undefined, 15000);

  console.log('Loaded search results!');
  await page.close();
}

backToCoxsBazar().catch(console.error);
