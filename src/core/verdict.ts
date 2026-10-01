import { THRESHOLDS } from '../config.js';
import type {
  Confidence,
  JevSignals,
  ReasonCode,
  SignalCode,
  UrlFinding,
  Verdict,
} from '../types.js';

export interface VerdictResult {
  verdict: Verdict;
  riskScore: number;
  confidence: Confidence;
  reasonCodes: ReasonCode[];
  risk: number;
}

// SPEC 7.1 step 3 gates on asks_credentials >= 0.8. That value is documented in
// config.ts but has no named THRESHOLDS field, so it is named here.
// ASSUMPTION: 0.8 is the spec's fixed gate and is not tunable via THRESHOLDS.
const CREDS_MIN = 0.8;

function worstUrlRisk(urls: UrlFinding[]): 'none' | 'medium' | 'high' {
  if (urls.some((u) => u.risk === 'high')) return 'high';
  if (urls.some((u) => u.risk === 'medium')) return 'medium';
  return 'none';
}

function confidenceLabel(jev: JevSignals): Confidence {
  const t = THRESHOLDS;
  if (jev.scamTypeConfidence < t.lowConfidence) return 'low';
  if (jev.isScam >= 0.35 && jev.isScam <= 0.65) return 'low';
  if (jev.isScam >= 0.9) return 'high';
  if (jev.isScam <= 0.08 && jev.scamTypeConfidence >= 0.7) return 'high';
  return 'medium';
}

export function computeVerdict(jev: JevSignals, urls: UrlFinding[]): VerdictResult {
  const t = THRESHOLDS;
  let risk = jev.isScam;

  // 2. Signal floor.
  const present = (Object.keys(jev.signals) as SignalCode[])
    .map((code) => ({ code, value: jev.signals[code] }))
    .filter((s) => s.value > t.signalOn)
    .sort((a, b) => b.value - a.value);
  if (present.length >= t.hardFlagMinCount) risk = Math.max(risk, t.hardFlagFloor);

  // 3. Credentials + impersonation.
  if (jev.signals.ASKS_CREDENTIALS >= CREDS_MIN && jev.signals.IMPERSONATION > t.signalOn) {
    risk = Math.max(risk, t.credsPlusImpersonationFloor);
  }

  // 4. URL floor (raise only).
  const urlWorst = worstUrlRisk(urls);
  if (urlWorst === 'high') risk = Math.max(risk, t.urlHighFloor);
  else if (urlWorst === 'medium') risk = Math.max(risk, t.urlMediumFloor);

  // 5. Type disagreement.
  const mixedSignals =
    jev.scamType !== 'not_a_scam' &&
    jev.scamTypeConfidence >= t.typeDisagreeMinConfidence &&
    jev.isScam < t.typeDisagreePScamBelow;
  if (mixedSignals) risk = Math.max(risk, t.band.suspicious);

  // 6. Clamp and score.
  risk = Math.min(1, Math.max(0, risk));
  const riskScore = Math.round(risk * 100);

  // 7. Band.
  let verdict: Verdict;
  if (risk >= t.band.veryLikely) verdict = 'very_likely_scam';
  else if (risk >= t.band.likely) verdict = 'likely_scam';
  else if (risk >= t.band.suspicious) verdict = 'suspicious';
  else verdict = 'no_obvious_red_flags';

  // 9. Reasons. (Step 8, the confidence label, is computed at return.)
  const codes: ReasonCode[] = present.slice(0, 5).map((s) => s.code);
  if (jev.pressure >= 2) codes.push('PRESSURE_HIGH');
  if (urlWorst === 'high') codes.push('LINK_HIGH_RISK');
  else if (urlWorst === 'medium') codes.push('LINK_MEDIUM_RISK');
  if (mixedSignals) codes.push('MIXED_SIGNALS');

  const reasonCodes = [...new Set(codes)];
  return { verdict, riskScore, confidence: confidenceLabel(jev), reasonCodes, risk };
}
