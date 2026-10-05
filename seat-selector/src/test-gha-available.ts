import { chromium } from 'playwright';

async function checkGhaVacantSeat() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0]?.pages().find(p => p.url().includes('railway.gov.bd'));
  if (!page) return;

  console.log('Selecting Coach GHA (which has 1 seat)...');

  // Select GHA from coach dropdown
  const coachSelect = page.locator('select.form-control, select:not(#lang-switch-dropdown)').first();
  await coachSelect.selectOption({ label: 'GHA - 1 Seat(s)' });
  
  console.log('Selected GHA - 1 Seat(s)! Waiting 2.5s for seat layout to render...');
  await page.waitForTimeout(2500);

  // Inspect seat buttons in GHA
  const ghaSeats = await page.evaluate(() => {
    const seatButtons = Array.from(document.querySelectorAll('button.btn-seat')).map(b => {
      const btn = b as HTMLButtonElement;
      const text = btn.innerText.trim();
      const classes = Array.from(btn.classList);
      const isBooked = classes.includes('seat-booked');
      const isAvailable = classes.includes('seat-available') || !isBooked;

      return {
        seatLabel: text,
        isBooked,
        isAvailable,
        classes,
      };
    });

    const vacant = seatButtons.filter(s => s.isAvailable);
    return {
      totalSeats: seatButtons.length,
      vacantSeats: vacant,
      sampleSeats: seatButtons.slice(0, 10),
    };
  });

  console.log('\n========================================================');
  console.log(`COACH GHA SEAT SCAN RESULTS:`);
  console.log(`Total seats in GHA: ${ghaSeats.totalSeats}`);
  console.log(`Vacant Seats found (${ghaSeats.vacantSeats.length}):`);
  console.table(ghaSeats.vacantSeats);
  console.log('========================================================\n');

  await browser.close();
}

checkGhaVacantSeat();
