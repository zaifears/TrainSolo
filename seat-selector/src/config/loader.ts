import fs from 'fs';
import path from 'path';
import { AppConfig, AppConfigSchema } from './schema.js';

export function loadConfig(customPath?: string): AppConfig {
  const resolvedPath = customPath 
    ? path.resolve(process.cwd(), customPath)
    : path.resolve(process.cwd(), 'config.json');

  if (!fs.existsSync(resolvedPath)) {
    const examplePath = path.resolve(process.cwd(), 'config.example.json');
    if (fs.existsSync(examplePath)) {
      console.warn(`[Config] config.json not found at ${resolvedPath}. Loading default config.example.json.`);
      const raw = fs.readFileSync(examplePath, 'utf-8');
      return AppConfigSchema.parse(JSON.parse(raw));
    }
    throw new Error(`Configuration file not found at ${resolvedPath} and no config.example.json fallback available.`);
  }

  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  const parsed = JSON.parse(raw);
  return AppConfigSchema.parse(parsed);
}
