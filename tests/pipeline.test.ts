import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../src/config.js';
import { FakeJudge } from '../src/core/judge.js';
import { runCheck } from '../src/core/pipeline.js';
import { ADVICE } from '../src/core/templates.js';
import type { JevSignals, JevState, SignalCode } from '../src/types.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BASE_SIGNALS: Record<SignalCode, number> = {
  ASKS_PAYMENT: 0.1,
  ASKS_CREDENTIALS: 0.1,
  URGENCY_THREAT: 0.1,
  IMPERSONATION: 0.1,
  TOO_GOOD: 0.1,
  OFF_PLATFORM: 0.1,
  UNSOLICITED: 0.1,
  ASKS_CLICK: 0.1,
};

function makeSignals(
  over: Partial<Omit<JevSignals, 'signals'>> & { signals?: Partial<Record<SignalCode, number>> } = {},
): JevSignals {
  const { signals, ...rest } = over;
  return {
    isScam: 0.5,
    signals: { ...BASE_SIGNALS, ...(signals ?? {}) },
    scamType: 'other_scam',
    scamTypeConfidence: 0.9,
    pressure: 0,
    ...rest,
  };
}

function makeCfg(over: Partial<Config> = {}): Config {
  return {
    jevModel: 'jev-latest',
    port: 8787,
    maxInputChars: 6000,
    freeDailyLimit: 10,
    allowedOrigins: [],
    feedbackFile: 'data/feedback.jsonl',
    ...over,
  };
}

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runCheck happy path', () => {
  it('returns a very_likely_scam result with the full response shape', async () => {
    const judge = new FakeJudge(() =>
      makeSignals({
        isScam: 0.95,
        scamType: 'delivery_fee',
        scamTypeConfidence: 0.95,
        pressure: 3,
        signals: {
          ASKS_PAYMENT: 0.9,
          URGENCY_THREAT: 0.85,
          IMPERSONATION: 0.8,
          ASKS_CLICK: 0.75,
        },
      }),
    );

    const res = await runCheck(
      { text: 'Your parcel is held. Pay a fee now.', channel: 'sms' },
      { judge, cfg: makeCfg() },
    );

    expect(res.verdict).toBe('very_likely_scam');
    expect(res.requestId).toMatch(UUID_RE);
    expect(typeof res.riskScore).toBe('number');
    expect(res.riskScore).toBeGreaterThanOrEqual(0);
    expect(res.riskScore).toBeLessThanOrEqual(100);
    expect(Array.isArray(res.reasons)).toBe(true);
    expect(res.reasons.length).toBeGreaterThan(0);
    for (const reason of res.reasons) {
      expect(typeof reason.code).toBe('string');
      expect(typeof reason.text).toBe('string');
    }
    expect(Array.isArray(res.advice)).toBe(true);
    expect(res.advice.length).toBeGreaterThan(0);
    expect(Array.isArray(res.links)).toBe(true);
    expect(res.degraded).toBe(false);
    expect(res.truncated).toBe(false);
    expect(res.modelVersion).toBe('fake-1.0.0');
  });

  it('returns no_obvious_red_flags and generic advice for a benign message', async () => {
    const judge = new FakeJudge(() =>
      makeSignals({ isScam: 0.05, scamType: 'not_a_scam', scamTypeConfidence: 0.95 }),
    );

    const res = await runCheck(
      { text: 'Hi, are we still on for lunch tomorrow?' },
      { judge, cfg: makeCfg() },
    );

    expect(res.verdict).toBe('no_obvious_red_flags');
    expect(res.advice).toEqual(ADVICE.not_a_scam);
    expect(res.reasons).toEqual([]);
    expect(res.confidence).toBe('high');
    expect(res.degraded).toBe(false);
  });
});

describe('truncation', () => {
  it('truncates before the judge sees it and flags truncated', async () => {
    let captured: JevState | undefined;
    const judge = new FakeJudge((state) => {
      captured = state;
      return makeSignals({ isScam: 0.05 });
    });

    const res = await runCheck(
      { text: 'a'.repeat(200) },
      { judge, cfg: makeCfg({ maxInputChars: 50 }) },
    );

    expect(res.truncated).toBe(true);
    expect(captured).toBeDefined();
    expect(captured!.message.length).toBeLessThanOrEqual(50);
    expect(captured!.message.length).toBe(50);
  });

  it('does not set truncated when the text fits', async () => {
    const judge = new FakeJudge(() => makeSignals({ isScam: 0.05 }));
    const res = await runCheck({ text: 'short' }, { judge, cfg: makeCfg() });
    expect(res.truncated).toBe(false);
  });
});

