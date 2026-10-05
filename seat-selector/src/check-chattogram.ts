import { DirectCdpPage } from './browser/directCdp.js';

async function checkRoute(from: string, to: string, date: string) {
  const page = await DirectCdpPage.connect(9222);
  console.log(`Checking route ${from} ➔ ${to} on ${date}...`);

  const searchUrl = `https://eticket.railway.gov.bd/booking/train/search?fromcity=${encodeURIComponent(from)}&tocity=${encodeURIComponent(to)}&doj=${encodeURIComponent(date)}&class=ALL`;
  await page.evaluate((url) => { window.location.href = url; }, searchUrl);

  // Wait for train cards to render
  await page.waitForFunction(() => {
    return document.querySelectorAll('.single-trip-wrapper').length > 0;
  }, undefined, 15000);

  const trainSummary = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.single-trip-wrapper'));
    return cards.map(c => {
      const name = c.querySelector('h2, h3, h4, .train-name')?.textContent?.replace(/\s+/g, ' ').trim();
      const text = (c as HTMLElement).innerText.replace(/\s+/g, ' ');
      // extract available tickets
      const availableMatches = Array.from(text.matchAll(/([A-Z_]+)\s*৳\d+[^\d]+Available Tickets[^\d]+(\d+)/g)).map((m: RegExpMatchArray) => ({
        class: m[1],
        available: parseInt(m[2], 10)
      }));
      return { name, availableMatches };
    });
  });

  console.log('Search Results:');
  console.log(JSON.stringify(trainSummary, null, 2));

  await page.close();
}

checkRoute('Dhaka', 'Chattogram', '11-Oct-2026').catch(console.error);
