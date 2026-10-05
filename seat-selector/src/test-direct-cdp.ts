import { DirectCdpPage } from './browser/directCdp.js';

async function testDirectCdp() {
  console.log('Testing DirectCdpPage...');
  const page = await DirectCdpPage.connect(9222);
  console.log('Connected directly to Railway tab in milliseconds!');

  const info = await page.evaluate(() => {
    const bogieSelect = document.querySelector('#select-bogie') as HTMLSelectElement;
    const bogieText = bogieSelect ? bogieSelect.options[bogieSelect.selectedIndex]?.text : 'NONE';
    const seat30 = Array.from(document.querySelectorAll('button.btn-seat')).find(b => b.textContent?.includes('30'));
    
    return {
      title: document.title,
      bogieText,
      seat30Text: seat30?.textContent?.trim(),
      seat30Classes: seat30?.className,
      seat30Disabled: (seat30 as HTMLButtonElement)?.disabled,
    };
  });

  console.log('Result from live tab:\n', info);
  await page.close();
}

testDirectCdp().catch(console.error);
