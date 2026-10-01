import { describe, expect, it } from 'vitest';
import { computeVerdict } from '../src/core/verdict.js';
import type { JevSignals, ScamType, SignalCode, UrlFinding, UrlRisk, Verdict } from '../src/types.js';

const SIGNAL_CODES: SignalCode[] = [
  'ASKS_PAYMENT',
  'ASKS_CREDENTIALS',
  'URGENCY_THREAT',
  'IMPERSONATION',
  'TOO_GOOD',
  'OFF_PLATFORM',
  'UNSOLICITED',
  'ASKS_CLICK',
];

function signalMap(over: Partial<Record<SignalCode, number>> = {}): Record<SignalCode, number> {
  const base = Object.fromEntries(SIGNAL_CODES.map((c) => [c, 0])) as Record<SignalCode, number>;
  return { ...base, ...over };
}

function makeJev(
  over: Partial<Omit<JevSignals, 'signals'>> & { signals?: Partial<Record<SignalCode, number>> } = {}
): JevSignals {
  const { signals: sigOver, ...rest } = over;
  return {
    isScam: 0.2,
    scamType: 'not_a_scam' as ScamType,
    scamTypeConfidence: 0.8,
    pressure: 0,
    ...rest,
    signals: signalMap(sigOver),
  };
}

function urlFinding(risk: UrlRisk): UrlFinding {
  return { url: 'https://example.com', host: 'example.com', risk, flags: [] };
}

