import { Hono } from 'hono';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { Judge } from '../core/judge.js';
import { runCheck } from '../core/pipeline.js';
import type { Channel, CheckResult } from '../types.js';

const MAX_BODY_BYTES = 50 * 1024;
const CHANNELS = ['sms', 'email', 'whatsapp', 'social', 'marketplace', 'other'] as const;

const TOO_LARGE = { error: { code: 'TOO_LARGE', message: 'Request body is too large.' } };
const INVALID = { error: { code: 'VALIDATION', message: 'Invalid request body.' } };

export interface CheckRouteDeps {
  judge?: Judge;
  cfg: Config;
  /** Optional sink so the server can remember feedback metadata. */
  onResult?: (result: CheckResult) => void;
}

/** POST /api/check. Pure wiring; all decision logic lives in the pipeline. */
export function checkRoute(deps: CheckRouteDeps): Hono {
  const { judge, cfg } = deps;

  const BodySchema = z.object({
    text: z.string().trim().min(1).max(cfg.maxInputChars * 2),
    channel: z.enum(CHANNELS).optional().default('other'),
  });

  const app = new Hono();

  app.post('/api/check', async (c) => {
    if (!judge) {
      return c.json(
        {
          error: {
            code: 'UNAVAILABLE',
            message: 'Jev API key is missing or the checker is unavailable.',
          },
        },
        503,
      );
    }

    const declared = Number(c.req.header('content-length') ?? '0');
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return c.json(TOO_LARGE, 413);
    }

    const raw = await c.req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return c.json(TOO_LARGE, 413);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return c.json(INVALID, 400);
    }

    const parsed = BodySchema.safeParse(payload);
    if (!parsed.success) {
      return c.json(INVALID, 400);
    }

    const input: { text: string; channel: Channel } = {
      text: parsed.data.text,
      channel: parsed.data.channel,
    };

    const result = await runCheck(input, { judge, cfg });
    deps.onResult?.(result);
    return c.json(result, 200);
  });

  return app;
}
