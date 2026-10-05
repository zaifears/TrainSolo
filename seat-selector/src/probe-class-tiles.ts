import { DirectCdpPage } from './browser/directCdp.js';

async function main() {
  const page = await DirectCdpPage.connect(9222);
  const info = await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('.single-trip-wrapper'))
      .find(c => /PARJ/i.test(c.textContent || ''));
    if (!card) return { error: 'no card', url: location.href };
    const btns = Array.from(card.querySelectorAll('.book-now-btn'));
    const tiles = btns.map(b => {
      let el: HTMLElement | null = b as HTMLElement;
      const chain: string[] = [];
      for (let i = 0; i < 4 && el; i++) { el = el.parentElement; if (el) chain.push(el.className); }
      return { chain };
    });
    const seatTiles = Array.from(card.querySelectorAll('[class*="seat-class"], [class*="single-seat"]')).slice(0, 6)
      .map(e => ({ cls: (e as HTMLElement).className, text: (e as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 60) }));
    const bogieInCard = !!card.querySelector('#select-bogie');
    const total = (document.body.innerText.match(/Total:\s*৳\s*[\d,]+/) || [''])[0];
    return { url: location.href, bookBtnCount: btns.length, tiles, seatTiles, bogieInCard, total };
  });
  console.log(JSON.stringify(info, null, 2));
  await page.close();
}
main().catch(console.error);
