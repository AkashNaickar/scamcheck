import { describe, expect, it } from 'vitest';
import { SCAM_TYPES, type ReasonCode, type SignalCode, type UrlFlagCode } from '../src/types.js';
import { ADVICE, FLAG_TEXT, REASONS } from '../src/core/templates.js';

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

const EXTRA_REASON_CODES: Exclude<ReasonCode, SignalCode>[] = [
  'PRESSURE_HIGH',
  'LINK_HIGH_RISK',
  'LINK_MEDIUM_RISK',
  'MIXED_SIGNALS',
  'DEGRADED_NO_AI',
];

const FLAG_CODES: UrlFlagCode[] = [
  'SHORTENER',
  'IP_HOST',
  'USERINFO_AT',
  'PUNYCODE',
  'NON_ASCII_HOST',
  'BRAND_LOOKALIKE',
  'RISKY_TLD',
  'DEEP_SUBDOMAIN',
  'NO_HTTPS',
];

describe('templates coverage', () => {
  it('has a reason text for every ReasonCode', () => {
    for (const code of [...SIGNAL_CODES, ...EXTRA_REASON_CODES]) {
      expect(typeof REASONS[code as ReasonCode]).toBe('string');
      expect(REASONS[code as ReasonCode].length).toBeGreaterThan(5);
    }
  });

  it('has flag text for every UrlFlagCode', () => {
    for (const code of FLAG_CODES) {
      expect(typeof FLAG_TEXT[code]).toBe('string');
      expect(FLAG_TEXT[code].length).toBeGreaterThan(5);
    }
  });

  it('has advice for every ScamType with 3–5 entries', () => {
    for (const type of SCAM_TYPES) {
      expect(ADVICE[type].length).toBeGreaterThanOrEqual(3);
      expect(ADVICE[type].length).toBeLessThanOrEqual(5);
    }
  });

  it('scam-type advice always includes the two mandatory lines', () => {
    for (const type of SCAM_TYPES) {
      if (type === 'not_a_scam') continue;
      expect(ADVICE[type].some((a) => a.startsWith('Don’t click links'))).toBe(true);
      expect(ADVICE[type].some((a) => a.startsWith('Contact the organization'))).toBe(true);
    }
  });

  it('never uses the word "safe" as a verdict-style claim', () => {
    const allText = JSON.stringify({ REASONS, FLAG_TEXT, VERDICT: null } as unknown);
    // REASONS/FLAG_TEXT must not claim safety; check for absence of standalone safe wording.
    expect(/\bthis message is safe\b/i.test(allText)).toBe(false);
  });
});
