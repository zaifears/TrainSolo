import { Page, Locator } from 'playwright';
import { JourneyConfig } from '../config/schema.js';
import { Logger } from '../logging/redactor.js';

export class TrainCard {
  private page: Page;
  private logger: Logger;

  constructor(page: Page, logger: Logger) {
    this.page = page;
    this.logger = logger;
  }

  /**
   * Finds the train matching one of the configured train names.
   */
  public async findTrainCard(journey: JourneyConfig): Promise<Locator> {
    for (const name of journey.trainNames) {
      // Look for train title using regex pattern
      const trainPattern = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const trainLoc = this.page.locator('.single-trip-wrapper, .trip-wrapper, .train-name')
        .filter({ hasText: trainPattern });

      if (await trainLoc.count() > 0) {
        this.logger.info(`Located train card matching '${name}'`);
        return trainLoc.first();
      }
    }

    // Fallback: look for general text containing the train name
    for (const name of journey.trainNames) {
      const generalLoc = this.page.getByText(new RegExp(name, 'i')).first();
      if (await generalLoc.isVisible().catch(() => false)) {
        this.logger.info(`Located train element by text matching '${name}'`);
        return generalLoc;
      }
    }

    throw new Error(`No matching train found on page for configured trains: [${journey.trainNames.join(', ')}]`);
  }

  /**
   * Expands the seat selection map for the chosen train and seat class.
   */
  public async selectClassAndOpenSeatMap(trainCard: Locator, journey: JourneyConfig): Promise<void> {
    for (const cls of journey.classes) {
      const classPattern = new RegExp(cls.replace(/_/g, '[\\s_-]?'), 'i');
      
      // Look for the specific seat class row containing class name and BOOK NOW button
      const classBlock = trainCard.locator('div, tr, li, .single-seat-class')
        .filter({ hasText: classPattern })
        .filter({ hasText: /BOOK NOW|AVAILABLE/i })
        .first();

      if (await classBlock.isVisible().catch(() => false)) {
        const bookNowBtn = classBlock.locator('button.book-now-btn, button:has-text("BOOK NOW")').first();
        if (await bookNowBtn.isVisible().catch(() => false)) {
          this.logger.info(`Clicking "BOOK NOW" button for seat class: ${cls}`);
          await bookNowBtn.click();
          await this.page.waitForTimeout(1500);
          return;
        }
      }
    }

    // Fallback: look for general BOOK NOW button in the train card
    const generalBookBtn = trainCard.locator('button.book-now-btn, button:has-text("BOOK NOW")').first();
    if (await generalBookBtn.isVisible().catch(() => false)) {
      this.logger.info('Clicking "BOOK NOW" button on train card...');
      await generalBookBtn.click();
      await this.page.waitForTimeout(1500);
      return;
    }

    this.logger.warn('Class button / Book Now button could not be uniquely identified by standard locator. Attempting generic click.');
  }
}
