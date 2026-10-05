import { loadConfig } from './config/loader.js';
import { RunController } from './orchestration/runController.js';

async function main() {
  console.log('='.repeat(65));
  console.log('🚆 Personal Bangladesh Railway Availability & Seat Selector');
  console.log('='.repeat(65));

  const args = process.argv.slice(2);
  let configPath: string | undefined;
  let forceDryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) {
      configPath = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      forceDryRun = true;
    }
  }

  try {
    const config = loadConfig(configPath);
    if (forceDryRun) {
      config.safety.dryRun = true;
    }

    console.log(`Configuration loaded successfully.`);
    console.log(`Target Route: ${config.journey.from} ➔ ${config.journey.to}`);
    console.log(`Date: ${config.journey.date} | Train(s): ${config.journey.trainNames.join(', ')}`);
    console.log(`Seats requested: ${config.journey.seatCount} | Mode: ${config.safety.dryRun ? 'DRY-RUN (Safe)' : 'LIVE SEAT SELECTION'}`);
    console.log('-'.repeat(65));

    const controller = new RunController(config);
    await controller.execute();
  } catch (error: any) {
    console.error(`\n❌ Execution stopped: ${error.message}\n`);
    process.exit(1);
  }
}

main();
