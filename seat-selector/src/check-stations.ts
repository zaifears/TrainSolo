import { DirectCdpPage } from './browser/directCdp.js';

async function checkStations() {
  const page = await DirectCdpPage.connect(9222);
  const stations = await page.evaluate(() => {
    const fromInput = document.querySelector('input[name="from_city"], input[placeholder*="From"], #fromcity') as HTMLInputElement;
    return {
      title: document.title,
      inputs: Array.from(document.querySelectorAll('input')).map(i => ({ name: i.name, id: i.id, placeholder: i.placeholder, value: i.value }))
    };
  });
  console.log('Inputs:', stations);
  await page.close();
}

checkStations().catch(console.error);
