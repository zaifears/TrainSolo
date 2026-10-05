import { chromium } from 'playwright';

async function testSimple() {
  console.log('Testing simple connection with 5s timeout...');
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 8000 });
    console.log('Success! Contexts:', browser.contexts().length);
    // Do NOT call browser.close(), call browser.close() or just let script exit
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

testSimple();
