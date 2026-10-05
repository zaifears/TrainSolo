import { chromium } from 'playwright';

async function inspectStorage() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0]?.pages().find(p => p.url().includes('railway.gov.bd'));
  if (!page) return;

  const data = await page.evaluate(() => {
    const sStore: Record<string, any> = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)!;
      try {
        sStore[k] = JSON.parse(sessionStorage.getItem(k)!);
      } catch {
        sStore[k] = sessionStorage.getItem(k);
      }
    }

    const lKeys = Object.keys(localStorage);
    return {
      sessionStorage: sStore,
      localStorageKeys: lKeys,
    };
  });

  console.log('='.repeat(70));
  console.log('📦 RAILWAY APP STORAGE STATE');
  console.log('='.repeat(70));
  console.log('SessionStorage Keys:', Object.keys(data.sessionStorage));
  for (const [k, v] of Object.entries(data.sessionStorage)) {
    console.log(`\n🔑 [sessionStorage: "${k}"]`);
    console.log(JSON.stringify(v, null, 2).slice(0, 1000));
  }
  console.log('\nLocalStorage Keys:', data.localStorageKeys);
  console.log('='.repeat(70));
  await browser.close();
}

inspectStorage();
