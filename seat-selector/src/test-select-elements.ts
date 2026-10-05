import { chromium } from 'playwright';

async function testSelectElements() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0].pages().find(p => p.url().includes('railway.gov.bd'));
  if (!page) {
    console.log('No page found');
    await browser.close();
    return;
  }

  const selects = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('select'));
    return all.map((s, idx) => ({
      index: idx,
      id: s.id,
      className: s.className,
      name: s.name,
      optionsSnippet: Array.from(s.options).map(o => o.text).slice(0, 3).join(', ')
    }));
  });

  console.log('All select elements on page:');
  console.log(JSON.stringify(selects, null, 2));

  // Check what this.page.locator('select.form-control, select.coach-select, select:not(#lang-switch-dropdown)').first() matches:
  const firstMatch = await page.locator('select.form-control, select.coach-select, select:not(#lang-switch-dropdown)').first().evaluate(el => ({
    id: el.id,
    className: el.className,
    outer: el.outerHTML.slice(0, 150)
  }));

  console.log('\nFirst locator match:');
  console.log(firstMatch);

  await browser.close();
}

testSelectElements().catch(console.error);
