import fs from 'fs';
import path from 'path';
import { AppConfig, AppConfigSchema } from './schema.js';

export function loadConfig(customPath?: string): AppConfig {
  const resolvedPath = customPath 
    ? path.resolve(process.cwd(), customPath)
    : path.resolve(process.cwd(), 'config.json');

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Configuration file not found at ${resolvedPath}.\n` +
      `Please copy and customize 'config.example.json' into 'config.json' with your actual journey details before running.`
    );
  }

  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  const parsed = JSON.parse(raw);
  return AppConfigSchema.parse(parsed);
}
