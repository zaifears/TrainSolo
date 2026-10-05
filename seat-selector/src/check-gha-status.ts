import { chromium } from 'playwright';

async function checkGhaAndClick() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0]?.pages().find(p => p.url().includes('railway.gov.bd'));
  if (!page) return;

  const currentStatus = await page.evaluate(() => {
    const seatBtn = Array.from(document.querySelectorAll('button.btn-seat')).find(
      b => b.textContent?.trim() === 'GHA-30'
    ) as HTMLButtonElement | null;

    const actionButtons = Array.from(document.querySelectorAll('button, a.btn, input[type="submit"]')).map(b => ({
      text: b.textContent?.replace(/\s+/g, ' ').trim(),
      className: b.className,
      disabled: (b as HTMLButtonElement).disabled,
      visible: b.getBoundingClientRect().width > 0,
    })).filter(b => b.visible && b.text && b.text.length < 40);

    return {
      seatFound: Boolean(seatBtn),
      seatClasses: seatBtn ? Array.from(seatBtn.classList) : [],
      seatDisabled: seatBtn?.disabled,
      actionButtons,
    };
  });

  console.log('========================================================');
  console.log('CURRENT SEAT GHA-30 STATUS:');
  console.log('Found:', currentStatus.seatFound);
  console.log('Classes:', currentStatus.seatClasses);
  console.log('Disabled:', currentStatus.seatDisabled);
  console.log('\nAction Buttons on Page:');
  console.table(currentStatus.actionButtons);
  console.log('========================================================');

  await browser.close();
}

checkGhaAndClick();
