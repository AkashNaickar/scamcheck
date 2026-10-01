import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { EntryType, SystemOneResult } from '@typesafe-ai/sdk';
import { SCAM_TYPES, type JevSignals, type JevState, type SignalCode } from '../types.js';
import { QUESTIONS, SIGNAL_KEY_MAP } from './jevQuestions.js';

export interface JudgeResult {
  signals: JevSignals;
  modelVersion: string;
  usage?: { inputTokens: number };
}

export interface Judge {
  evaluate(state: JevState): Promise<JudgeResult>;
}

type Answers = SystemOneResult<typeof QUESTIONS>['answers'];

/** Map one raw Jev response to our JevSignals. Validates unknown choice labels. */
export function extractSignals(answers: Answers): JevSignals {
  const rawType = answers.scam_type.choice;
  const scamType = (SCAM_TYPES as readonly string[]).includes(rawType)
    ? (rawType as JevSignals['scamType'])
    : 'other_scam';

  const signals = {} as Record<SignalCode, number>;
  for (const [code, key] of Object.entries(SIGNAL_KEY_MAP) as [SignalCode, string][]) {
    const answer = (answers as Record<string, { noul?: number }>)[key];
    signals[code] = typeof answer?.noul === 'number' ? answer.noul : 0.5;
  }

  return {
    isScam: answers.is_scam.noul,
    signals,
    scamType,
    scamTypeConfidence: answers.scam_type.confidence,
    pressure: answers.pressure.score,
  };
}

/** Real judge: one Jev systemOne call per check, 10s timeout, SDK retries kept. */
export class JevJudge implements Judge {
  readonly #client: TypeSafeClient;
  readonly #model: string;

  constructor(apiKey: string, model: string) {
    this.#client = new TypeSafeClient({ apiKey });
    this.#model = model;
  }

  async evaluate(state: JevState): Promise<JudgeResult> {
    // ASSUMPTION: JevState is a plain JSON object at runtime; the SDK's EntryType
    // requires an index signature our interface doesn't declare, so cast through unknown.
    const response = await this.#client.systemOne(
      { model: this.#model, state: state as unknown as EntryType, questions: QUESTIONS },
      { timeout: 10_000 },
    );
    return {
      signals: extractSignals(response.answers),
      modelVersion: response.model,
      usage: { inputTokens: response.usage.input_tokens },
    };
  }
}

/** Test judge. Takes fixed signals or a function. Never touches the network. */
export class FakeJudge implements Judge {
  readonly #fn: (state: JevState) => JevSignals;
  readonly #modelVersion: string;
  callCount = 0;

  constructor(fn: (state: JevState) => JevSignals, modelVersion = 'fake-1.0.0') {
    this.#fn = fn;
    this.#modelVersion = modelVersion;
  }

  async evaluate(state: JevState): Promise<JudgeResult> {
    this.callCount++;
    return { signals: this.#fn(state), modelVersion: this.#modelVersion };
  }
}

/** Errors must never leak the API key. Maps any error to a generic message. */
export function safeErrorText(err: unknown, apiKey?: string): string {
  let text = err instanceof Error ? err.message : String(err);
  if (apiKey) text = text.split(apiKey).join('[REDACTED]');
  return text;
}
