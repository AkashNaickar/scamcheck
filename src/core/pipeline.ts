import { randomUUID } from 'node:crypto';
import type { Config } from '../config.js';
import type { Channel, CheckResult, JevState, Reason, Verdict } from '../types.js';
import type { Judge, JudgeResult } from './judge.js';
import { normalize, redactForModel, truncate } from './sanitize.js';
import { ADVICE, REASONS } from './templates.js';
import { analyzeText } from './urls.js';
import { computeVerdict } from './verdict.js';

export interface CheckInput {
  text: string;
  channel?: Channel;
}

/** Worst risk across URL findings; used by degraded mode (SPEC 7.5). */
function worstRisk(findings: { risk: 'none' | 'medium' | 'high' }[]): 'none' | 'medium' | 'high' {
  if (findings.some((f) => f.risk === 'high')) return 'high';
  if (findings.some((f) => f.risk === 'medium')) return 'medium';
  return 'none';
}

/**
 * One check, start to finish (SPEC 6). Validation is done by the route, so the
 * pipeline trusts its input. Exactly one judge call; on failure it degrades
 * using URL facts only and never returns "no_obvious_red_flags" (SPEC 7.5).
 */
export async function runCheck(
  input: CheckInput,
  deps: { judge: Judge; cfg: Config },
): Promise<CheckResult> {
  const requestId = randomUUID();
  const channel: Channel = input.channel ?? 'other';

  // 1-2. Normalize, then truncate to the configured cap.
  const normalized = normalize(input.text);
  const { text: truncatedText, truncated } = truncate(normalized, deps.cfg.maxInputChars);

  // 3. Analyze URLs from the ORIGINAL normalized text, before redaction.
  const { findings } = analyzeText(normalized, 10);

  // 4. Redact PII for the model.
  const modelText = redactForModel(truncatedText);

  // 5. Jev state. `link_facts` is computed in code, never by Jev.
  const state: JevState = {
    message: modelText,
    channel,
    link_facts: findings.map((f) => ({ host: f.host, flags: f.flags.map((x) => x.code) })),
  };

  // 6. Exactly one judge call, timed.
  const startedAt = Date.now();
  let judgeResult: JudgeResult | undefined;
  let degraded = false;
  try {
    judgeResult = await deps.judge.evaluate(state);
  } catch {
    degraded = true;
  }
  const latencyMs = Date.now() - startedAt;

  // 7-8. Combine and render. 7.5 handles the judge-error path.
  let result: CheckResult;
  if (degraded || !judgeResult) {
    const risk = worstRisk(findings);
    let verdict: Verdict;
    let riskScore: number;
    let reasons: Reason[];
    if (risk === 'high') {
      verdict = 'likely_scam';
      riskScore = 70;
      reasons = [{ code: 'LINK_HIGH_RISK', text: REASONS.LINK_HIGH_RISK }];
    } else if (risk === 'medium') {
      verdict = 'suspicious';
      riskScore = 45;
      reasons = [{ code: 'LINK_MEDIUM_RISK', text: REASONS.LINK_MEDIUM_RISK }];
    } else {
      verdict = 'suspicious';
      riskScore = 35;
      reasons = [{ code: 'DEGRADED_NO_AI', text: REASONS.DEGRADED_NO_AI }];
    }
    result = {
      requestId,
      verdict,
      riskScore,
      scamType: 'other_scam',
      confidence: 'low',
      reasons,
      links: findings,
      advice: ADVICE.not_a_scam,
      degraded: true,
      truncated,
      modelVersion: 'none',
    };
  } else {
    const computed = computeVerdict(judgeResult.signals, findings);
    result = {
      requestId,
      verdict: computed.verdict,
      riskScore: computed.riskScore,
      scamType: judgeResult.signals.scamType,
      confidence: computed.confidence,
      reasons: computed.reasonCodes.map((code) => ({ code, text: REASONS[code] })),
      links: findings,
      advice:
        computed.verdict === 'no_obvious_red_flags'
          ? ADVICE.not_a_scam
          : ADVICE[judgeResult.signals.scamType],
      degraded: false,
      truncated,
      modelVersion: judgeResult.modelVersion,
    };
  }

  // 10. Safe metadata only: never the message text or redacted text.
  console.log(
    JSON.stringify({
      requestId,
      ts: new Date().toISOString(),
      verdict: result.verdict,
      riskScore: result.riskScore,
      scamType: result.scamType,
      confidence: result.confidence,
      modelVersion: result.modelVersion,
      latencyMs,
      inputTokens: judgeResult?.usage?.inputTokens ?? null,
      degraded: result.degraded,
      truncated,
      channel,
      urlCount: findings.length,
    }),
  );

  return result;
}
