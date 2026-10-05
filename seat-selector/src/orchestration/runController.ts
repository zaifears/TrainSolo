import path from 'path';
import { AppConfig } from '../config/schema.js';
import { Logger } from '../logging/redactor.js';
import { CdpConnector } from '../browser/cdpConnector.js';
import { PageResolver } from '../browser/pageResolver.js';
import { SessionGuard } from '../browser/sessionGuard.js';
import { SearchPage } from '../railway/searchPage.js';
import { JourneyVerifier } from '../railway/journeyVerifier.js';
import { TrainCard } from '../railway/trainCard.js';
import { SeatMap } from '../railway/seatMap.js';
import { SeatRanker } from '../seats/seatRanker.js';
import { SelectionVerifier } from '../seats/selectionVerifier.js';
import { BookingHandover } from '../railway/bookingHandover.js';
import { Notifier } from '../notifications/notifier.js';
import { StateMachine } from './stateMachine.js';

export class RunController {
  private config: AppConfig;
  private logger: Logger;
  private sm: StateMachine;

  constructor(config: AppConfig) {
    this.config = config;
    this.logger = new Logger(config.logging);
    this.sm = new StateMachine();
  }

  public async execute(): Promise<void> {
    const connector = new CdpConnector(this.config.cdpEndpoint, this.logger);
    let browser;
    let page;

    try {
      // 1. ATTACHING
      this.sm.transition('ATTACHING');
      browser = await connector.connect();

      // 2. Resolve Page
      const resolver = new PageResolver(browser, this.config.railwayHost, this.logger);
      page = await resolver.resolveRailwayPage();

      // 3. SESSION_VALIDATION
      this.sm.transition('SESSION_VALIDATION');
      const sessionGuard = new SessionGuard(page, this.logger);
      const isChallenge = await sessionGuard.checkForBotChallenge();
      if (isChallenge) {
        this.sm.transition('SAFETY_STOP');
        throw new Error('Bot challenge / CAPTCHA is present on screen. Please solve it manually in browser.');
      }
      await sessionGuard.assertAuthenticated();

      // 4. JOURNEY_OPEN
      this.sm.transition('JOURNEY_OPEN');
      const searchPage = new SearchPage(page, this.logger);
      await searchPage.navigateToJourney(this.config.journey);
      await searchPage.waitForResults();

      // 5. JOURNEY_VERIFIED
      this.sm.transition('JOURNEY_VERIFIED');
      const journeyVerifier = new JourneyVerifier(page, this.logger);
      await journeyVerifier.verifyJourneyContext(this.config.journey);

      // 6. Locate Train & Expand Seat Map
      const trainCard = new TrainCard(page, this.logger);
      const cardLoc = await trainCard.findTrainCard(this.config.journey);
      await trainCard.selectClassAndOpenSeatMap(cardLoc, this.config.journey);

      // 7. SEAT_MAP_READY & COACH SELECTION
      this.sm.transition('SEAT_MAP_READY');
      const seatMap = new SeatMap(page, this.logger);
      await seatMap.waitForSeatMapReady();

      // Automatically inspect coach dropdown and switch to a coach with vacant seats
      const activeCoach = await seatMap.selectBestCoachWithVacantSeats(
        this.config.preferences.preferredCoaches,
        this.config.journey.seatCount
      );

      // 8. SEATS_PARSED
      this.sm.transition('SEATS_PARSED');
      const seats = await seatMap.readStableSeatSnapshot(activeCoach || undefined);
      this.logger.info(`Total parsed seats from layout: ${seats.length} (Available: ${seats.filter(s => s.available).length})`);

      if (seats.length === 0) {
        this.sm.transition('DOM_UNRECOGNIZED');
        throw new Error('No seats could be parsed from the DOM. Seat map may have an updated layout or no vacant seats.');
      }

      // 9. CANDIDATE_SELECTED
      this.sm.transition('CANDIDATE_SELECTED');
      const bestCandidate = SeatRanker.rankAndSelect(seats, this.config);
      if (!bestCandidate) {
        this.sm.transition('NO_ACCEPTABLE_SEATS');
        throw new Error(`No seat combination matched your preferences for ${this.config.journey.seatCount} seat(s).`);
      }

      this.logger.info(
        `Selected optimal candidate via strategy [${bestCandidate.strategy}]: ` +
        bestCandidate.seats.map(s => `${s.coach}-${s.label}`).join(', ')
      );

      // DRY RUN CHECK
      if (this.config.safety.dryRun) {
        Notifier.alertDryRun(bestCandidate.seats, bestCandidate.strategy);
        this.logger.info('Dry run completed successfully. No browser clicks were performed.');
        return;
      }

      // 10. REVALIDATING & CLICKING (With strict attempt budgeting for anti-abuse protection)
      let attemptCount = 0;
      const maxAttempts = Math.min(this.config.safety.maximumSeatClickAttempts, 2); // Hard ceiling at 2 to avoid 1-hr ban

      for (const seat of bestCandidate.seats) {
        attemptCount++;
        if (attemptCount > maxAttempts) {
          this.sm.transition('SAFETY_STOP');
          throw new Error(
            `Anti-Abuse Safety Stop: Reached ${maxAttempts} seat click attempts.\n` +
            `Halting to prevent Bangladesh Railway's 1-hour account lockout (triggered at 3 attempts in 15 mins).`
          );
        }

        this.sm.transition('REVALIDATING');
        await journeyVerifier.verifyJourneyContext(this.config.journey);

        this.sm.transition('CLICKING');
        const clickResult = await seatMap.clickSeatOnce(seat);

        if (!clickResult.success) {
          if (clickResult.isContested) {
            this.sm.transition('STALE_SEAT_STATE');
            throw new Error(
              `Contested Seat: Seat ${seat.coach}-${seat.label} was clicked by another passenger and turned GREEN/BOOKED.\n` +
              `Attempt count: ${attemptCount}/${maxAttempts}. Stopping to protect account from 1-hour lockout.`
            );
          }
          throw new Error(`Click failed on seat ${seat.coach}-${seat.label}.`);
        }
      }

      // 11. SELECTION_VERIFIED
      this.sm.transition('SELECTION_VERIFIED');
      const mapSelectedLabels = await seatMap.readSelectedSeatMapLabels();
      const detailsLabels = await seatMap.readSeatDetailsPanelLabels();

      const verification = SelectionVerifier.verify(
        bestCandidate.seats,
        mapSelectedLabels,
        detailsLabels,
        this.config.journey.seatCount
      );

      if (!verification.success) {
        this.sm.transition('SELECTION_MISMATCH');
        throw new Error(`Selection verification failed:\n${verification.mismatches.join('\n')}`);
      }

      // 12. ADVANCE TO OTP MODAL (HANDOVER BOUNDARY)
      const handover = new BookingHandover(page, this.logger);
      const handoverResult = await handover.proceedToOtpScreen();

      // 13. USER_ALERTED
      this.sm.transition('USER_ALERTED');
      Notifier.alertUser(
        bestCandidate.seats,
        this.config.journey.trainNames[0],
        this.config.journey.classes[0]
      );

      // 14. MANUAL_HANDOFF
      this.sm.transition('MANUAL_HANDOFF');
      if (handoverResult.reachedOtp) {
        this.logger.info(`🎉 Successfully pushed till the OTP verification screen!`);
        this.logger.info(`⏱️  Hold timer active: ${handoverResult.holdTimerText || 'approx 4-5 minutes'}`);
        this.logger.info(`👉 Complete the booking by entering your SMS OTP in Brave!`);
      } else {
        this.logger.warn(`Seat primarily selected in cart. Current page: ${handoverResult.currentUrl}`);
        this.logger.info(`👉 Please complete passenger confirmation and OTP in Brave.`);
      }

    } catch (err: any) {
      this.logger.error(`Execution halted: ${err.message}`);

      if (this.config.logging.screenshotsOnFailure && page) {
        try {
          const screenshotPath = path.resolve(
            process.cwd(),
            'artifacts',
            `failure-${Date.now()}.png`
          );
          await page.screenshot({ path: screenshotPath, fullPage: true });
          this.logger.info(`Diagnostic failure screenshot saved to: ${screenshotPath}`);
        } catch (screenshotErr: any) {
          this.logger.warn(`Could not capture failure screenshot: ${screenshotErr.message}`);
        }
      }

      throw err;
    }
  }
}
