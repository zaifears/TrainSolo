import { chromium } from 'playwright';

async function testPageCdp() {
  // Query /json/list to get page websocket URL
  const res = await fetch('http://127.0.0.1:9222/json/list');
  const pages = await res.json();
  const railwayPage = pages.find((p: any) => p.url && p.url.includes('railway.gov.bd'));
  console.log('Railway page target:', railwayPage?.webSocketDebuggerUrl);

  if (railwayPage?.webSocketDebuggerUrl) {
    try {
      console.log('Attempting connectOverCDP with page ws url...');
      const browser = await chromium.connectOverCDP(railwayPage.webSocketDebuggerUrl, { timeout: 5000 });
      console.log('Success with page ws url! Contexts:', browser.contexts().length);
      const ctx = browser.contexts()[0];
      console.log('Pages count:', ctx.pages().length);
      for (const p of ctx.pages()) {
        console.log('Page URL:', p.url());
      }
    } catch (err: any) {
      console.log('Page ws url error:', err.message);
    }
  }
}

testPageCdp();
