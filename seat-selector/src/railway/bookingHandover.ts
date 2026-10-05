import { Page } from 'playwright';
import { Logger } from '../logging/redactor.js';

export interface HandoverStatus {
  reachedOtp: boolean;
  currentUrl: string;
  otpInputFound: boolean;
  holdTimerText?: string;
  errorMessage?: string;
}

export class BookingHandover {
  private page: Page;
  private logger: Logger;

  constructor(page: Page, logger: Logger) {
    this.page = page;
    this.logger = logger;
  }

  /**
   * Clicks 'CONTINUE PURCHASE' after successful seat selection and advances
   * until the OTP modal appears on screen, then halts immediately for human input.
   */
  public async proceedToOtpScreen(): Promise<HandoverStatus> {
    this.logger.info('Proceeding from seat selection to passenger & OTP screen...');

    // 1. Locate and click "CONTINUE PURCHASE"
    const continueBtn = this.page.locator('button.continue-btn, button:has-text("CONTINUE PURCHASE")').first();
    const isVisible = await continueBtn.isVisible().catch(() => false);
    if (!isVisible) {
      throw new Error('Continue Purchase button is not visible on page.');
    }

    this.logger.info('Clicking "CONTINUE PURCHASE" button...');
    await continueBtn.click();

    // 2. Wait for navigation to /booking/train/trip-info or passenger details screen
    this.logger.info('Waiting for trip-info / passenger details page to load...');
    await this.page.waitForURL(/.*(trip-info|passenger|booking).*/i, { timeout: 15000 }).catch(() => {
      this.logger.warn('URL change wait timed out; checking if page content updated in-place.');
    });

    await this.page.waitForTimeout(1000);

    // 3. Check if there is an intermediate "PROCEED" or "CONFIRM" button to trigger OTP
    const confirmBtn = this.page.locator('button:has-text("CONFIRM"), button:has-text("PROCEED"), button:has-text("PAY NOW"), button.btn-confirm').first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      this.logger.info('Located passenger confirmation button. Clicking to trigger OTP modal...');
      await confirmBtn.click();
      await this.page.waitForTimeout(1000);
    }

    // 4. Wait for OTP dialog / input field
    this.logger.info('Waiting for OTP verification prompt...');
    const otpInput = this.page.locator('input.rec-otp, input[placeholder*="OTP"], input.otp-input, input[name*="otp"]').first();
    const otpReached = await otpInput.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);

    const currentUrl = this.page.url();
    const timerText = await this.page.evaluate(() => {
      const timerEl = document.querySelector('.timer, .countdown, .otp-timer, .hold-timer');
      return timerEl?.textContent?.trim() || undefined;
    }).catch(() => undefined);

    if (otpReached) {
      this.logger.info(`🎯 OTP SCREEN REACHED! Hold timer: ${timerText || 'Active (approx 4-5 mins)'}`);
      // Sound audible terminal bell
      process.stdout.write('\x07\x07\x07');
      return {
        reachedOtp: true,
        currentUrl,
        otpInputFound: true,
        holdTimerText: timerText,
      };
    }

    // Check if error message appeared (e.g. rate limit, session expired)
    const errorText = await this.page.evaluate(() => {
      const errEl = document.querySelector('.toast-error, .alert-danger, .error-msg, .swal2-html-container');
      return errEl?.textContent?.trim() || undefined;
    }).catch(() => undefined);

    return {
      reachedOtp: false,
      currentUrl,
      otpInputFound: false,
      errorMessage: errorText,
    };
  }
}
