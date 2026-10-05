import { chromium } from 'playwright';

async function selectCoachAndInspectSeats() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0]?.pages().find(p => p.url().includes('railway.gov.bd'));
  if (!page) return;

  console.log('Selecting CHHA (1) in the coach dropdown...');

  // Find the coach select dropdown (excluding lang-switch-dropdown)
  const coachSelect = page.locator('select.form-control, select:not(#lang-switch-dropdown)').first();
  await coachSelect.waitFor({ state: 'visible', timeout: 5000 });

  // Select CHHA (1)
  await coachSelect.selectOption({ label: 'CHHA (1)' });
  console.log('Selected CHHA (1)! Waiting 3s for seats to render...');
  await page.waitForTimeout(3000);

  // Inspect seat elements
  const seatInfo = await page.evaluate(() => {
    // Find all seat nodes
    const seatNodes = Array.from(document.querySelectorAll('.seat, .single-seat, [data-seat], svg rect, svg g, .seat-item, .seat-layout-plan div, .seat-plan div')).map(el => {
      const rect = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        classes: Array.from(el.classList),
        id: el.id,
        text: el.textContent?.trim(),
        dataSeat: el.getAttribute('data-seat'),
        dataCoach: el.getAttribute('data-coach'),
        width: rect.width,
        height: rect.height,
        visible: rect.width > 0 && rect.height > 0
      };
    }).filter(s => s.text || s.dataSeat || s.id);

    // Look for seat layout container HTML
    const layout = document.querySelector('.seat-plan, .seat-layout, .seat-layout-plan, .seat-grid');
    const layoutHTML = layout ? layout.outerHTML.slice(0, 1000) : null;

    return {
      totalSeatNodes: seatNodes.length,
      sampleSeats: seatNodes.slice(0, 20),
      layoutSnippet: layoutHTML
    };
  });

  console.log('\nSeat Inspection Results:');
  console.log('Total seat elements found:', seatInfo.totalSeatNodes);
  console.log('Sample seats:');
  console.table(seatInfo.sampleSeats.slice(0, 10));
  if (seatInfo.layoutSnippet) {
    console.log('\nLayout snippet:', seatInfo.layoutSnippet);
  }

  await browser.close();
}

selectCoachAndInspectSeats();
