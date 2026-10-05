import { Page } from 'playwright';
import { Logger } from '../logging/redactor.js';

export class SessionGuard {
  private page: Page;
  private logger: Logger;

  constructor(page: Page, logger: Logger) {
    this.page = page;
    this.logger = logger;
  }

  /**
   * Asserts whether the current railway session is authenticated.
   * Checks for login indicators or presence of valid token in localStorage.
   */
  public async assertAuthenticated(): Promise<boolean> {
    this.logger.info('Checking railway session authentication state...');

    // 1. Inspect localStorage on page
    const hasToken = await this.page.evaluate(() => {
      try {
        const token = localStorage.getItem('token');
        const ssdk = localStorage.getItem('ssdk');
        return Boolean(token && token.length > 10 && ssdk);
      } catch {
        return false;
      }
    });

    if (hasToken) {
      this.logger.info('Railway session authenticated via valid localStorage token & ssdk.');
      return true;
    }

    // 2. Fallback: inspect page DOM for sign in button vs logout button
    const isLoginPromptVisible = await this.page.locator('text=/login|sign in/i').first().isVisible({ timeout: 1500 }).catch(() => false);
    const isLogoutVisible = await this.page.locator('text=/logout|sign out|profile|dashboard/i').first().isVisible({ timeout: 1500 }).catch(() => false);

    if (isLogoutVisible && !isLoginPromptVisible) {
      this.logger.info('Railway session authenticated via visible user navigation items.');
      return true;
    }

    this.logger.warn('Session is NOT authenticated. User must log in manually to eticket.railway.gov.bd first.');
    throw new Error(
      'Session Expired or Unauthenticated: Please log into https://eticket.railway.gov.bd in your browser, complete CAPTCHA/OTP manually, and run the selector again.'
    );
  }

  /**
   * Checks if the user is currently at the live OTP phone verification prompt.
   * Matches live production DOM: input.rec-otp, "Verify Your Phone Number", "Resend OTP", "Verify".
   */
  public async isAtOtpVerification(): Promise<boolean> {
    const hasOtpInputs = await this.page.locator('input.rec-otp, input[placeholder="*"]').count();
    const hasOtpText = await this.page.locator('text=/Verify Your Phone Number|Enter Your OTP Code/i').count();
    
    if (hasOtpInputs >= 4 || hasOtpText > 0) {
      this.logger.info('Live OTP Phone Verification Screen detected (4-digit code required).');
      return true;
    }
    return false;
  }

  /**
   * Checks if CAPTCHA or Cloudflare/Bot challenge is currently blocking the DOM.
   */
  public async checkForBotChallenge(): Promise<boolean> {
    const hasChallenge = await this.page.locator('iframe[src*="captcha"], iframe[src*="turnstile"], #cf-challenge-running, .g-recaptcha').count();
    if (hasChallenge > 0) {
      this.logger.warn('Bot verification / CAPTCHA challenge detected on screen!');
      return true;
    }
    return false;
  }
}
