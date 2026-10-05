import { DirectCdpPage } from './browser/directCdp.js';

async function checkGhaSeat() {
  const page = await DirectCdpPage.connect(9222);
  const status = await page.evaluate(() => {
    const seat30 = Array.from(document.querySelectorAll('button.btn-seat')).find(b => b.textContent?.includes('30'));
    return {
      text: seat30?.textContent?.trim(),
      className: seat30?.className,
      disabled: (seat30 as HTMLButtonElement)?.disabled,
      title: seat30?.getAttribute('title'),
      allNonBooked: Array.from(document.querySelectorAll('button.btn-seat'))
        .filter(b => b.textContent?.trim() && !b.className.includes('seat-booked'))
        .map(b => ({
          text: b.textContent?.trim(),
          className: b.className,
          disabled: (b as HTMLButtonElement).disabled
        }))
    };
  });

  console.log('Live Seat Status:\n', JSON.stringify(status, null, 2));
  await page.close();
}

checkGhaSeat().catch(console.error);
