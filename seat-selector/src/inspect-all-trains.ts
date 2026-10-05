import { chromium } from 'playwright';

async function inspectAllTrains() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0].pages().find(p => p.url().includes('railway.gov.bd'));
  if (!page) {
    console.log('No page found');
    await browser.close();
    return;
  }

  const trains = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.single-trip-wrapper, .trip-wrapper, .train-route-details'));
    return cards.map(c => {
      const name = c.querySelector('.train-name, .trip-name, h2, h3, h4')?.textContent?.trim();
      const classes = Array.from(c.querySelectorAll('.seat-class-item, .seat-type, .all-seats li, .trip-type')).map(cl => ({
        classType: cl.querySelector('.seat-class, .seat-name, .type-name')?.textContent?.trim() || cl.textContent?.trim(),
        availableSeats: cl.querySelector('.seat-available, .available, .seat-count')?.textContent?.trim()
      }));
      return { name, classes };
    });
  });

  console.log('Trains found on current search page:');
  console.log(JSON.stringify(trains, null, 2));

  // Also check if there's raw trip data in window or angular
  const rawTrips = await page.evaluate(() => {
    const tripCards = Array.from(document.querySelectorAll('.single-trip-wrapper'));
    return tripCards.map(tc => {
      const trainTitle = tc.querySelector('h2, h3, h4, .train-name')?.textContent?.replace(/\s+/g, ' ').trim();
      const text = (tc as HTMLElement).innerText.replace(/\s+/g, ' ');
      return { trainTitle, snippet: text.slice(0, 300) };
    });
  });
  console.log('\nTrain cards summary:');
  console.log(JSON.stringify(rawTrips, null, 2));

  await browser.close();
}

inspectAllTrains().catch(console.error);
