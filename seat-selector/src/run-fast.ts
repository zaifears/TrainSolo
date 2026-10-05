import { FastRunner } from './runners/fastRunner.js';
import { loadConfig } from './config/loader.js';
import { AppConfigSchema } from './config/schema.js';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const isLive = process.argv.includes('--live');
  const isDryRun = process.argv.includes('--dry-run');
  const baseConfig = loadConfig();
  const dryRun = isLive ? false : (isDryRun ? true : baseConfig.safety.dryRun);

  const config = AppConfigSchema.parse({
    ...baseConfig,
    safety: { ...baseConfig.safety, dryRun },
  });

  const runner = new FastRunner(config, {
    watch: process.argv.includes('--watch'),
    reloadIntervalSec: Number(flag('--interval') ?? 30),
  });
  await runner.run();
}

main().catch((err) => {
  console.error('\n❌ FastRunner Error:');
  console.error(err?.message || err);
  process.exit(1);
});
