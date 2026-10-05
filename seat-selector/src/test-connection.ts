import { chromium } from 'playwright';

async function testConnection() {
  console.log('='.repeat(65));
  console.log('🔍 Testing Playwright CDP Connection to Brave Browser');
  console.log('='.repeat(65));
  console.log('Connecting to http://127.0.0.1:9222...');

  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const contexts = browser.contexts();
    console.log(`\n✅ Connected successfully!`);
    console.log(`Found ${contexts.length} browser context(s).\n`);

    let railwayTabFound = false;

    for (const [ctxIndex, context] of contexts.entries()) {
      const pages = context.pages();
      console.log(`Context #${ctxIndex + 1} (${pages.length} tab(s) open):`);

      for (const [pageIndex, page] of pages.entries()) {
        const title = await page.title().catch(() => '(No title)');
        const url = page.url();
        console.log(`  [${pageIndex + 1}] "${title}" ➔ ${url}`);

        if (url.includes('eticket.railway.gov.bd') || url.includes('railway.gov.bd')) {
          railwayTabFound = true;
          console.log(`      🎯 Identified Bangladesh Railway Tab!`);

          // Inspect authentication state in this tab
          const authState = await page.evaluate(() => {
            const token = localStorage.getItem('token');
            const ssdk = localStorage.getItem('ssdk');
            const uudid = localStorage.getItem('uudid');
            return {
              hasToken: Boolean(token),
              tokenLength: token ? token.length : 0,
              hasSsdk: Boolean(ssdk),
              hasUudid: Boolean(uudid),
              bodySnippet: document.body.innerText.slice(0, 150).replace(/\s+/g, ' '),
            };
          }).catch(err => ({ error: err.message }));

          console.log(`      🔑 Session Status:`, authState);
        }
      }
    }

    if (!railwayTabFound) {
      console.log('\n💡 Note: No tab is currently open to eticket.railway.gov.bd.');
      console.log('   Open https://eticket.railway.gov.bd in your Brave window and run this test again.');
    } else {
      console.log('\n🎉 Playwright has full DOM inspection capability on your active Railway tab!');
    }

    console.log('='.repeat(65) + '\n');
    await browser.close();
  } catch (error: any) {
    console.error('\n❌ Could not connect to Brave over CDP:');
    console.error(error.message);
    console.log('\nTip: Run .\\launch-brave.ps1 first to ensure Brave starts with --remote-debugging-port=9222\n');
  }
}

testConnection();
