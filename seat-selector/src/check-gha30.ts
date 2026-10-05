import { chromium } from 'playwright';

async function checkGha30() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0].pages().find(p => p.url().includes('railway.gov.bd'));
  if (!page) {
    console.log('No page found');
    await browser.close();
    return;
  }

  const result = await page.evaluate(() => {
    const bogieSelect = document.querySelector('#select-bogie') as HTMLSelectElement;
    const bogieText = bogieSelect ? bogieSelect.options[bogieSelect.selectedIndex]?.text : 'NONE';
    
    const seat30 = Array.from(document.querySelectorAll('button.btn-seat')).find(b => b.textContent?.includes('30'));
    const seatInfo = seat30 ? {
      text: seat30.textContent?.trim(),
      className: seat30.className,
      disabled: (seat30 as HTMLButtonElement).disabled,
      outerHtml: seat30.outerHTML
    } : null;

    // Check all available seats across all buttons
    const allSeats = Array.from(document.querySelectorAll('button.btn-seat')).map(b => ({
      text: b.textContent?.trim(),
      className: b.className,
      disabled: (b as HTMLButtonElement).disabled,
    })).filter(s => s.text && !s.className.includes('seat-booked'));

    return {
      bogieText,
      seat30: seatInfo,
      nonBookedSeats: allSeats
    };
  });

  console.log('Live Status:');
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

checkGha30().catch(console.error);
