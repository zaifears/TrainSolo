import { Seat } from '../seats/seat.types.js';

export class Notifier {
  /**
   * Alert the user audibly and visually in the terminal when automation reaches manual handoff point.
   */
  public static alertUser(selectedSeats: Seat[], trainName: string, className: string): void {
    // Ring terminal bell (ASCII 7)
    process.stdout.write('\x07\x07\x07');

    console.log('\n' + '='.repeat(65));
    console.log('🚨 ACTION REQUIRED: SEATS SUCCESSFULLY SELECTED IN YOUR BROWSER! 🚨');
    console.log('='.repeat(65));
    console.log(`🚂 Train: ${trainName}`);
    console.log(`🎫 Class: ${className}`);
    console.log(`💺 Seats Selected (${selectedSeats.length}): ${selectedSeats.map(s => s.label.startsWith(s.coach) ? s.label : `${s.coach}-${s.label}`).join(', ')}`);
    console.log('-'.repeat(65));
    console.log('👉 Complete passenger verification, CAPTCHA, and payment manually now.');
    console.log('🛑 Automation is halting immediately as designed.');
    console.log('='.repeat(65) + '\n');
  }

  public static alertDryRun(candidates: Seat[], strategy: string): void {
    console.log('\n' + '='.repeat(65));
    console.log('🧪 DRY RUN REPORT: OPTIMAL SEATS IDENTIFIED (NO CLICKS PERFORMED)');
    console.log('='.repeat(65));
    console.log(`🎯 Strategy Selected: ${strategy}`);
    console.log(`💺 Candidate Seats (${candidates.length}): ${candidates.map(s => s.label.startsWith(s.coach) ? s.label : `${s.coach}-${s.label}`).join(', ')}`);
    console.log('='.repeat(65) + '\n');
  }
}
