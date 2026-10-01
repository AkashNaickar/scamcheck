import 'dotenv/config';
import { z } from 'zod';

export const THRESHOLDS = {
  band: { veryLikely: 0.85, likely: 0.6, suspicious: 0.3 },
  signalOn: 0.7, // a signal counts as "present" above this
  hardFlagMinCount: 3, // this many signals present → floor risk
  hardFlagFloor: 0.6,
  credsPlusImpersonationFloor: 0.75, // asks_credentials ≥ 0.8 AND impersonation ≥ signalOn
  urlHighFloor: 0.65,
  urlMediumFloor: 0.4,
  typeDisagreeMinConfidence: 0.7,
  typeDisagreePScamBelow: 0.35,
  lowConfidence: 0.5,
} as const;

export interface Config {
  apiKey?: string;
  jevModel: string;
  port: number;
  maxInputChars: number;
  freeDailyLimit: number;
  allowedOrigins: string[];
  feedbackFile: string;
}

const EnvSchema = z.object({
  TYPESAFE_API_KEY: z.string().min(1).optional(),
  JEV_MODEL: z.string().min(1).default('jev-latest'),
  PORT: z.coerce.number().int().positive().default(8787),
  MAX_INPUT_CHARS: z.coerce.number().int().positive().default(6000),
  FREE_DAILY_LIMIT: z.coerce.number().int().positive().default(10),
  ALLOWED_ORIGINS: z.string().min(1).default('http://localhost:8787'),
  FEEDBACK_FILE: z.string().min(1).default('data/feedback.jsonl'),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.parse(env);
  return {
    apiKey: parsed.TYPESAFE_API_KEY,
    jevModel: parsed.JEV_MODEL,
    port: parsed.PORT,
    maxInputChars: parsed.MAX_INPUT_CHARS,
    freeDailyLimit: parsed.FREE_DAILY_LIMIT,
    allowedOrigins: parsed.ALLOWED_ORIGINS.split(',').map((o) => o.trim()),
    feedbackFile: parsed.FEEDBACK_FILE,
  };
}

export const config: Config = loadConfig();
