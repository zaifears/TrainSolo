import { chromium } from 'playwright';

async function fullParjotakTest() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0]?.pages().find(p => p.url().includes('railway.gov.bd'));
  if (!page) {
    console.log('No railway page found');
    return;
  }

  console.log('1. Navigating fresh to Dhaka -> Coxs Bazar (11-Oct-2026)...');
  await page.goto(
    'https://eticket.railway.gov.bd/booking/train/search?fromcity=Dhaka&tocity=Cox%27s%20Bazar&doj=11-Oct-2026&class=AC_S',
    { waitUntil: 'domcontentloaded' }
  );

  console.log('2. Waiting for search results...');
  await page.waitForSelector('.single-trip-wrapper, .trip-wrapper', { timeout: 15000 });

  // 3. Locate PARJOTAK card
  const parjotakCard = page.locator('.single-trip-wrapper, .trip-wrapper').filter({ hasText: /PARJOTAK|816/i }).first();
  await parjotakCard.waitFor({ state: 'visible', timeout: 5000 });
  console.log('3. Located PARJOTAK EXPRESS (816) card.');

  // 4. Click BOOK NOW button next to AC_S
  const bookNowBtn = parjotakCard.locator('button.book-now-btn, button:has-text("BOOK NOW")').first();
  await bookNowBtn.waitFor({ state: 'visible', timeout: 5000 });
  console.log('4. Clicking BOOK NOW for AC_S...');
  await bookNowBtn.click();

  // 5. Wait for coach select dropdown
  console.log('5. Waiting for coach dropdown to appear...');
  const coachDropdown = page.locator('select.form-control, select:not(#lang-switch-dropdown)').first();
  await coachDropdown.waitFor({ state: 'visible', timeout: 10000 });

  // Get available options in coach dropdown
  const options = await coachDropdown.evaluate((el: HTMLSelectElement) => {
    return Array.from(el.options).map(o => ({ value: o.value, text: o.text.trim() }));
  });
  console.log('Available Coach Options in Dropdown:', options);

  // 6. Select the coach with vacant seats (CHHA)
  const validCoach = options.find(o => o.text.includes('(1)') || !o.text.includes('(0)'));
  if (validCoach) {
    console.log(`6. Selecting Coach: "${validCoach.text}"...`);
    await coachDropdown.selectOption(validCoach.value);
  }

  // 7. Wait for seat map / layout loader
  console.log('7. Waiting for seat layout to render...');
  await page.waitForTimeout(2500);

  // 8. Inspect the rendered seats!
  const seatLayout = await page.evaluate(() => {
    const seatNodes = Array.from(
      document.querySelectorAll('.seat, .single-seat, [data-seat], svg rect, svg g, .seat-item, button[class*="seat"]')
    ).map((el, idx) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        idx: idx + 1,
        tag: el.tagName.toLowerCase(),
        classes: Array.from(el.classList),
        id: el.id,
        dataSeat: el.getAttribute('data-seat'),
        text: el.textContent?.trim(),
        visible: rect.width > 0 && rect.height > 0 && style.display !== 'none',
        bgColor: style.backgroundColor,
      };
    }).filter(s => s.dataSeat || (s.text && s.text.length <= 5));

    // Summary panel
    const summary = document.querySelector('.seat-details, .trip-fare-details, .booking-summary')?.textContent?.replace(/\s+/g, ' ');

    return {
      totalSeatsParsed: seatNodes.length,
      seats: seatNodes,
      summary,
    };
  });

  console.log('\n========================================================');
  console.log('🎉 SEAT LAYOUT PARSED SUCCESSFULLY!');
  console.log('========================================================');
  console.log(`Total seats rendered in Coach: ${seatLayout.totalSeatsParsed}`);
  if (seatLayout.seats.length > 0) {
    console.log('Seats Snapshot:');
    console.table(seatLayout.seats.slice(0, 15));
  }
  if (seatLayout.summary) {
    console.log('Fare Summary:', seatLayout.summary);
  }
  console.log('========================================================\n');

  await browser.close();
}

fullParjotakTest().catch(err => {
  console.error('Test error:', err.message);
});
