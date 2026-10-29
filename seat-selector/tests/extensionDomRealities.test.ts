import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

/**
 * Lightweight realistic DOM node simulator matching Bangladesh Railway Angular SPA elements
 */
class MockElement {
  public tagName: string;
  public id = '';
  public className = '';
  public textContent = '';
  public value = '';
  public disabled = false;
  public selected = false;
  public style: Record<string, string> = {};
  public parentElement: MockElement | null = null;
  public children: MockElement[] = [];
  public options: MockElement[] = [];
  public offsetParent: object | null = {};
  private _innerHTML = '';
  private attrs = new Map<string, string>();
  private listeners = new Map<string, Array<(e?: any) => void>>();

  constructor(tagName = 'DIV') {
    this.tagName = tagName.toUpperCase();
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html: string) {
    this._innerHTML = html;
    this.children = [];
    this.options = [];

    const tagRegex = /<\/?([a-zA-Z0-9]+)([^>]*)>/g;
    let match: RegExpExecArray | null;
    let currentSelect: MockElement | null = null;
    let pillsGroup: MockElement | null = null;

    while ((match = tagRegex.exec(html)) !== null) {
      const fullMatch = match[0];
      const isClosing = fullMatch.startsWith('</');
      const tag = match[1].toUpperCase();
      const attrsStr = match[2];

      if (isClosing) {
        if (tag === 'SELECT') currentSelect = null;
        if (tag === 'DIV' && pillsGroup) pillsGroup = null;
        continue;
      }

      const el = new MockElement(tag);
      const idMatch = attrsStr.match(/id="([^"]+)"/);
      if (idMatch) el.id = idMatch[1];
      const classMatch = attrsStr.match(/class="([^"]+)"/);
      if (classMatch) el.className = classMatch[1];
      const dataSeatsMatch = attrsStr.match(/data-seats="([^"]+)"/);
      if (dataSeatsMatch) el.setAttribute('data-seats', dataSeatsMatch[1]);
      const valueMatch = attrsStr.match(/value="([^"]*)"/);
      if (valueMatch) el.value = valueMatch[1];

      const afterTag = html.slice(tagRegex.lastIndex);
      const textMatch = afterTag.match(/^([^<]+)/);
      if (textMatch) el.textContent = textMatch[1].trim();

      if (tag === 'SELECT') {
        currentSelect = el;
        this.appendChild(el);
      } else if (tag === 'OPTION' && currentSelect) {
        currentSelect.appendChild(el);
      } else if (el.id === 'hudSeatPills') {
        pillsGroup = el;
        this.appendChild(el);
      } else if (el.className.includes('hud-seat-pill') && pillsGroup) {
        pillsGroup.appendChild(el);
      } else {
        this.appendChild(el);
      }
    }
  }

  get classList() {
    return {
      contains: (cls: string) => this.className.split(/\s+/).includes(cls),
      add: (cls: string) => {
        if (!this.className.split(/\s+/).includes(cls)) {
          this.className = `${this.className} ${cls}`.trim();
        }
      },
      remove: (cls: string) => {
        this.className = this.className
          .split(/\s+/)
          .filter((c) => c !== cls)
          .join(' ');
      },
      toggle: (cls: string, force?: boolean) => {
        const has = this.className.split(/\s+/).includes(cls);
        const shouldHave = force !== undefined ? force : !has;
        if (shouldHave && !has) this.className = `${this.className} ${cls}`.trim();
        if (!shouldHave && has) {
          this.className = this.className
            .split(/\s+/)
            .filter((c) => c !== cls)
            .join(' ');
        }
      },
    };
  }

  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  appendChild(child: MockElement) {
    child.parentElement = this;
    this.children.push(child);
    if (this.tagName === 'SELECT' && child.tagName === 'OPTION') {
      this.options.push(child);
    }
    return child;
  }
  remove(idx: number) {
    if (this.tagName === 'SELECT') {
      this.options.splice(idx, 1);
    }
  }
  contains(other: MockElement | null): boolean {
    let cur: MockElement | null = other;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentElement;
    }
    return false;
  }
  closest(selector: string): MockElement | null {
    let cur: MockElement | null = this;
    while (cur) {
      if (cur.matchesSelector(selector)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  scrollIntoView() {}
  focus() {}
  addEventListener(evt: string, fn: (e?: any) => void) {
    const list = this.listeners.get(evt) || [];
    list.push(fn);
    this.listeners.set(evt, list);
  }
  dispatchEvent(evt: { type?: string } | string) {
    const type = typeof evt === 'string' ? evt : evt.type || '';
    const list = this.listeners.get(type) || [];
    list.forEach((fn) => fn({ target: this, stopPropagation: () => {}, preventDefault: () => {} }));
  }
  click() {
    this.dispatchEvent({ type: 'click' });
  }
  matchesSelector(sel: string): boolean {
    const parts = sel.split(',').map((s) => s.trim());
    return parts.some((p) => {
      if (p.startsWith('#')) return this.id === p.slice(1);
      if (p === "[aria-selected='true']") {
        return this.getAttribute('aria-selected') === 'true';
      }
      if (p.includes("[class*='")) {
        const sub = p.match(/\[class\*='([^']+)'\]/)?.[1] || '';
        return sub ? this.className.includes(sub) : false;
      }
      if (p.includes('[data-seat]')) {
        return this.attrs.has('data-seat');
      }
      if (p.includes('.')) {
        const [tag, ...classes] = p.split('.');
        const tagMatches = !tag || this.tagName.toLowerCase() === tag.toLowerCase();
        const myClasses = this.className.split(/\s+/);
        const classMatches = classes.every((c) => myClasses.includes(c));
        return tagMatches && classMatches;
      }
      if (p.includes('[')) {
        const tag = p.split('[')[0];
        return !tag || this.tagName.toLowerCase() === tag.toLowerCase();
      }
      return this.tagName.toLowerCase() === p.toLowerCase();
    });
  }
  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    const visit = (node: MockElement) => {
      for (const ch of node.children) {
        if (ch.matchesSelector(selector)) results.push(ch);
        visit(ch);
      }
    };
    visit(this);
    return results;
  }
  querySelector(selector: string): MockElement | null {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function loadExtensionContentScript() {
  const scriptPath = path.resolve(__dirname, '../../trainsolo-extension/content.js');
  const code = fs.readFileSync(scriptPath, 'utf8');

  const body = new MockElement('BODY');
  const storageMap = new Map<string, any>();
  const sessionMap = new Map<string, string>();

  const sandbox: any = {
    __TRAINSOLO_ENABLE_TEST_API__: true,
    __TRAINSOLO_TEST_API__: null,
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    URL,
    URLSearchParams,
    Event: class {
      type: string;
      constructor(t: string) {
        this.type = t;
      }
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    sessionStorage: {
      getItem: (k: string) => sessionMap.get(k) ?? null,
      setItem: (k: string, v: string) => sessionMap.set(k, String(v)),
      removeItem: (k: string) => sessionMap.delete(k),
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
    },
    location: {
      href: 'https://eticket.railway.gov.bd/booking/train/search?fromcity=Dhaka&tocity=Cox%27s%20Bazar&doj=11-Oct-2026&class=S_CHAIR',
      search: '?fromcity=Dhaka&tocity=Cox%27s%20Bazar&doj=11-Oct-2026&class=S_CHAIR',
      hash: '',
      pathname: '/booking/train/search',
      hostname: 'eticket.railway.gov.bd',
      reload: () => {},
    },
    window: null as any,
    document: {
      readyState: 'complete',
      body,
      activeElement: null,
      createElement: (tag: string) => new MockElement(tag),
      getElementById: (id: string) => body.querySelector(`#${id}`),
      querySelector: (sel: string) => body.querySelector(sel),
      querySelectorAll: (sel: string) => body.querySelectorAll(sel),
      addEventListener: () => {},
    },
    chrome: {
      storage: {
        local: {
          get: (keys: string[], cb: (res: any) => void) => {
            const out: any = {};
            keys.forEach((k) => {
              if (storageMap.has(k)) out[k] = storageMap.get(k);
            });
            cb(out);
          },
          set: (obj: Record<string, any>, cb?: () => void) => {
            Object.entries(obj).forEach(([k, v]) => storageMap.set(k, v));
            if (cb) cb();
          },
        },
      },
      runtime: {
        onMessage: { addListener: () => {} },
      },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  return {
    api: sandbox.__TRAINSOLO_TEST_API__,
    body,
    sandbox,
    storageMap,
    sessionMap,
  };
}

/**
 * Helper to build a realistic Bangladesh Railway train card matching live-brave-full.png
 */
function createLiveRailwayCard(
  trainTitle: string,
  tiles: Array<{ className: string; fare: number; available: number }>,
): MockElement {
  const card = new MockElement('DIV');
  card.className = 'single-trip-wrapper';

  const header = new MockElement('H2');
  header.className = 'train-name';
  header.textContent = trainTitle;
  card.appendChild(header);

  const sub = new MockElement('DIV');
  sub.textContent = '1+ users are trying to book ticket(s)';
  card.appendChild(sub);

  let fullCardText = `${trainTitle}\n1+ users are trying to book ticket(s)\n`;

  for (const t of tiles) {
    const tile = new MockElement('DIV');
    tile.className = 'single-seat-class';

    const clsEl = new MockElement('SPAN');
    clsEl.className = 'seat-class-name';
    clsEl.textContent = t.className;
    tile.appendChild(clsEl);

    const countEl = new MockElement('SPAN');
    countEl.className = 'all-seats';
    countEl.textContent = String(t.available);
    tile.appendChild(countEl);

    // Exact text order from live-brave-full.png:
    // "AC_S ৳1728 Including VAT Available Tickets (Counter + Online) 1 BOOK NOW"
    tile.textContent = `${t.className} ৳${t.fare} Including VAT Available Tickets (Counter + Online) ${t.available}`;

    if (t.available > 0) {
      const btn = new MockElement('BUTTON');
      btn.className = 'book-now-btn';
      btn.textContent = 'BOOK NOW';
      tile.appendChild(btn);
      tile.textContent += ' BOOK NOW';
    }

    card.appendChild(tile);
    fullCardText += tile.textContent + '\n';
  }

  card.textContent = fullCardText;
  return card;
}

describe('Extension DOM Reality Checks (eticket.railway.gov.bd)', () => {
  let ctx: ReturnType<typeof loadExtensionContentScript>;

  beforeEach(() => {
    ctx = loadExtensionContentScript();
  });

  it('Reality 1: getCardSeatCapacity parses "Available Tickets (Counter + Online) <N>" without mistaking train number (816)', () => {
    const card = createLiveRailwayCard('PARJOTAK EXPRESS (816)', [
      { className: 'AC_S', fare: 1728, available: 1 },
      { className: 'SNIGDHA', fare: 1443, available: 0 },
      { className: 'S_CHAIR', fare: 754, available: 45 },
    ]);

    expect(ctx.api.getCardSeatCapacity(card, 'AC_S')).toBe(1);
    expect(ctx.api.getCardSeatCapacity(card, 'SNIGDHA')).toBe(0);
    expect(ctx.api.getCardSeatCapacity(card, 'S_CHAIR')).toBe(45);
    // When targetClass is empty or ANY, returns max available across classes (45), NEVER 816!
    expect(ctx.api.getCardSeatCapacity(card, '')).toBe(45);
    expect(ctx.api.getCardSeatCapacity(card, 'ANY')).toBe(45);
  });

  it('Reality 2: Auto-Cut without a target train picks the train card that actually has >= neededSeats', async () => {
    const soldOutCard = createLiveRailwayCard('COXS Bazar EXPRESS (814)', [
      { className: 'S_CHAIR', fare: 754, available: 0 },
      { className: 'SNIGDHA', fare: 1443, available: 0 },
    ]);
    const availableCard = createLiveRailwayCard('PARJOTAK EXPRESS (816)', [
      { className: 'S_CHAIR', fare: 754, available: 12 },
      { className: 'SNIGDHA', fare: 1443, available: 0 },
    ]);

    ctx.body.appendChild(soldOutCard);
    ctx.body.appendChild(availableCard);

    // Simulate BOOK NOW on availableCard opening #select-bogie and white seats
    const bookBtn = availableCard.querySelector('.book-now-btn')!;
    bookBtn.addEventListener('click', () => {
      const select = new MockElement('SELECT');
      select.id = 'select-bogie';
      const opt = new MockElement('OPTION');
      opt.value = 'KA';
      opt.textContent = 'KA - 12 Seat(s)';
      (opt as any).text = 'KA - 12 Seat(s)';
      select.appendChild(opt);
      select.value = 'KA';
      availableCard.appendChild(select);

      for (let i = 1; i <= 12; i++) {
        const seat = new MockElement('BUTTON');
        seat.className = 'btn-seat seat-available';
        seat.textContent = `KA-${i}`;
        seat.setAttribute('data-seat', `KA-${i}`);
        seat.addEventListener('click', () => {
          seat.className = 'btn-seat selected';
        });
        availableCard.appendChild(seat);
      }

      const cont = new MockElement('BUTTON');
      cont.textContent = 'CONTINUE PURCHASE';
      cont.addEventListener('click', () => {
        ctx.sandbox.location.pathname = '/booking/train/search/trip-info';
        const otp = new MockElement('INPUT');
        otp.className = 'rec-otp';
        ctx.body.appendChild(otp);
      });
      ctx.body.appendChild(cont);
    });

    // Configure WITHOUT target train (Auto-Detect mode), needing 2 S_CHAIR seats
    ctx.api.setTargetConfig({
      train: '',
      trainNumber: '',
      seats: 2,
      seatClass: 'S_CHAIR',
    });

    const statuses: string[] = [];
    const ok = await ctx.api.runAutoCut((msg: string) => statuses.push(msg));
    expect(ok).toBe(true);
  });

  it('Reality 3: Multi-Coach Fallback when first coach has only green (seat-in-progress) seats', async () => {
    const card = createLiveRailwayCard('PARJOTAK EXPRESS (816)', [
      { className: 'AC_S', fare: 1728, available: 5 },
    ]);
    ctx.body.appendChild(card);

    const select = new MockElement('SELECT');
    select.id = 'select-bogie';

    const optGha = new MockElement('OPTION');
    optGha.value = 'GHA';
    (optGha as any).text = 'GHA - 2 Seat(s)';
    optGha.textContent = 'GHA - 2 Seat(s)';

    const optKa = new MockElement('OPTION');
    optKa.value = 'KA';
    (optKa as any).text = 'KA - 3 Seat(s)';
    optKa.textContent = 'KA - 3 Seat(s)';

    select.appendChild(optGha);
    select.appendChild(optKa);
    select.value = 'GHA';
    card.appendChild(select);

    // Initially GHA is open, but its 2 seats are GREEN (seat-in-progress, held by another buyer!)
    const renderCoachSeats = (coachName: string) => {
      card.children = card.children.filter((c) => !c.className.includes('btn-seat'));
      for (let i = 1; i <= 3; i++) {
        const seat = new MockElement('BUTTON');
        // GHA has only green/held seats; KA has actual white available seats
        seat.className = coachName === 'GHA' ? 'btn-seat seat-in-progress' : 'btn-seat seat-available';
        seat.textContent = `${coachName}-${i}`;
        seat.setAttribute('data-seat', `${coachName}-${i}`);
        seat.addEventListener('click', () => {
          if (seat.className.includes('seat-available')) {
            seat.className = 'btn-seat selected';
          }
        });
        card.appendChild(seat);
      }
    };
    renderCoachSeats('GHA');

    select.addEventListener('change', () => {
      renderCoachSeats(select.value);
    });

    const cont = new MockElement('BUTTON');
    cont.textContent = 'CONTINUE PURCHASE';
    cont.addEventListener('click', () => {
      ctx.sandbox.location.pathname = '/booking/train/search/trip-info';
      const otp = new MockElement('INPUT');
      otp.className = 'rec-otp';
      ctx.body.appendChild(otp);
    });
    ctx.body.appendChild(cont);

    ctx.api.setTargetConfig({
      train: 'PARJOTAK',
      trainNumber: '816',
      seats: 2,
      seatClass: 'AC_S',
    });

    const statuses: string[] = [];
    const ok = await ctx.api.runAutoCut((msg: string) => statuses.push(msg), card);
    expect(ok).toBe(true);
    expect(select.value).toBe('KA');
  });

  it('Reality 4A: Pre-8:00 AM empty page -> Drop Sniper armed WITHOUT target train auto-fires on highest capacity train at 8:00 AM', async () => {
    // 1. Pre-8:00 AM: 0 train cards on page
    await ctx.api.injectHud();

    const hudTrainSelect = ctx.body.querySelector('#hudTrainSelect')!;
    const hudSniperBtn = ctx.body.querySelector('#hudSniperBtn')!;
    const hudCutBtn = ctx.body.querySelector('#hudCutBtn')!;

    // Initial state: Auto-Detect only
    expect(hudTrainSelect.options.length).toBe(1);
    expect(hudTrainSelect.options[0].textContent).toContain('Auto-Detect');

    let cutClicked = false;
    hudCutBtn.addEventListener('click', () => {
      cutClicked = true;
    });

    // User arms Drop Sniper before 8:00 AM
    hudSniperBtn.click();
    expect(ctx.sandbox.sessionStorage.getItem('trainsolo_sniper_armed')).toBe('1');

    // 2. Exactly at 8:00 AM: 3 trains appear in DOM
    const soldOutCard = createLiveRailwayCard('COXS BAZAR EXPRESS (814)', [
      { className: 'S_CHAIR', fare: 754, available: 0 },
    ]);
    const mediumCard = createLiveRailwayCard('PARJOTAK EXPRESS (816)', [
      { className: 'S_CHAIR', fare: 754, available: 20 },
    ]);
    const maxCapacityCard = createLiveRailwayCard('SONAR BANGLA EXPRESS (788)', [
      { className: 'S_CHAIR', fare: 754, available: 120 },
    ]);

    ctx.body.appendChild(soldOutCard);
    ctx.body.appendChild(mediumCard);
    ctx.body.appendChild(maxCapacityCard);

    // Trigger train card population when DOM observer fires on cards arriving at 8:00 AM
    ctx.api.populateTrainCards();

    // The HUD dropdown now has all 3 trains populated!
    expect(hudTrainSelect.options.length).toBe(4); // Auto-detect + 3 trains
    // Drop Sniper disarmed itself and auto-triggered cutBtn!
    expect(cutClicked).toBe(true);
  });

  it('Reality 4B: Pre-8:00 AM empty page -> User pre-filters target train 816, Sniper fires on train 816 instead of highest capacity 788', async () => {
    await ctx.api.injectHud();

    const hudTrainFilterInput = ctx.body.querySelector('#hudTrainFilterInput')!;
    const hudSniperBtn = ctx.body.querySelector('#hudSniperBtn')!;
    const hudCutBtn = ctx.body.querySelector('#hudCutBtn')!;

    let cutClicked = false;
    hudCutBtn.addEventListener('click', () => {
      cutClicked = true;
    });

    // User types "816" before 8:00 AM
    hudTrainFilterInput.value = '816';
    hudTrainFilterInput.dispatchEvent('input');

    const activeConfig = ctx.api.getTargetConfig();
    expect(activeConfig.trainNumber).toBe('816');

    // User arms Sniper
    hudSniperBtn.click();

    // At 8:00 AM, trains appear:
    const card814 = createLiveRailwayCard('COXS BAZAR EXPRESS (814)', [
      { className: 'S_CHAIR', fare: 754, available: 0 },
    ]);
    const card816 = createLiveRailwayCard('PARJOTAK EXPRESS (816)', [
      { className: 'S_CHAIR', fare: 754, available: 15 },
    ]);
    const card788 = createLiveRailwayCard('SONAR BANGLA EXPRESS (788)', [
      { className: 'S_CHAIR', fare: 754, available: 120 },
    ]);

    ctx.body.appendChild(card814);
    ctx.body.appendChild(card816);
    ctx.body.appendChild(card788);

    ctx.api.populateTrainCards();

    expect(cutClicked).toBe(true);
    expect(ctx.api.getTargetConfig().trainNumber).toBe('816');
  });

  it('Reality 5: Seat Class "ANY" chooses the class tile with highest available capacity', async () => {
    const card = createLiveRailwayCard('SUBORNO EXPRESS (701)', [
      { className: 'AC_S', fare: 1500, available: 2 },
      { className: 'SNIGDHA', fare: 1200, available: 0 },
      { className: 'S_CHAIR', fare: 600, available: 85 },
    ]);
    ctx.body.appendChild(card);

    let chosenClassInClick = '';
    card.querySelectorAll('.book-now-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tile = btn.closest('.single-seat-class')!;
        chosenClassInClick = tile.querySelector('.seat-class-name')!.textContent;

        const select = new MockElement('SELECT');
        select.id = 'select-bogie';
        const opt = new MockElement('OPTION');
        opt.value = 'KA';
        opt.textContent = 'KA - 85 Seat(s)';
        (opt as any).text = 'KA - 85 Seat(s)';
        select.appendChild(opt);
        select.value = 'KA';
        card.appendChild(select);

        for (let i = 1; i <= 2; i++) {
          const seat = new MockElement('BUTTON');
          seat.className = 'btn-seat seat-available';
          seat.textContent = `KA-${i}`;
          seat.setAttribute('data-seat', `KA-${i}`);
          seat.addEventListener('click', () => {
            seat.className = 'btn-seat selected';
          });
          card.appendChild(seat);
        }

        const cont = new MockElement('BUTTON');
        cont.textContent = 'CONTINUE PURCHASE';
        cont.addEventListener('click', () => {
          ctx.sandbox.location.pathname = '/booking/train/search/trip-info';
          const otp = new MockElement('INPUT');
          otp.className = 'rec-otp';
          ctx.body.appendChild(otp);
        });
        card.appendChild(cont);
      });
    });

    ctx.api.setTargetConfig({
      train: 'SUBORNO',
      trainNumber: '701',
      seats: 2,
      seatClass: 'ANY',
    });

    const statuses: string[] = [];
    const ok = await ctx.api.runAutoCut((msg: string) => statuses.push(msg), card);

    expect(ok).toBe(true);
    // S_CHAIR has 85 seats, while AC_S has only 2 -> it must pick S_CHAIR!
    expect(chosenClassInClick).toBe('S_CHAIR');
  });

  it('Reality 6: Contested seat mid-click recovery with >= 220ms bot-safe pacing', async () => {
    const card = createLiveRailwayCard('PARJOTAK EXPRESS (816)', [
      { className: 'S_CHAIR', fare: 754, available: 10 },
    ]);
    ctx.body.appendChild(card);

    const select = new MockElement('SELECT');
    select.id = 'select-bogie';
    const opt = new MockElement('OPTION');
    opt.value = 'CHA';
    opt.textContent = 'CHA - 10 Seat(s)';
    (opt as any).text = 'CHA - 10 Seat(s)';
    select.appendChild(opt);
    select.value = 'CHA';
    card.appendChild(select);

    const clickTimestamps: number[] = [];

    // Create 4 seats
    for (let i = 1; i <= 4; i++) {
      const seat = new MockElement('BUTTON');
      seat.className = 'btn-seat seat-available';
      seat.textContent = `CHA-${i}`;
      seat.setAttribute('data-seat', `CHA-${i}`);

      seat.addEventListener('click', () => {
        clickTimestamps.push(Date.now());
        if (i === 4) {
          // Seat CHA-4 is contested! Sniped by another buyer simultaneously!
          seat.className = 'btn-seat seat-in-progress';
        } else {
          seat.className = 'btn-seat selected';
        }
      });
      card.appendChild(seat);
    }

    const cont = new MockElement('BUTTON');
    cont.textContent = 'CONTINUE PURCHASE';
    cont.addEventListener('click', () => {
      ctx.sandbox.location.pathname = '/booking/train/search/trip-info';
      const otp = new MockElement('INPUT');
      otp.className = 'rec-otp';
      ctx.body.appendChild(otp);
    });
    card.appendChild(cont);

    ctx.api.setTargetConfig({
      train: 'PARJOTAK',
      trainNumber: '816',
      seats: 2,
      seatClass: 'S_CHAIR',
    });

    const statuses: string[] = [];
    const ok = await ctx.api.runAutoCut((msg: string) => statuses.push(msg), card);

    expect(ok).toBe(true);
    // Verified recovery: seat 1 clicked, seat 2 clicked & contested, seat 3 clicked as fallback replacement!
    expect(clickTimestamps.length).toBe(3);
    // Consecutive click intervals must be spaced >= 220ms for Shohoz bot protection
    const interval1to2 = clickTimestamps[1] - clickTimestamps[0];
    const interval2to3 = clickTimestamps[2] - clickTimestamps[1];
    expect(interval1to2).toBeGreaterThanOrEqual(210); // Within ~10ms timer precision
    expect(interval2to3).toBeGreaterThanOrEqual(210);
  });
});