describe('computeVerdict: hard invariant', () => {
  it('never lowers risk below jev.isScam across a grid', () => {
    const pscams = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1];
    const risks: UrlRisk[] = ['none', 'medium', 'high'];
    const variants: Partial<Record<SignalCode, number>>[] = [
      {},
      { ASKS_PAYMENT: 0.9, URGENCY_THREAT: 0.85, ASKS_CLICK: 0.8 },
      { ASKS_CREDENTIALS: 0.9, IMPERSONATION: 0.9 },
      { TOO_GOOD: 0.99, OFF_PLATFORM: 0.95, UNSOLICITED: 0.9, ASKS_CLICK: 0.88, ASKS_PAYMENT: 0.8 },
    ];
    let checked = 0;
    for (const isScam of pscams) {
      for (const sig of variants) {
        for (const risk of risks) {
          for (const withUrl of [false, true]) {
            const result = computeVerdict(
              makeJev({ isScam, signals: sig }),
              withUrl ? [urlFinding(risk)] : []
            );
            expect(result.risk).toBeGreaterThanOrEqual(isScam - 1e-9);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBe(pscams.length * variants.length * risks.length * 2);
  });
});

describe('computeVerdict: verdict bands (inclusive boundaries)', () => {
  const cases: [number, Verdict][] = [
    [0.2999, 'no_obvious_red_flags'],
    [0.3, 'suspicious'],
    [0.5999, 'suspicious'],
    [0.6, 'likely_scam'],
    [0.8499, 'likely_scam'],
    [0.85, 'very_likely_scam'],
  ];

  it('maps each exact threshold correctly', () => {
    for (const [isScam, expected] of cases) {
      const result = computeVerdict(makeJev({ isScam }), []);
      expect(result.risk).toBeCloseTo(isScam, 10);
      expect(result.verdict).toBe(expected);
    }
  });

  it('rounds the risk score to a 0..100 integer', () => {
    expect(computeVerdict(makeJev({ isScam: 0.2999 }), []).riskScore).toBe(30);
    expect(computeVerdict(makeJev({ isScam: 0 }), []).riskScore).toBe(0);
    expect(computeVerdict(makeJev({ isScam: 1 }), []).riskScore).toBe(100);
  });
});

describe('computeVerdict: signal floor', () => {
  it('applies the floor with 3 present signals', () => {
    const result = computeVerdict(
      makeJev({
        isScam: 0.2,
        signals: { ASKS_PAYMENT: 0.9, URGENCY_THREAT: 0.8, ASKS_CLICK: 0.75 },
      }),
      []
    );
    expect(result.risk).toBeGreaterThanOrEqual(0.6);
  });

  it('does not apply the floor with only 2 present signals', () => {
    const result = computeVerdict(
      makeJev({ isScam: 0.2, signals: { ASKS_PAYMENT: 0.9, URGENCY_THREAT: 0.8 } }),
      []
    );
    expect(result.risk).toBeCloseTo(0.2, 10);
    expect(result.risk).toBeLessThan(0.6);
  });
});

describe('computeVerdict: credentials + impersonation floor', () => {
  it('applies when asks_credentials is exactly 0.8', () => {
    const result = computeVerdict(
      makeJev({ isScam: 0.3, signals: { ASKS_CREDENTIALS: 0.8, IMPERSONATION: 0.75 } }),
      []
    );
    expect(result.risk).toBeGreaterThanOrEqual(0.75);
  });

  it('does not apply when asks_credentials is 0.79', () => {
    const result = computeVerdict(
      makeJev({ isScam: 0.3, signals: { ASKS_CREDENTIALS: 0.79, IMPERSONATION: 0.75 } }),
      []
    );
    expect(result.risk).toBeCloseTo(0.3, 10);
    expect(result.risk).toBeLessThan(0.75);
  });
});

describe('computeVerdict: URL floors', () => {
  it('raises to the high floor for a high-risk URL', () => {
    const result = computeVerdict(makeJev({ isScam: 0.2 }), [urlFinding('high')]);
    expect(result.risk).toBeGreaterThanOrEqual(0.65);
  });

  it('raises to the medium floor for a medium-risk URL', () => {
    const result = computeVerdict(makeJev({ isScam: 0.2 }), [urlFinding('medium')]);
    expect(result.risk).toBeGreaterThanOrEqual(0.4);
    expect(result.risk).toBeLessThan(0.65);
  });
});

describe('computeVerdict: type disagreement', () => {
  it('raises risk and adds MIXED_SIGNALS when confident but low isScam', () => {
    const result = computeVerdict(
      makeJev({ isScam: 0.2, scamType: 'bank_phishing', scamTypeConfidence: 0.8 }),
      []
    );
    expect(result.risk).toBeGreaterThanOrEqual(0.3);
    expect(result.verdict).toBe('suspicious');
    expect(result.reasonCodes).toContain('MIXED_SIGNALS');
  });

  it('ignores disagreement below the confidence threshold', () => {
    const result = computeVerdict(
      makeJev({ isScam: 0.2, scamType: 'bank_phishing', scamTypeConfidence: 0.69 }),
      []
    );
    expect(result.risk).toBeCloseTo(0.2, 10);
    expect(result.reasonCodes).not.toContain('MIXED_SIGNALS');
  });
});

describe('computeVerdict: confidence labels', () => {
  it('is low when isScam is in the uncertain middle', () => {
    expect(computeVerdict(makeJev({ isScam: 0.5, scamTypeConfidence: 0.9 }), []).confidence).toBe('low');
  });

  it('is low when scam type confidence is below 0.5', () => {
    expect(computeVerdict(makeJev({ isScam: 0.2, scamTypeConfidence: 0.4 }), []).confidence).toBe('low');
  });

  it('is high for a confident scam signal', () => {
    expect(computeVerdict(makeJev({ isScam: 0.92, scamTypeConfidence: 0.8 }), []).confidence).toBe('high');
  });

  it('is high for a confident benign signal', () => {
    expect(computeVerdict(makeJev({ isScam: 0.05, scamTypeConfidence: 0.8 }), []).confidence).toBe('high');
  });

  it('is medium otherwise', () => {
    expect(computeVerdict(makeJev({ isScam: 0.2, scamTypeConfidence: 0.8 }), []).confidence).toBe('medium');
    expect(computeVerdict(makeJev({ isScam: 0.75, scamTypeConfidence: 0.8 }), []).confidence).toBe('medium');
  });
});

describe('computeVerdict: reason codes', () => {
  it('keeps at most 5 signal codes, ordered by value descending', () => {
    const result = computeVerdict(
      makeJev({
        isScam: 0.9,
        signals: {
          ASKS_PAYMENT: 0.72,
          ASKS_CREDENTIALS: 0.8,
          URGENCY_THREAT: 0.95,
          IMPERSONATION: 0.9,
          TOO_GOOD: 0.85,
          ASKS_CLICK: 0.78,
        },
        pressure: 0,
      }),
      []
    );
    expect(result.reasonCodes).toEqual([
      'URGENCY_THREAT',
      'IMPERSONATION',
      'TOO_GOOD',
      'ASKS_CREDENTIALS',
      'ASKS_CLICK',
    ]);
    expect(result.reasonCodes).not.toContain('ASKS_PAYMENT');
  });

  it('adds PRESSURE_HIGH only from pressure 2', () => {
    expect(computeVerdict(makeJev({ isScam: 0.5, pressure: 2 }), []).reasonCodes).toContain('PRESSURE_HIGH');
    expect(computeVerdict(makeJev({ isScam: 0.5, pressure: 1 }), []).reasonCodes).not.toContain('PRESSURE_HIGH');
  });

  it('adds LINK_HIGH_RISK and never LINK_MEDIUM_RISK for a high URL', () => {
    const result = computeVerdict(makeJev({ isScam: 0.9 }), [urlFinding('high')]);
    expect(result.reasonCodes).toContain('LINK_HIGH_RISK');
    expect(result.reasonCodes).not.toContain('LINK_MEDIUM_RISK');
  });

  it('adds LINK_MEDIUM_RISK for a medium URL', () => {
    expect(computeVerdict(makeJev({ isScam: 0.9 }), [urlFinding('medium')]).reasonCodes).toContain(
      'LINK_MEDIUM_RISK'
    );
  });

  it('returns no duplicate codes', () => {
    const result = computeVerdict(
      makeJev({ isScam: 0.9, pressure: 2, signals: { ASKS_PAYMENT: 0.9 } }),
      [urlFinding('high')]
    );
    expect(new Set(result.reasonCodes).size).toBe(result.reasonCodes.length);
  });
});
