import { Page, Locator } from 'playwright';
import { Seat } from '../seats/seat.types.js';
import { RawDomSeatData, SeatParser } from '../seats/seatParser.js';
import { Logger } from '../logging/redactor.js';

export interface CoachOption {
  name: string;
  value: string;
  vacantSeats: number;
  isSelected: boolean;
}

export class SeatMap {
  private page: Page;
  private logger: Logger;

  constructor(page: Page, logger: Logger) {
    this.page = page;
    this.logger = logger;
  }

  /**
   * Waits for the interactive seat-map or coach container to become ready.
   */
  public async waitForSeatMapReady(): Promise<void> {
    this.logger.info('Waiting for seat map container or coach dropdown to become visible...');
    await this.page.waitForSelector('.seat-plan, .seat-layout, .all-seats, svg.seat-map, select.coach-select, select[name*="coach"], .coach-selection', {
      state: 'visible',
      timeout: 15000,
    }).catch(() => {
      this.logger.warn('Standard seat-map selector wait timed out; inspecting available seat elements directly.');
    });
  }

  /**
   * Inspects the coach dropdown and extracts all coach options with their vacant seat counts.
   * Matches live Bangladesh Railway format: e.g. "KA (0)", "KHA (12)", "CHA (4)".
   */
  public async getAvailableCoaches(): Promise<CoachOption[]> {
    return await this.page.evaluate(() => {
      const coaches: CoachOption[] = [];

      // 1. Check #select-bogie or standard <select> coach dropdown (excluding language switcher)
      const selectEl = document.querySelector<HTMLSelectElement>('#select-bogie, select.selectpicker, select.form-control, select:not(#lang-switch-dropdown)');
      if (selectEl && selectEl.options.length > 0) {
        for (let i = 0; i < selectEl.options.length; i++) {
          const opt = selectEl.options[i];
          const text = opt.text.trim();
          if (text.toLowerCase().includes('select coach')) continue;

          // Parse "GHA - 1 Seat(s)" OR "GHA (1)"
          const match = text.match(/([A-Z0-9_]+)\s*-\s*(\d+)\s*Seat/i) || text.match(/([A-Z0-9_]+)\s*\((\d+)\)/);
          const name = match ? match[1].toUpperCase() : text;
          const vacantSeats = match ? parseInt(match[2], 10) : 0;

          coaches.push({
            name,
            value: opt.value,
            vacantSeats,
            isSelected: opt.selected,
          });
        }
        return coaches;
      }

      // 2. Fallback: check custom tabs or buttons (e.g. .coach-item, .coach-tab)
      const tabEls = Array.from(document.querySelectorAll<HTMLElement>('.coach-tab, .coach-btn, .coach-pill, .coach-name'));
      for (const tab of tabEls) {
        const text = tab.innerText.trim();
        const match = text.match(/([A-Z_a-z]+)\s*\((\d+)\)/) || text.match(/([A-Z_a-z]+)/);
        if (match) {
          const countMatch = text.match(/\((\d+)\)/);
          coaches.push({
            name: match[1].toUpperCase(),
            value: tab.getAttribute('data-coach') || match[1],
            vacantSeats: countMatch ? parseInt(countMatch[1], 10) : 0,
            isSelected: tab.classList.contains('active') || tab.classList.contains('selected'),
          });
        }
      }

      return coaches;
    });
  }