describe('exactly one judge call per check', () => {
  it('calls the judge once', async () => {
    const judge = new FakeJudge(() => makeSignals({ isScam: 0.5 }));
    await runCheck({ text: 'hello there' }, { judge, cfg: makeCfg() });
    expect(judge.callCount).toBe(1);
  });
});

describe('Jev state passed to the judge', () => {
  it('defaults the channel to "other" and passes redacted link facts', async () => {
    let captured: JevState | undefined;
    const judge = new FakeJudge((state) => {
      captured = state;
      return makeSignals({ isScam: 0.5 });
    });

    await runCheck(
      { text: 'Email a@b.com or use https://bit.ly/abc' },
      { judge, cfg: makeCfg() },
    );

    expect(captured!.channel).toBe('other');
    expect(captured!.link_facts).toEqual([{ host: 'bit.ly', flags: ['SHORTENER'] }]);
    expect(captured!.message).toContain('[EMAIL]');
    expect(captured!.message).not.toContain('a@b.com');
  });

  it('passes the explicit channel through', async () => {
    let captured: JevState | undefined;
    const judge = new FakeJudge((state) => {
      captured = state;
      return makeSignals({ isScam: 0.5 });
    });

    await runCheck({ text: 'hi', channel: 'whatsapp' }, { judge, cfg: makeCfg() });
    expect(captured!.channel).toBe('whatsapp');
  });
});

describe('degraded mode (SPEC 7.5)', () => {
  const throwingJudge = (): FakeJudge =>
    new FakeJudge(() => {
      throw new Error('judge unavailable');
    });

  it('uses suspicious/35 + DEGRADED_NO_AI when there are no URLs', async () => {
    const res = await runCheck(
      { text: 'Hello, just checking in about lunch.' },
      { judge: throwingJudge(), cfg: makeCfg() },
    );

    expect(res.degraded).toBe(true);
    expect(res.verdict).toBe('suspicious');
    expect(res.riskScore).toBe(35);
    expect(res.reasons.some((r) => r.code === 'DEGRADED_NO_AI')).toBe(true);
    expect(res.verdict).not.toBe('no_obvious_red_flags');
    expect(res.scamType).toBe('other_scam');
    expect(res.confidence).toBe('low');
    expect(res.modelVersion).toBe('none');
    expect(res.advice).toEqual(ADVICE.not_a_scam);
  });

  it('uses suspicious/45 for a medium-risk shortener URL', async () => {
    const res = await runCheck(
      { text: 'Pay here https://bit.ly/abc' },
      { judge: throwingJudge(), cfg: makeCfg() },
    );

    expect(res.degraded).toBe(true);
    expect(res.verdict).toBe('suspicious');
    expect(res.riskScore).toBe(45);
    expect(res.verdict).not.toBe('no_obvious_red_flags');
    expect(res.links.map((l) => l.host)).toEqual(['bit.ly']);
  });

  it('uses likely_scam/70 for a high-risk IP URL', async () => {
    const res = await runCheck(
      { text: 'Log in at http://192.0.2.10/login now' },
      { judge: throwingJudge(), cfg: makeCfg() },
    );

    expect(res.degraded).toBe(true);
    expect(res.verdict).toBe('likely_scam');
    expect(res.riskScore).toBe(70);
    expect(res.verdict).not.toBe('no_obvious_red_flags');
    expect(res.links.map((l) => l.host)).toEqual(['192.0.2.10']);
  });

  it('never returns no_obvious_red_flags in degraded mode', async () => {
    for (const text of ['plain text', 'https://bit.ly/abc', 'http://192.0.2.10/x']) {
      const res = await runCheck({ text }, { judge: throwingJudge(), cfg: makeCfg() });
      expect(res.degraded).toBe(true);
      expect(res.verdict).not.toBe('no_obvious_red_flags');
    }
  });
});

describe('log privacy (SPEC 9)', () => {
  it('does not log the message text', async () => {
    const marker = 'ZxQwUniqueMarker';
    const judge = new FakeJudge(() => makeSignals({ isScam: 0.9 }));

    const res = await runCheck(
      { text: `Please verify ${marker} at once.` },
      { judge, cfg: makeCfg() },
    );

    expect(logSpy).toHaveBeenCalled();
    const logged = logSpy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n');
    expect(logged.length).toBeGreaterThan(0);
    expect(logged).not.toContain(marker);

    const parsed = JSON.parse(logSpy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(parsed.requestId).toBe(res.requestId);
    expect(parsed).not.toHaveProperty('message');
    expect(parsed).not.toHaveProperty('text');
    expect(parsed).not.toHaveProperty('modelText');
  });
});
