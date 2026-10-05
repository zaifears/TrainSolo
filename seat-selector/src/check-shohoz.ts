import { chromium } from 'playwright';

async function checkShohoz() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0]?.pages().find(p => p.url().includes('railway.gov.bd'));
  if (!page) {
    console.log('No railway page found');
    await browser.close();
    return;
  }

  const result = await page.evaluate(async () => {
    const token = localStorage.getItem('token');
    const ssdk = localStorage.getItem('ssdk');
    const uudid = localStorage.getItem('uudid');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-requested-with': 'XMLHttpRequest',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (ssdk) headers['x-device-key'] = ssdk;
    if (uudid) headers['x-device-id'] = uudid;

    // Test Dhaka to Chittagong on 11-Oct-2026
    const res = await fetch('https://railspaapi.shohoz.com/v1.0/web/bookings/search-trips-v2?from_city=Dhaka&to_city=Chittagong&date_of_journey=11-Oct-2026&seat_class=S_CHAIR', { headers });
    const data = await res.json();
    return {
      status: res.status,
      trains: data?.data?.trains?.map((t: any) => ({
        name: t.trip_number,
        classes: t.seat_types?.map((st: any) => ({
          type: st.type,
          seat_counts: st.seat_counts
        }))
      }))
    };
  });

  console.log('Shohoz API Test:');
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
}

checkShohoz().catch(console.error);