  /**
   * Automatically switches to a coach that has vacant seats matching preferences.
   * Dispatches Angular-compliant events and verifies that the new coach layout renders.
   */
  public async selectBestCoachWithVacantSeats(preferredCoaches: string[], minSeatsRequired: number): Promise<string | null> {
    const coaches = await this.getAvailableCoaches();
    this.logger.info(`Detected ${coaches.length} coach option(s) in dropdown: ` +
      coaches.map(c => `${c.name} (${c.vacantSeats} vacant)`).join(', ')
    );

    if (coaches.length === 0) {
      this.logger.info('No coach dropdown found; single coach layout is active.');
      return null;
    }

    // 1. Check preferred coaches with enough seats
    let target = coaches.find(c => 
      preferredCoaches.some(p => p.toUpperCase() === c.name.toUpperCase()) && c.vacantSeats >= minSeatsRequired
    );

    // 2. Fallback: Any coach with enough seats
    if (!target) {
      target = coaches.find(c => c.vacantSeats >= minSeatsRequired);
    }

    // 3. Fallback: Any coach with at least 1 vacant seat
    if (!target) {
      target = coaches.find(c => c.vacantSeats > 0);
    }

    if (!target) {
      this.logger.warn('All coaches in dropdown currently indicate 0 vacant seats.');
      return null;
    }

    this.logger.info(`Selecting Coach ${target.name} (has ${target.vacantSeats} vacant seat(s))...`);

    // If already selected and seats are visible, verify
    if (target.isSelected) {
      this.logger.info(`Coach ${target.name} is already selected in dropdown.`);
    } else {
      // Switch dropdown using both Playwright selectOption and DOM bubbling dispatch
      const selectLoc = this.page.locator('#select-bogie, select.form-control').first();
      if (await selectLoc.isVisible().catch(() => false)) {
        await selectLoc.selectOption(target.value).catch(() => {});
        await this.page.evaluate((val) => {
          const el = document.querySelector<HTMLSelectElement>('#select-bogie');
          if (el) {
            el.value = val;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, target.value);
      } else {
        await this.page.locator(`text="${target.name}"`).first().click();
      }
    }

    // Wait for the coach layout loader to finish and seats for this coach to appear
    this.logger.info(`Waiting for Coach ${target.name} seat layout to load...`);
    await this.page.waitForSelector('.loader, .spinner, .loading, .is-loading', { state: 'detached', timeout: 5000 }).catch(() => {});
    await this.page.waitForFunction((coachName) => {
      const seats = Array.from(document.querySelectorAll('button.btn-seat'));
      return seats.some(s => s.textContent?.trim().startsWith(coachName + '-'));
    }, target.name, { timeout: 8000 }).catch(() => {});
    await this.page.waitForTimeout(800); // Allow DOM stabilization

    return target.name;
  }

  /**
   * Reads all current seat elements from the DOM and parses them into normalized Seat instances.
   */
  public async readStableSeatSnapshot(currentCoach?: string): Promise<Seat[]> {
    this.logger.info('Reading stable seat snapshot from DOM...');

    const rawSeats = await this.page.evaluate(() => {
      const elements = Array.from(
        document.querySelectorAll<HTMLElement | SVGElement>(
          'button.btn-seat, .seat, .single-seat, [data-seat], .seat-item, svg rect[id*="seat"], svg g[id*="seat"], .seat-name'
        )
      );

      const coachSelect = document.querySelector<HTMLSelectElement>('select.form-control, select.coach-select, select:not(#lang-switch-dropdown)');
      const rawText = coachSelect ? (coachSelect.options[coachSelect.selectedIndex]?.text || '') : (
        document.querySelector('.selected-coach, .coach-name, .active-coach')?.textContent?.trim() || ''
      );
      const activeCoachText = (rawText.match(/^[A-Z0-9_]+/i)?.[0] || rawText).toUpperCase();

      return elements.map((el, index): any => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';

        const label = el.getAttribute('data-seat') ||
                      el.getAttribute('id') ||
                      el.textContent?.trim() ||
                      '';

        const coachAttr = el.getAttribute('data-coach') || activeCoachText;
        const ariaLabel = el.getAttribute('aria-label') || '';
        const classList = Array.from(el.classList || []);
        const disabled = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
        const ariaDisabled = el.getAttribute('aria-disabled') === 'true';
        const isLegend = Boolean(el.closest('.legend, .seat-legend, .legend-item'));

        return {
          coach: coachAttr,
          label,
          ariaLabel,
          classList,
          disabled,
          ariaDisabled,
          selected: classList.includes('selected') || el.getAttribute('aria-selected') === 'true',
          visible: isVisible,
          width: rect.width,
          height: rect.height,
          isLegend,
          seatTypeAttr: el.getAttribute('data-seat-type'),
          locatorKey: `[data-seat="${label}"], #${el.id || `seat-${index}`}`,
        };
      });
    });

    return SeatParser.parseSeats(rawSeats, currentCoach);
  }

  /**
   * Clicks a specific seat element exactly once with live color/state verification.
   * Confirms whether the seat turned BLUE (selected) vs GREEN/RED (already clicked by another passenger).
   */
  public async clickSeatOnce(seat: Seat): Promise<{ success: boolean; isContested: boolean }> {
    this.logger.info(`Attempting single click on seat ${seat.coach}-${seat.label}...`);

    // Match exact seat identifier or exact seat text to avoid "1" matching "10" or "KA-1" matching "KHA-1"
    let locator = this.page.locator(`button.btn-seat[data-seat="${seat.coach}-${seat.label}" i], button[data-seat="${seat.coach}-${seat.label}" i]`).first();
    if (!(await locator.isVisible().catch(() => false))) {
      locator = this.page.locator(`button.btn-seat[data-seat="${seat.label}" i], button[data-seat="${seat.label}" i]`).first();
    }
    if (!(await locator.isVisible().catch(() => false))) {
      locator = this.page.locator('button.btn-seat, button')
        .filter({ hasText: new RegExp(`^\\s*(?:${seat.coach}\\s*[-:]\\s*)?${seat.label}\\s*$`, 'i') })
        .first();
    }
    if (!(await locator.isVisible().catch(() => false))) {
      locator = this.page.getByText(new RegExp(`^\\s*${seat.label}\\s*$`, 'i')).first();
    }

    await locator.waitFor({ state: 'visible', timeout: 5000 });
    const isEnabled = await locator.isEnabled().catch(() => true);
    if (!isEnabled) {
      throw new Error(`Safety Stop: Seat ${seat.coach}-${seat.label} is disabled!`);
    }

    // Click without forcing
    await locator.click({ timeout: 5000, force: false });
    this.logger.info(`Click registered. Verifying resulting state...`);

    // Settle network/state (Shohoz locks seat via websocket or HTTP call)
    await this.page.waitForTimeout(600);

    // Inspect live state of the clicked seat
    const stateCheck = await locator.evaluate((el: HTMLElement) => {
      const classes = Array.from(el.classList || []);
      const ariaSelected = el.getAttribute('aria-selected') === 'true';
      const isSelected = classes.includes('selected') || classes.includes('seat-selected') || ariaSelected;
      
      // Green / in-progress or booked indicator: clicked by another user
      const isBooked = classes.includes('booked') || 
                       classes.includes('occupied') || 
                       classes.includes('seat-booked') || 
                       classes.includes('seat-in-progress') ||
                       classes.includes('disabled');

      // Check for error toast on page
      const toastText = document.querySelector('.toast, .alert, .swal2-html-container, .toast-error')?.textContent || '';
      const isErrorToast = /already booked|unavailable|taken|selected by another/i.test(toastText);

      return {
        isSelected,
        isBooked,
        isErrorToast,
        classes,
      };
    }).catch(() => ({ isSelected: false, isBooked: true, isErrorToast: false, classes: [] }));

    if (stateCheck.isSelected && !stateCheck.isErrorToast) {
      this.logger.info(`🟦 Seat ${seat.coach}-${seat.label} confirmed BLUE (Successfully booked/selected by you!)`);
      return { success: true, isContested: false };
    }

    if (stateCheck.isBooked || stateCheck.isErrorToast) {
      this.logger.warn(`🟩 Seat ${seat.coach}-${seat.label} turned GREEN/OCCUPIED (Another passenger clicked it first).`);
      return { success: false, isContested: true };
    }

    // Default fallback verification
    return { success: stateCheck.isSelected, isContested: false };
  }

  /**
   * Reads labels of currently selected seats directly from the seat map DOM.
   */
  public async readSelectedSeatMapLabels(): Promise<string[]> {
    return await this.page.evaluate(() => {
      const selectedEls = Array.from(
        document.querySelectorAll('.seat.selected, .selected-seat, .seat-selected, button.selected, button.seat-selected, [aria-selected="true"], rect.selected')
      );
      return selectedEls.map(el => (el.getAttribute('data-seat') || el.textContent || '').trim()).filter(Boolean);
    });
  }

  /**
   * Reads labels of seats listed in the "Seat Details" or booking summary panel.
   */
  public async readSeatDetailsPanelLabels(): Promise<string[]> {
    return await this.page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.seat-details, .selected-seats-list, .seat-number-list, .fare-details-seat'));
      return rows.map(r => r.textContent?.trim() || '').filter(Boolean);
    });
  }
}
