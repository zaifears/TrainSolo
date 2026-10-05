import { chromium } from 'playwright';

async function clickActualBookNow() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0]?.pages().find(p => p.url().includes('railway.gov.bd'));
  if (!page) return;

  console.log('Targeting exact BOOK NOW button next to AC_S on PARJOTAK EXPRESS...');

  const bookNowBtn = page.locator('.single-trip-wrapper, .trip-wrapper')
    .filter({ hasText: /PARJOTAK|816/i })
    .locator('button.book-now-btn, button:has-text("BOOK NOW")')
    .first();

  const isVisible = await bookNowBtn.isVisible().catch(() => false);
  console.log(`BOOK NOW button visible: ${isVisible}`);

  if (isVisible) {
    console.log('Clicking BOOK NOW button...');
    await bookNowBtn.click();
    console.log('Waiting 3s for seat layout / coach to load...');
    await page.waitForTimeout(3000);

    // Inspect live DOM after click
    const after = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select')).map(s => ({
        id: s.id,
        className: s.className,
        options: Array.from(s.options).map(o => o.text.trim())
      }));

      const seats = Array.from(document.querySelectorAll('.seat, .single-seat, [data-seat], svg rect, svg g, .seat-item')).map(s => ({
        text: s.textContent?.trim(),
        id: s.id,
        dataSeat: s.getAttribute('data-seat'),
        classes: Array.from(s.classList),
      })).filter(s => s.text || s.dataSeat);

      const allText = document.body.innerText;
      const coachMentions = allText.match(/[A-Z_a-z]+\s*\(\d+\)/g) || [];

      return {
        selects,
        seatCount: seats.length,
        sampleSeats: seats.slice(0, 10),
        coachMentions: Array.from(new Set(coachMentions)),
        textSnippet: allText.slice(allText.indexOf('PARJOTAK'), allText.indexOf('PARJOTAK') + 1200).replace(/\s+/g, ' ')
      };
    });

    console.log('\nResults After BOOK NOW Click:');
    console.log('Dropdowns:', after.selects);
    console.log('Coach mentions:', after.coachMentions);
    console.log('Seats found:', after.seatCount);
    if (after.sampleSeats.length > 0) {
      console.log('Sample seats:', after.sampleSeats);
    }
    console.log('\nText Snippet:', after.textSnippet);
  }

  await browser.close();
}

clickActualBookNow();
