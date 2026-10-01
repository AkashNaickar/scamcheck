// Phase 3: live accuracy eval against tests/fixtures/cases.json.
// This is a REPORT, not a test: it always exits 0 and never prints message text.
// It calls the REAL Jev, but only when run manually via `npm run eval`, and
// cleanly skips (exit 0) when TYPESAFE_API_KEY is unset.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig, THRESHOLDS } from '../src/config.js';
import { JevJudge } from '../src/core/judge.js';
import { runCheck } from '../src/core/pipeline.js';
import type { Channel, ScamType, Verdict } from '../src/types.js';

interface EvalCase {
  id: string;
  channel: Channel;
  text: string;
  expected: 'scam' | 'not_scam';
  minVerdict: 'likely_scam' | 'suspicious' | null;
  type: ScamType;
}

interface Row {
  id: string;
  expected: 'scam' | 'not_scam';
  verdict: Verdict;
  riskScore: number;
  scamType: ScamType;
  minMiss: boolean;
}

const RANK: Record<Verdict, number> = {
  no_obvious_red_flags: 0,
  suspicious: 1,
  likely_scam: 2,
  very_likely_scam: 3,
};

const isScamVerdict = (v: Verdict): boolean => v !== 'no_obvious_red_flags';

/** Re-band a 0..1 risk with an alternative `suspicious` threshold (SPEC 7.1 step 7). */
function band(risk: number, suspicious: number): Verdict {
  if (risk >= THRESHOLDS.band.veryLikely) return 'very_likely_scam';
  if (risk >= THRESHOLDS.band.likely) return 'likely_scam';
  if (risk >= suspicious) return 'suspicious';
  return 'no_obvious_red_flags';
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.apiKey) {
    console.log('Set TYPESAFE_API_KEY to run the eval report.');
    process.exit(0);
  }

  const casesPath = fileURLToPath(new URL('../tests/fixtures/cases.json', import.meta.url));
  const cases = JSON.parse(readFileSync(casesPath, 'utf8')) as EvalCase[];
  const judge = new JevJudge(cfg.apiKey, cfg.jevModel);

  const rows: Row[] = [];
  for (const c of cases) {
    const result = await runCheck({ text: c.text, channel: c.channel }, { judge, cfg });
    const minMiss = c.minVerdict !== null && RANK[result.verdict] < RANK[c.minVerdict];
    rows.push({
      id: c.id,
      expected: c.expected,
      verdict: result.verdict,
      riskScore: result.riskScore,
      scamType: result.scamType,
      minMiss,
    });
  }

  console.log('\n=== ScamCheck eval report ===');
  console.log(`${pad('id', 22)} ${pad('expected', 10)} ${pad('got', 22)} risk`);
  for (const r of rows) {
    console.log(`${pad(r.id, 22)} ${pad(r.expected, 10)} ${pad(r.verdict, 22)} ${r.riskScore}`);
  }

  let tp = 0;
  let fn = 0;
  let fp = 0;
  let tn = 0;
  for (const r of rows) {
    const actualScam = r.expected === 'scam';
    const predictedScam = isScamVerdict(r.verdict);
    if (actualScam && predictedScam) tp++;
    else if (actualScam && !predictedScam) fn++;
    else if (!actualScam && predictedScam) fp++;
    else tn++;
  }
  const total = rows.length;
  const accuracy = total === 0 ? 0 : (tp + tn) / total;
  console.log('\n--- scam / not_scam split ---');
  console.log(`accuracy: ${(accuracy * 100).toFixed(1)}%  (${tp + tn}/${total})`);
  console.log('confusion matrix (rows = expected, cols = predicted):');
  console.log('                 predicted scam   predicted not_scam');
  console.log(`expected scam    ${pad(String(tp), 16)} ${fn}`);
  console.log(`expected not     ${pad(String(fp), 16)} ${tn}`);

  console.log('\n--- minVerdict misses (verdict ranked below required) ---');
  const misses = rows.filter((r) => r.minMiss);
  if (misses.length === 0) {
    console.log('none');
  } else {
    for (const m of misses) {
      console.log(`${m.id}: got ${m.verdict} (risk ${m.riskScore})`);
    }
    console.log(`total: ${misses.length}/${total}`);
  }

  console.log('\n--- sweep: cases that would differ if band.suspicious changed ---');
  const baseline = rows.map((r) => r.verdict);
  for (const alt of [0.2, 0.3, 0.4, 0.5]) {
    const flips = rows.filter((r, i) => band(r.riskScore / 100, alt) !== baseline[i]).length;
    console.log(`band.suspicious = ${alt.toFixed(1)} -> ${flips} case(s) with a different verdict`);
  }

  console.log('\n(report only; no message text shown)\n');
}

main().catch((err: unknown) => {
  // A report must never fail the process.
  console.error('Eval failed:', err instanceof Error ? err.message : String(err));
  process.exitCode = 0;
});
