import { chromium } from 'playwright';
import { SeatMap } from './railway/seatMap.js';
import { Logger } from './logging/redactor.js';
import { SeatRanker } from './seats/seatRanker.js';
import { loadConfig } from './config/loader.js';
const config = loadConfig();

async function testParse() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0].pages().find(p => p.url().includes('railway.gov.bd'));
  if (!page) {
    console.log('No page found');
    await browser.close();
    return;
  }

  const logger = new Logger(config.logging as any);
  const seatMap = new SeatMap(page, logger);
  const seats = await seatMap.readStableSeatSnapshot('GHA');
  console.log(`Parsed ${seats.length} seats.`);
  const available = seats.filter(s => s.available);
  console.log('Available seats:', available);
  const enabled = seats.filter(s => s.enabled);
  console.log('Enabled seats:', enabled);

  const candidate = SeatRanker.rankAndSelect(seats, config as any);
  console.log('Candidate:', candidate);

  await browser.close();
}

testParse().catch(console.error);
