import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { pathToFileURL } from 'node:url';
import { loadConfig, type Config } from './config.js';
import { JevJudge, type Judge } from './core/judge.js';
import { cors } from './middleware/cors.js';
import { rateLimit } from './middleware/rateLimit.js';
import { checkRoute } from './routes/check.js';
import { feedbackRoute } from './routes/feedback.js';
import type { CheckResult, Verdict } from './types.js';

const RESULTS_CAP = 1000;

// Module-level feedback metadata store: requestId -> {verdict, riskScore}.
// ASSUMPTION: a bounded in-memory map (FIFO cap 1000) is enough for feedback
// lookups; SPEC forbids a database, and no message text is ever kept here.
const results = new Map<string, { verdict: Verdict; riskScore: number }>();

function rememberResult(result: CheckResult): void {
  if (results.size >= RESULTS_CAP) {
    const oldest = results.keys().next().value;
    if (oldest !== undefined) results.delete(oldest);
  }
  results.set(result.requestId, { verdict: result.verdict, riskScore: result.riskScore });
}

export function createApp(cfg: Config, judge?: Judge): Hono {
  const app = new Hono();

  app.use('/api/*', cors(cfg));
  app.use('/api/*', rateLimit(cfg));

  app.route('/', checkRoute({ judge, cfg, onResult: rememberResult }));
  app.route('/', feedbackRoute({ cfg, results }));

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.use('/*', serveStatic({ root: './public' }));

  return app;
}

export function main(): void {
  const cfg = loadConfig();
  const judge = cfg.apiKey ? new JevJudge(cfg.apiKey, cfg.jevModel) : undefined;
  const app = createApp(cfg, judge);
  serve({ fetch: app.fetch, port: cfg.port }, (info) => {
    console.log(`listening on port ${info.port}`);
  });
}

const entryPath = process.argv[1];
const isDirectRun = entryPath !== undefined && import.meta.url === pathToFileURL(entryPath).href;

if (isDirectRun) main();
