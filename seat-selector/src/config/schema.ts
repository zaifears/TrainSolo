import { z } from 'zod';

export const JourneyConfigSchema = z.object({
  from: z.string().min(1, 'Origin station is required'),
  to: z.string().min(1, 'Destination station is required'),
  date: z.string().min(1, 'Journey date is required'), // e.g. "25-Sep-2026" or "2026-09-25"
  trainNames: z.array(z.string()).min(1, 'At least one train name is required'),
  classes: z.array(z.string()).min(1, 'At least one seat class is required'),
  seatCount: z.number().int().positive().max(4, 'Maximum 4 seats allowed per booking'),
});

export const SeatPreferencesSchema = z.object({
  exactSeats: z.array(z.string()).default([]),
  preferredCoaches: z.array(z.string()).default([]),
  preferWindow: z.boolean().default(false),
  requireAdjacent: z.boolean().default(true),
  allowSameRowFallback: z.boolean().default(true),
  allowSameCoachFallback: z.boolean().default(true),
  allowSeparateFallback: z.boolean().default(false),
});

export const SafetyConfigSchema = z.object({
  dryRun: z.boolean().default(true),
  maximumSeatClickAttempts: z.number().int().positive().default(2),
  allowContinuePurchase: z.boolean().default(false), // Opt-in: click CONTINUE PURCHASE, then stop at the OTP screen
  stopOnSessionExpiry: z.boolean().default(true),
  stopOnJourneyMismatch: z.boolean().default(true),
});

export const LoggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  redactTokens: z.boolean().default(true),
  screenshotsOnFailure: z.boolean().default(true),
  retainDays: z.number().int().positive().default(3),
});

export const AppConfigSchema = z.object({
  cdpEndpoint: z.string().url().default('http://127.0.0.1:9222'),
  railwayHost: z.string().default('eticket.railway.gov.bd'),
  journey: JourneyConfigSchema,
  preferences: SeatPreferencesSchema,
  safety: SafetyConfigSchema,
  logging: LoggingConfigSchema,
});

export type JourneyConfig = z.infer<typeof JourneyConfigSchema>;
export type SeatPreferences = z.infer<typeof SeatPreferencesSchema>;
export type SafetyConfig = z.infer<typeof SafetyConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
