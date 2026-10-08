import { DirectCdpPage } from '../browser/directCdp.js';
import { Logger } from '../logging/redactor.js';
import { AppConfig } from '../config/schema.js';
import { ClickLedger } from '../safety/clickLedger.js';
import { SeatRanker } from '../seats/seatRanker.js';
import { Seat } from '../seats/seat.types.js';

export interface FastRunOptions {
  /** Keep checking until seats appear instead of exiting after one look. */
  watch: boolean;
  /** Seconds between full reloads in watch mode. Clamped to >= 20s to stay under the 10 req/min limit. */
  reloadIntervalSec: number;
}

type SeatState = 'available' | 'in-progress' | 'booked' | 'selected' | 'unknown';
interface LiveSeat { label: string; num: number; state: SeatState; classes: string }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const bell = () => process.stdout.write('\x07\x07\x07');

/** Normalise station/class strings so "Cox's Bazar", "Coxs Bazar" and "COX'S%20BAZAR" compare equal. */
const norm = (s: string) => decodeURIComponent(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export class FastRunner {
  private logger: Logger;
  private ledger: ClickLedger;

  constructor(private config: AppConfig, private opts: FastRunOptions) {
    this.logger = new Logger(config.logging);
    // Budget must at least cover one pass over the requested seats; default ceiling is 2 per 15 min.
    this.ledger = new ClickLedger(Math.max(config.safety.maximumSeatClickAttempts, config.journey.seatCount));
  }

  public async run(): Promise<void> {
    const { journey, safety } = this.config;
    this.logger.info('=================================================================');
    this.logger.info(`🚆 ${journey.from} ➔ ${journey.to} | ${journey.date} | ${journey.trainNames.join(' / ')} | ${journey.classes.join(', ')} | seats: ${journey.seatCount}`);
    this.logger.info(`Mode: ${safety.dryRun ? 'DRY-RUN (no clicks)' : 'LIVE'}${this.opts.watch ? ` + WATCH (reload every ${this.interval()}s)` : ''} | Continue to OTP: ${safety.allowContinuePurchase ? 'yes' : 'no'}`);
    this.logger.info(`Seat-click budget left in this 15-min window: ${this.ledger.remaining()}`);
    if (journey.seatCount >= 3) {
      this.logger.warn('Requesting 3+ seats: if the portal counts every seat click toward its "3 selections / 15 min" rule, this alone may trigger the 1-hour lock. Prefer 1-2 seats per run.');
    }
    this.logger.info('=================================================================');

    const cdpUrl = new URL(this.config.cdpEndpoint || 'http://127.0.0.1:9222');
    const port = parseInt(cdpUrl.port || '9222', 10);
    const page = await DirectCdpPage.connect(port);
    try {
      let firstPass = true;
      while (true) {
        const outcome = await this.attempt(page, firstPass);
        firstPass = false;
        if (outcome === 'done' || outcome === 'stop' || !this.opts.watch) return;
        this.logger.info(`No usable seats yet. Next reload in ${this.interval()}s (Ctrl+C to stop)...`);
        await sleep(this.interval() * 1000);
      }
    } finally {
      await page.close();
    }
  }

  private interval(): number {
    return Math.max(20, this.opts.reloadIntervalSec);
  }

  /** One full pass. 'retry' = nothing to click yet; 'stop' = hard stop; 'done' = success / handed off. */
  private async attempt(page: DirectCdpPage, firstPass: boolean): Promise<'done' | 'retry' | 'stop'> {
    const { journey, safety } = this.config;

    // 1. Session & human-verification guard
    const session = await page.evaluate(() => ({
      url: location.href,
      hasToken: !!localStorage.getItem('token'),
      hasSsdk: !!localStorage.getItem('ssdk'),
      challenge: /verify you are human|checking your browser/i.test(document.body?.innerText || ''),
    }));
    if (session.challenge) {
      bell();
      this.logger.warn('Cloudflare human-verification is showing. Solve it in Brave; retrying shortly.');
      return 'retry';
    }
    if (!session.hasToken || !session.hasSsdk || /\/login/i.test(session.url)) {
      bell();
      this.logger.error('Not logged in (or session expired). Log in to eticket.railway.gov.bd in Brave, then re-run.');
      return safety.stopOnSessionExpiry ? 'stop' : 'retry';
    }

    // 2. Make sure the tab shows THIS journey (route + date), not whatever search was open last.
    const configuredClasses = journey.classes.length > 0 ? journey.classes : ['S_CHAIR'];
    let targetClass = configuredClasses[0];

    const url = new URL(session.url);
    const onRightSearch = url.pathname.includes('/booking/train/search')
      && norm(url.searchParams.get('fromcity') || '') === norm(journey.from)
      && norm(url.searchParams.get('tocity') || '') === norm(journey.to)
      && norm(url.searchParams.get('doj') || '') === norm(journey.date);

    if (!onRightSearch || !firstPass) {
      const searchUrl = `https://eticket.railway.gov.bd/booking/train/search?fromcity=${encodeURIComponent(journey.from)}&tocity=${encodeURIComponent(journey.to)}&doj=${encodeURIComponent(journey.date)}&class=${encodeURIComponent(targetClass)}`;
      this.logger.info(onRightSearch ? 'Reloading search results...' : `Tab is on a different journey; opening ${journey.from} ➔ ${journey.to} ${journey.date}...`);
      await page.evaluate((u: string) => { location.href = u; }, searchUrl);
      await sleep(800);
    }

    try {
      await page.waitForFunction(() =>
        document.querySelectorAll('.single-trip-wrapper').length > 0 ||
        /no train|not found|no trip/i.test(document.body?.innerText || ''), undefined, 30000);
    } catch {
      this.logger.warn('Search results did not render within 30s (portal may be overloaded).');
      return 'retry';
    }

    // 3. Locate train card and tile for configured classes in priority order; open its seat map.
    let open: any = null;
    for (const cls of configuredClasses) {
      targetClass = cls;
      const result = await page.evaluate(({ trains, cls }: { trains: string[]; cls: string }) => {
        const n = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const num = (s: string) => (s.match(/\((\d+)\)/) || [])[1];
        const cards = Array.from(document.querySelectorAll<HTMLElement>('.single-trip-wrapper'));
        const card = cards.find(c => {
          const title = n(c.querySelector('h2, h3, h4, .train-name')?.textContent || c.innerText.slice(0, 80));
          return trains.some(t => title.includes(n(t)) || (num(t) && title.includes(num(t)!)));
        });
        if (!card) return { status: 'no-train', trainsOnPage: cards.map(c => c.innerText.split('\n')[0]) };

        const tile = Array.from(card.querySelectorAll<HTMLElement>('.single-seat-class'))
          .find(t => n(t.querySelector('.seat-class-name')?.textContent || '') === n(cls));
        if (!tile) return { status: 'no-class' };

        const seatMapOpen = tile.classList.contains('selected') && !!card.querySelector('#select-bogie');
        if (seatMapOpen) return { status: 'open' };

        const btn = tile.querySelector<HTMLButtonElement>('.book-now-btn');
        if (!btn) return { status: 'sold-out' };
        btn.click();
        return { status: 'clicked' };
      }, { trains: journey.trainNames, cls: targetClass });

      open = result;
      if (open.status === 'open' || open.status === 'clicked') {
        break;
      }
      if (open.status === 'no-train') {
        break;
      }
      this.logger.info(`Class ${cls}: ${open.status === 'sold-out' ? 'sold out' : 'not present'}. Checking next class...`);
    }

    if (open.status === 'no-train') {
      this.logger.warn(`Train not listed for this date. Trains on page: ${(open as any).trainsOnPage.join(' | ') || 'none'}`);
      return 'retry';
    }
    if (open.status === 'no-class') {
      this.logger.error(`Train has none of configured classes [${configuredClasses.join(', ')}]. Check config.journey.classes.`);
      return 'stop';
    }
    if (open.status === 'sold-out') {
      this.logger.info(`Configured classes [${configuredClasses.join(', ')}]: 0 tickets available right now.`);
      return 'retry';
    }
    if (open.status === 'clicked') {
      try {
        await page.waitForFunction(() => {
          const s = document.querySelector<HTMLSelectElement>('#select-bogie');
          return !!s && s.options.length > 0 && document.querySelectorAll('button.btn-seat').length > 0;
        }, undefined, 20000);
      } catch {
        this.logger.warn('Seat map did not load within 20s.');
        return 'retry';
      }
    }

    // 4. Pick the coach with enough vacant seats and switch the dropdown (Angular needs bubbling events).
    const coach = await page.evaluate(({ preferred, need }: { preferred: string[]; need: number }) => {
      const sel = document.querySelector<HTMLSelectElement>('#select-bogie');
      if (!sel) return { error: 'no #select-bogie' };
      const opts = Array.from(sel.options).map(o => {
        const m = o.text.match(/([A-Z0-9_]+)\s*-\s*(\d+)\s*Seat/i);
        return { name: m ? m[1].toUpperCase() : o.text.trim(), count: m ? +m[2] : 0, value: o.value };
      });
      const isPref = (name: string) => preferred.some(p => p.toUpperCase() === name);
      const enough = opts.filter(o => o.count >= need);
      const target = enough.find(o => isPref(o.name)) || enough[0]
        || [...opts].sort((a, b) => b.count - a.count).find(o => o.count > 0);
      if (!target) return { opts, target: null, switched: false };
      const switched = sel.value !== target.value;
      if (switched) {
        sel.value = target.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        sel.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return { opts, target, switched };
    }, { preferred: this.config.preferences.preferredCoaches, need: journey.seatCount });

    if ((coach as any).error) {
      this.logger.warn(`Coach dropdown missing: ${(coach as any).error}`);
      return 'retry';
    }
    this.logger.info(`Coaches: ${(coach.opts || []).map((o: { name: string; count: number }) => `${o.name}(${o.count})`).join(' ')}`);
    if (!coach.target) {
      this.logger.info('Every coach shows 0 vacant seats.');
      return 'retry';
    }
    const coachName = coach.target.name;
    if (coach.switched) {
      this.logger.info(`Switched coach ➔ ${coachName}`);
      await page.waitForFunction((c: string) =>
        Array.from(document.querySelectorAll('button.btn-seat')).some(b => (b.textContent || '').trim().startsWith(c + '-')),
        coachName, 8000).catch(() => {});
      await sleep(250);
    }

    // 5. Read seat states for the active coach.
    const seats = await this.readSeats(page, coachName);
    const available = seats.filter(s => s.state === 'available');
    const held = seats.filter(s => s.state === 'in-progress');
    const mine = seats.filter(s => s.state === 'selected');
    this.logger.info(`${coachName}: ${available.length} white [${available.map(s => s.label).join(', ')}] | ${held.length} green/held [${held.map(s => s.label).join(', ')}] | ${mine.length} already yours`);

    // Never re-click a seat that is already ours: a second click DESELECTS it and burns budget.
    const needed = journey.seatCount - mine.length;
    let picks: LiveSeat[] = [];
    if (needed > 0) {
      picks = this.choose(coachName, available, needed);
      if (picks.length < needed) {
        if (held.length) this.logger.info('Some seats are held by other buyers (green). They may free up in ~5 min if payment fails.');
        return 'retry';
      }
    }

    if (safety.dryRun) {
      this.logger.info(`🧪 DRY-RUN: would click ${picks.map(s => s.label).join(', ') || '(nothing — already selected)'}${safety.allowContinuePurchase ? ' then CONTINUE PURCHASE ➔ OTP' : ''}.`);
      return 'done';
    }

    // 6. Budget check BEFORE any click (persisted across runs).
    if (picks.length > this.ledger.remaining()) {
      const wait = Math.ceil(this.ledger.msUntilNextSlot() / 60000);
      this.logger.error(`Click budget exhausted (${this.ledger.recent().length} clicks in last 15 min). Wait ~${wait} min to avoid the 1-hour seat-selection lock.`);
      return 'stop';
    }

    for (const seat of picks) {
      const result = await this.clickSeat(page, seat.label);
      this.ledger.record(seat.label, result);
      if (result === 'selected') {
        this.logger.info(`🟦 ${seat.label} selected.`);
      } else {
        this.logger.warn(`🟩 ${seat.label} was taken by someone else (${result}). Stopping clicks to protect your account.`);
        bell();
        return 'stop';
      }
    }

    // 7. Hand-off: optionally continue to the OTP page, then stop.
    if (!safety.allowContinuePurchase) {
      bell();
      this.logger.info('✅ Seats selected. allowContinuePurchase=false, so click CONTINUE PURCHASE yourself.');
      return 'done';
    }
    return (await this.continueToOtp(page)) ? 'done' : 'stop';
  }

  private async readSeats(page: DirectCdpPage, coach: string): Promise<LiveSeat[]> {
    return page.evaluate((c: string) => {
      return Array.from(document.querySelectorAll<HTMLButtonElement>('button.btn-seat'))
        .map(b => {
          const label = (b.textContent || '').trim();
          const cl = b.className;
          let state: string = 'unknown';
          if (/seat-booked/.test(cl)) state = 'booked';
          else if (/seat-in-progress/.test(cl)) state = 'in-progress';
          else if (/selected/.test(cl)) state = 'selected';
          else if (/seat-available/.test(cl) && !b.disabled) state = 'available';
          return { label, num: +(label.split('-').pop() || 0), state, classes: cl };
        })
        .filter(s => s.label.toUpperCase().startsWith(c + '-'));
    }, coach) as Promise<LiveSeat[]>;
  }

  /** Choose seats using canonical SeatRanker honoring window, adjacency, and fallback preferences. */
  private choose(coach: string, available: LiveSeat[], needed: number): LiveSeat[] {
    const prefs = this.config.preferences;

    // Convert LiveSeat to standard Seat model with window, row, and column evidence
    const standardSeats: Seat[] = available.map((s) => {
      const num = s.num;
      const isWindow = num > 0 ? num % 4 === 1 || num % 4 === 0 : false;
      const row = num > 0 ? String(Math.ceil(num / 4)) : undefined;
      const col = num > 0 ? String(((num - 1) % 4) + 1) : undefined;
      const labelToken = s.label.includes('-') ? s.label.split('-').pop()! : s.label;

      return {
        coach,
        label: labelToken,
        available: s.state === 'available',
        selected: s.state === 'selected',
        enabled: true,
        type: isWindow ? 'WINDOW' : 'AISLE',
        row,
        column: col,
        locatorKey: s.label,
      };
    });

    const rankerConfig = {
      ...this.config,
      journey: {
        ...this.config.journey,
        seatCount: needed,
      },
    };

    const ranked = SeatRanker.rankAndSelect(standardSeats, rankerConfig);
    if (ranked && ranked.seats.length >= needed) {
      const selectedTokens = new Set(ranked.seats.map((s) => s.label.toUpperCase()));
      const matchedLive = available.filter((s) => {
        const token = s.label.includes('-') ? s.label.split('-').pop()! : s.label;
        return selectedTokens.has(token.toUpperCase());
      });
      if (matchedLive.length >= needed) {
        return matchedLive.slice(0, needed);
      }
    }

    // Direct fallback: exact seats first
    const exact = available.filter((s) =>
      prefs.exactSeats.some(
        (e) =>
          e.toUpperCase() === s.label.toUpperCase() ||
          e.toUpperCase() === `${coach}-${s.label}`.toUpperCase()
      )
    );
    if (exact.length >= needed) return exact.slice(0, needed);
    if (needed === 1) return available.slice(0, 1);

    const sorted = [...available].sort((a, b) => a.num - b.num);
    for (let i = 0; i + needed <= sorted.length; i++) {
      const run = sorted.slice(i, i + needed);
      const isConsecutive = run[needed - 1].num - run[0].num === needed - 1;
      const sameRow = Math.floor((run[0].num - 1) / 4) === Math.floor((run[needed - 1].num - 1) / 4);
      if (isConsecutive && (sameRow || prefs.allowSameCoachFallback)) return run;
    }
    if (!prefs.requireAdjacent || prefs.allowSameCoachFallback) return sorted.slice(0, needed);
    return [];
  }

  /**
   * Clicks once and polls up to 4.5s for the outcome. Success is confirmed by the seat's class OR
   * appearance in the seat summary panel alongside fare total.
   */
  private async clickSeat(page: DirectCdpPage, label: string): Promise<'selected' | 'contested' | 'unknown'> {
    const before = await page.evaluate(() => {
      const el = document.querySelector('.total-amount, .trip-fare-details, .fare-details') || document.body;
      const m = (el.textContent || '').match(/Total:\s*৳\s*([\d,]+)/);
      return m ? +m[1].replace(/,/g, '') : 0;
    });

    const clicked = await page.evaluate((l: string) => {
      const b = Array.from(document.querySelectorAll<HTMLButtonElement>('button.btn-seat')).find(x => (x.textContent || '').trim() === l);
      if (!b || b.disabled || /seat-booked|seat-in-progress/.test(b.className)) return false;
      b.click();
      return true;
    }, label);
    if (!clicked) return 'contested';

    const deadline = Date.now() + 4500;
    while (Date.now() < deadline) {
      await sleep(50);
      const res = await page.evaluate(({ l, prevTotal }: { l: string; prevTotal: number }) => {
        const b = Array.from(document.querySelectorAll<HTMLButtonElement>('button.btn-seat')).find(x => (x.textContent || '').trim() === l);
        const toast = document.querySelector('.toast-error, .toast-message, .swal2-html-container, .alert-danger')?.textContent || '';
        if (/already|unavailable|taken|not available|try again/i.test(toast)) return 'contested';
        if (!b) return 'contested';
        if (/seat-booked|seat-in-progress/.test(b.className)) return 'contested';

        // Check selected indicators: class, attribute
        if (/selected|seat-selected/.test(b.className) || b.getAttribute('aria-selected') === 'true') return 'selected';

        // Direct seat panel verification
        const detailsText = document.querySelector('.seat-details, .passenger-details, .booking-summary, .selected-seats')?.textContent || '';
        const seatTokenRegex = new RegExp(`(?:^|[^a-zA-Z0-9])${l}(?:$|[^a-zA-Z0-9])`, 'i');
        if (seatTokenRegex.test(detailsText)) return 'selected';

        const el = document.querySelector('.total-amount, .trip-fare-details, .fare-details') || document.body;
        const m = (el.textContent || '').match(/Total:\s*৳\s*([\d,]+)/);
        const currTotal = m ? +m[1].replace(/,/g, '') : 0;
        if (currTotal > prevTotal && seatTokenRegex.test(detailsText)) return 'selected';

        return 'pending';
      }, { l: label, prevTotal: before });

      if (res === 'selected' || res === 'contested') return res;
    }
    return 'unknown';
  }

  /** Clicks CONTINUE PURCHASE only, then waits for the OTP inputs. Never touches OTP, Resend, Verify or payment. */
  private async continueToOtp(page: DirectCdpPage): Promise<boolean> {
    const clicked = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll<HTMLElement>('button, a, input[type="button"], input[type="submit"]'))
        .find(x => /continue\s*purchase/i.test((x.textContent || (x as HTMLInputElement).value || '').trim()));
      if (!b || (b as HTMLButtonElement).disabled) return false;
      b.click();
      return true;
    });
    if (!clicked) {
      this.logger.error('CONTINUE PURCHASE button not found/enabled. Finish manually in Brave.');
      bell();
      return false;
    }
    this.logger.info('Clicked CONTINUE PURCHASE. Waiting for the OTP screen...');

    try {
      await page.waitForFunction(() =>
        location.pathname.includes('/trip-info') && document.querySelectorAll('input.rec-otp').length > 0, undefined, 30000);
    } catch {
      const err = await page.evaluate(() =>
        document.querySelector('.toast-error, .toast-message, .swal2-html-container, .alert-danger')?.textContent?.trim() || '').catch(() => '');
      this.logger.error(`OTP screen did not appear within 30s.${err ? ` Portal says: "${err}"` : ''} Check Brave.`);
      bell();
      return false;
    }

    const timer = await page.evaluate(() => (document.body.innerText.match(/(\d{2}:\d{2})\s*\n?\s*Remaining/) || [])[1] || '');
    bell();
    this.logger.info('=================================================================');
    this.logger.info(`🎉 OTP SCREEN REACHED. Seat(s) held${timer ? ` — ${timer} left to pay` : ''}.`);
    this.logger.info('👉 Type the 4-digit SMS OTP in Brave, press Verify, and pay. The script stops here.');
    this.logger.info('=================================================================');
    return true;
  }
}
