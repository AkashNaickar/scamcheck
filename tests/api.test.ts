import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { FakeJudge } from '../src/core/judge.js';
import { resetRateLimiter } from '../src/middleware/rateLimit.js';
import { createApp } from '../src/server.js';
import type { JevSignals } from '../src/types.js';

const MARKER = 'SCAMCHECK_PRIVACY_MARKER_9f3a';
const FEEDBACK_FILE = path.join(os.tmpdir(), 'scamcheck-test-feedback.jsonl');

const scamSignals: JevSignals = {
  isScam: 0.92,
  signals: {
    ASKS_PAYMENT: 0.9,
    ASKS_CREDENTIALS: 0.1,
    URGENCY_THREAT: 0.85,
    IMPERSONATION: 0.2,
    TOO_GOOD: 0.1,
    OFF_PLATFORM: 0.05,
    UNSOLICITED: 0.6,
    ASKS_CLICK: 0.4,
  },
  scamType: 'bank_phishing',
  scamTypeConfidence: 0.85,
  pressure: 1,
};

function buildApp(): Hono {
  const cfg = loadConfig({
    TYPESAFE_API_KEY: 'test-key',
    JEV_MODEL: 'jev-latest',
    PORT: '8787',
    MAX_INPUT_CHARS: '100',
    FREE_DAILY_LIMIT: '2',
    ALLOWED_ORIGINS: 'http://test.local',
    FEEDBACK_FILE,
  });
  return createApp(cfg, new FakeJudge(() => scamSignals));
}

async function post(app: Hono, pathname: string, body: unknown): Promise<Response> {
  return app.request(
    new Request(`http://localhost${pathname}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
  );
}

async function options(app: Hono, pathname: string, origin: string): Promise<Response> {
  return app.request(
    new Request(`http://localhost${pathname}`, {
      method: 'OPTIONS',
      headers: { origin, 'access-control-request-method': 'POST' },
    }),
  );
}

async function json(res: Response): Promise<any> {
  return res.json();
}

beforeEach(() => {
  resetRateLimiter();
  fs.rmSync(FEEDBACK_FILE, { force: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/check', () => {
  it('returns 200 with the full result shape for a scam', async () => {
    const app = buildApp();
    const res = await post(app, '/api/check', {
      text: `${MARKER} send money now`,
      channel: 'sms',
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(typeof body.requestId).toBe('string');
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.verdict).toBe('very_likely_scam');
    expect(body.riskScore).toBe(92);
    expect(body.scamType).toBe('bank_phishing');
    expect(body.confidence).toBe('high');
    expect(Array.isArray(body.reasons)).toBe(true);
    expect(body.reasons.map((r: any) => r.code)).toContain('ASKS_PAYMENT');
    expect(Array.isArray(body.advice)).toBe(true);
    expect(body.advice.length).toBeGreaterThanOrEqual(3);
    expect(body.links).toEqual([]);
    expect(body.degraded).toBe(false);
    expect(body.truncated).toBe(false);
    expect(body.modelVersion).toBe('fake-1.0.0');
  });

  it('rejects empty, whitespace-only and bad-channel bodies', async () => {
    const app = buildApp();

    const empty = await post(app, '/api/check', { text: '' });
    expect(empty.status).toBe(400);
    expect((await json(empty)).error.code).toBe('VALIDATION');

    const whitespace = await post(app, '/api/check', { text: '    ' });
    expect(whitespace.status).toBe(400);

    const badChannel = await post(app, '/api/check', { text: 'hello', channel: 'fax' });
    expect(badChannel.status).toBe(400);
  });

  it('rejects a body larger than 50 KB with 413', async () => {
    const app = buildApp();
    const res = await post(app, '/api/check', { text: 'a'.repeat(60 * 1024) });
    expect(res.status).toBe(413);
    expect((await json(res)).error.code).toBe('TOO_LARGE');
  });

  it('enforces the daily limit after successful checks', async () => {
    const app = buildApp();
    const first = await post(app, '/api/check', { text: 'one' });
    const second = await post(app, '/api/check', { text: 'two' });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const third = await post(app, '/api/check', { text: 'three' });
    expect(third.status).toBe(429);
    expect((await json(third)).error.code).toBe('RATE_LIMIT');
  });

  it('returns 503 when no judge is configured', async () => {
    const cfg = loadConfig({
      PORT: '8787',
      ALLOWED_ORIGINS: 'http://test.local',
      FEEDBACK_FILE,
    });
    const app = createApp(cfg, undefined);
    const res = await post(app, '/api/check', { text: 'hello' });
    expect(res.status).toBe(503);
    expect((await json(res)).error.code).toBe('UNAVAILABLE');
  });
});

describe('POST /api/feedback', () => {
  it('accepts feedback and writes metadata without message text', async () => {
    const app = buildApp();
    const checkRes = await post(app, '/api/check', {
      text: `${MARKER} urgent pay`,
      channel: 'sms',
    });
    const { requestId } = await json(checkRes);

    const fbRes = await post(app, '/api/feedback', { requestId, label: 'scam' });
    expect(fbRes.status).toBe(204);

    const raw = fs.readFileSync(FEEDBACK_FILE, 'utf8');
    const line = raw.trim().split('\n').pop() ?? '';
    const record = JSON.parse(line);
    expect(record.requestId).toBe(requestId);
    expect(record.label).toBe('scam');
    expect(record.verdict).toBe('very_likely_scam');
    expect(record.riskScore).toBe(92);
    expect(typeof record.ts).toBe('string');
    expect(raw).not.toContain(MARKER);
  });

  it('rejects an invalid feedback body', async () => {
    const app = buildApp();
    const res = await post(app, '/api/feedback', { requestId: 'not-a-uuid', label: 'scam' });
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe('VALIDATION');
  });
});

describe('privacy', () => {
  it('never puts the message text in the response or the logs', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const app = buildApp();

    const res = await post(app, '/api/check', {
      text: `${MARKER} please send money`,
      channel: 'sms',
    });
    expect(res.status).toBe(200);

    const body = JSON.stringify(await json(res));
    expect(body).not.toContain(MARKER);

    const logs = spy.mock.calls
      .map((call) => call.map((arg) => String(arg)).join(' '))
      .join('\n');
    expect(logs).not.toContain(MARKER);
  });
});

describe('CORS', () => {
  it('echoes allowed origins and blocks disallowed preflights', async () => {
    const app = buildApp();

    const allowed = await options(app, '/api/check', 'http://test.local');
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://test.local');

    const ext = await options(app, '/api/check', 'chrome-extension://abc');
    expect(ext.status).toBe(204);
    expect(ext.headers.get('access-control-allow-origin')).toBe('chrome-extension://abc');

    const evil = await options(app, '/api/check', 'http://evil.example');
    expect(evil.status).toBe(403);
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });
});
