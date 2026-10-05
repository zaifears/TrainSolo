import { chromium } from 'playwright';

async function inspectParjotak() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0]?.pages().find(p => p.url().includes('railway.gov.bd'));
  if (!page) return;

  const cardDetails = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.single-trip-wrapper, .trip-wrapper, .train-name'));
    const parjotakEl = cards.find(c => (c.textContent || '').includes('PARJOTAK') || (c.textContent || '').includes('816'));
    const parent = parjotakEl ? (parjotakEl.closest('.single-trip-wrapper, .trip-wrapper') || parjotakEl) : null;

    if (!parent) return { error: 'Parjotak card not found' };

    // Get all text, buttons, class badges in the card
    const buttons = Array.from(parent.querySelectorAll('button, a, .btn, .seat-class-type')).map(b => ({
      text: b.textContent?.trim(),
      tag: b.tagName,
      className: b.className,
    }));

    const fullText = parent.textContent?.replace(/\s+/g, ' ');

    return {
      buttons,
      fullText,
    };
  });

  console.log('='.repeat(70));
  console.log('PARJOTAK EXPRESS CARD DETAILS:');
  console.log('Buttons / Seat Classes:');
  console.table(cardDetails.buttons);
  console.log('\nFull Text Snippet:');
  console.log(cardDetails.fullText?.slice(0, 500));
  console.log('='.repeat(70));
  await browser.close();
}

inspectParjotak();
