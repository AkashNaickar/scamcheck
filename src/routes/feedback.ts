import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { Verdict } from '../types.js';

const MAX_BODY_BYTES = 50 * 1024;

const FeedbackSchema = z.object({
  requestId: z.string().uuid(),
  label: z.enum(['scam', 'not_scam', 'unsure']),
});

export interface FeedbackRouteDeps {
  cfg: Config;
  /** requestId -> check metadata. Never contains message text. */
  results: Map<string, { verdict: Verdict; riskScore: number }>;
}

/** POST /api/feedback. Appends one metadata-only JSONL line. */
export function feedbackRoute(deps: FeedbackRouteDeps): Hono {
  const app = new Hono();

  app.post('/api/feedback', async (c) => {
    const declared = Number(c.req.header('content-length') ?? '0');
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return c.json({ error: { code: 'TOO_LARGE', message: 'Request body is too large.' } }, 413);
    }

    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      payload = null;
    }

    const parsed = FeedbackSchema.safeParse(payload);
    if (!parsed.success) {
      return c.json({ error: { code: 'VALIDATION', message: 'Invalid feedback body.' } }, 400);
    }

    const { requestId, label } = parsed.data;
    const known = deps.results.get(requestId);
    const line = JSON.stringify({
      requestId,
      label,
      verdict: known?.verdict ?? null,
      riskScore: known?.riskScore ?? null,
      ts: new Date().toISOString(),
    });

    try {
      fs.mkdirSync(path.dirname(deps.cfg.feedbackFile), { recursive: true });
      fs.appendFileSync(deps.cfg.feedbackFile, `${line}\n`, 'utf8');
    } catch {
      return c.json({ error: { code: 'WRITE_FAILED', message: 'Could not save feedback.' } }, 500);
    }

    return c.body(null, 204);
  });

  return app;
}
