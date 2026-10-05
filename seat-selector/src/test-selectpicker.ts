import { chromium } from 'playwright';

async function testSelectBogie() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0]?.pages().find(p => p.url().includes('railway.gov.bd'));
  if (!page) return;

  const result = await page.evaluate(async () => {
    const select = document.getElementById('select-bogie') as HTMLSelectElement;
    if (!select) return { error: 'select-bogie not found' };

    // Find the option for GHA
    let ghaOption = Array.from(select.options).find(o => o.text.includes('GHA'));
    if (!ghaOption) return { error: 'GHA option not found in select-bogie' };

    // Set value
    select.value = ghaOption.value;
    select.selectedIndex = ghaOption.index;

    // Dispatch both 'change' and 'input' events
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.dispatchEvent(new Event('input', { bubbles: true }));

    // Check if jQuery / selectpicker is active on it
    const win = window as any;
    if (win.$ && win.$('#select-bogie').selectpicker) {
      win.$('#select-bogie').selectpicker('refresh');
      win.$('#select-bogie').selectpicker('val', ghaOption.value);
      win.$('#select-bogie').trigger('change');
    }

    // Check if bootstrap-select button exists nearby
    const parent = select.closest('.bogie-selection, .bootstrap-select') || select.parentElement;
    const bsButton = parent?.querySelector('button.dropdown-toggle, .btn.dropdown-toggle');
    if (bsButton) {
      (bsButton as HTMLElement).click();
      // Look for dropdown menu items
      const menuItems = Array.from(document.querySelectorAll('.dropdown-menu a, .dropdown-menu li, .dropdown-item'));
      const ghaItem = menuItems.find(m => m.textContent?.includes('GHA'));
      if (ghaItem) {
        (ghaItem as HTMLElement).click();
      }
    }

    return {
      success: true,
      currentValue: select.value,
      currentText: select.options[select.selectedIndex]?.text,
    };
  });

  console.log('Select Bogie Result:', result);

  // Wait 3s to observe visual change on user screen
  await page.waitForTimeout(3000);

  const afterState = await page.evaluate(() => {
    const select = document.getElementById('select-bogie') as HTMLSelectElement;
    const seatButtons = Array.from(document.querySelectorAll('button.btn-seat')).map(b => ({
      text: b.textContent?.trim(),
      className: b.className,
    }));

    return {
      selectText: select ? select.options[select.selectedIndex]?.text : null,
      seatsCount: seatButtons.length,
      availableSeats: seatButtons.filter(s => s.className.includes('available')),
      sampleSeats: seatButtons.slice(0, 5),
    };
  });

  console.log('\nState After Selection:');
  console.log('Selected in dropdown:', afterState.selectText);
  console.log('Seats loaded count:', afterState.seatsCount);
  console.log('Available seats:', afterState.availableSeats);

  await browser.close();
}

testSelectBogie();
