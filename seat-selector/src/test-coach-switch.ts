import { DirectCdpPage } from './browser/directCdp.js';

async function testCoachSwitch() {
  const page = await DirectCdpPage.connect(9222);
  console.log('Connected!');

  // 1. Inspect all coaches in the dropdown
  const coachData = await page.evaluate(() => {
    const select = document.querySelector('#select-bogie') as HTMLSelectElement;
    if (!select) return { error: 'select-bogie not found' };

    const options = Array.from(select.options).map(o => ({
      text: o.text.trim(),
      value: o.value,
      selected: o.selected
    }));

    return {
      currentValue: select.value,
      options
    };
  });

  console.log('Coach dropdown data:', coachData);

  // 2. Switch back to KHA (value 0) to demonstrate switching from non-vacant to vacant
  console.log('\n--- Switching to KHA (0 vacant seats) ---');
  await page.evaluate(() => {
    const select = document.querySelector('#select-bogie') as HTMLSelectElement;
    select.value = '0';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Wait 1.5s for Angular to render KHA seats
  await new Promise(r => setTimeout(r, 1500));

  const khaSeats = await page.evaluate(() => {
    const firstFew = Array.from(document.querySelectorAll('button.btn-seat'))
      .map(b => b.textContent?.trim())
      .filter(Boolean)
      .slice(0, 5);
    return firstFew;
  });
  console.log('Seats showing after switching to KHA:', khaSeats);

  // 3. Now automatically switch to GHA (has vacant seat)
  console.log('\n--- Automatically switching to GHA (1 vacant seat) ---');
  await page.evaluate(() => {
    const select = document.querySelector('#select-bogie') as HTMLSelectElement;
    // Find option with vacant seats > 0
    let targetOption = Array.from(select.options).find(o => {
      const match = o.text.match(/- (\d+) Seat/i) || o.text.match(/\((\d+)\)/);
      return match && parseInt(match[1], 10) > 0;
    });

    if (targetOption) {
      select.value = targetOption.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.dispatchEvent(new Event('input', { bubbles: true }));
      return { switchedTo: targetOption.text, value: targetOption.value };
    }
    return { error: 'No vacant coach found' };
  });

  // Wait 1.5s for Angular to render GHA seats
  await new Promise(r => setTimeout(r, 1500));

  const ghaSeats = await page.evaluate(() => {
    const firstFew = Array.from(document.querySelectorAll('button.btn-seat'))
      .map(b => b.textContent?.trim())
      .filter(Boolean)
      .slice(0, 5);
    return firstFew;
  });
  console.log('Seats showing after switching to GHA:', ghaSeats);

  await page.close();
}

testCoachSwitch().catch(console.error);
