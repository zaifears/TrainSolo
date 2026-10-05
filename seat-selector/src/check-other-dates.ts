import { chromium } from 'playwright';

async function checkOtherDates() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0]?.pages().find(p => p.url().includes('railway.gov.bd'));
  if (!page) {
    console.log('No railway page found');
    await browser.close();
    return;
  }

  // Let's use fetch from page context with the user's authenticated token to check availability
  const checkResult = await page.evaluate(async () => {
    const token = localStorage.getItem('token');
    const ssdk = localStorage.getItem('ssdk');
    const uudid = localStorage.getItem('uudid');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (ssdk) headers['x-device-key'] = ssdk;
    if (uudid) headers['x-device-id'] = uudid;

    // Check Dhaka to Cox's Bazar for 12-Oct, 13-Oct, 14-Oct
    // And Dhaka to Chittagong for 11-Oct
    const testQueries = [
      { from: 'Dhaka', to: 'Cox\'s Bazar', date: '12-Oct-2026' },
      { from: 'Dhaka', to: 'Cox\'s Bazar', date: '13-Oct-2026' },
      { from: 'Dhaka', to: 'Chattogram', date: '11-Oct-2026' },
      { from: 'Dhaka', to: 'Sylhet', date: '11-Oct-2026' },
    ];

    const results = [];

    for (const q of testQueries) {
      try {
        const url = `https://eticket.railway.gov.bd/booking/train/search?fromcity=${encodeURIComponent(q.from)}&tocity=${encodeURIComponent(q.to)}&doj=${encodeURIComponent(q.date)}&class=ALL`;
        const res = await fetch(url, { headers });
        results.push({
          query: q,
          status: res.status,
          url: res.url,
        });
      } catch (e: any) {
        results.push({ query: q, error: e.message });
      }
    }

    return results;
  });

  console.log('Test Queries Results:');
  console.log(JSON.stringify(checkResult, null, 2));

  await browser.close();
}

checkOtherDates().catch(console.error);
