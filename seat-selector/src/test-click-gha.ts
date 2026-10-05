import { chromium } from 'playwright';

async function clickGhaSeat() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0]?.pages().find(p => p.url().includes('railway.gov.bd'));
  if (!page) return;

  console.log('Targeting button GHA-30...');
  const seatBtn = page.locator('button.btn-seat').filter({ hasText: /^GHA-30$/ }).first();

  const isVisible = await seatBtn.isVisible();
  console.log(`Seat button GHA-30 visible: ${isVisible}`);

  if (isVisible) {
    console.log('Performing single click on GHA-30 (Attempt 1/2)...');
    await seatBtn.click();
    await page.waitForTimeout(1000);

    const postClick = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button.btn-seat')).find(
        b => b.textContent?.trim() === 'GHA-30'
      );
      const classes = btn ? Array.from(btn.classList) : [];
      const toast = document.querySelector('.toast, .alert, .swal2-container, .toast-message')?.textContent?.trim();

      const continueBtn = Array.from(document.querySelectorAll('button')).find(
        b => b.textContent?.includes('CONTINUE PURCHASE')
      ) as HTMLButtonElement | null;

      return {
        classes,
        isSelected: classes.some(c => c.includes('selected')),
        isBooked: classes.some(c => c.includes('booked')),
        isInProgress: classes.some(c => c.includes('in-progress')),
        toast,
        continueBtnDisabled: continueBtn ? continueBtn.disabled : null,
      };
    });

    console.log('\nPost-click verification:', postClick);

    // If successfully selected (blue), click CONTINUE PURCHASE
    if (postClick.isSelected && !postClick.continueBtnDisabled) {
      console.log('🟦 Seat selected successfully! Clicking CONTINUE PURCHASE to reach passenger / OTP stage...');
      const continueBtn = page.locator('button:has-text("CONTINUE PURCHASE")').first();
      await continueBtn.click();
      await page.waitForTimeout(2500);
      console.log('New URL:', page.url());
    } else {
      console.log('Seat state check:', postClick);
    }
  }

  await browser.close();
}

clickGhaSeat();
