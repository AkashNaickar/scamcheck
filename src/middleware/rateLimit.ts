import type { Context, MiddlewareHandler } from 'hono';
import type { Config } from '../config.js';

interface Entry {
  date: string; // 'YYYY-MM-DD' in UTC
  count: number;
}

// Module-scoped so every app instance shares one counter. Tests call resetRateLimiter().
const store = new Map<string, Entry>();

export function resetRateLimiter(): void {
  store.clear();
}

function utcDay(ms: number = Date.now()): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function clientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress ?? 'unknown';
}

/** In-memory per-IP daily limit. Only successful (200) responses consume the quota. */
export function rateLimit(cfg: Config): MiddlewareHandler {
  return async (c, next) => {
    const ip = clientIp(c);
    const today = utcDay();

    let entry = store.get(ip);
    if (!entry || entry.date !== today) {
      entry = { date: today, count: 0 };
      store.set(ip, entry);
    }

    if (entry.count >= cfg.freeDailyLimit) {
      return c.json(
        { error: { code: 'RATE_LIMIT', message: 'Daily free limit reached' } },
        429,
      );
    }

    await next();
    if (c.res.status === 200) entry.count += 1;
  };
}

// Drop entries older than two UTC days so the map cannot grow forever.
const DAY_MS = 24 * 60 * 60 * 1000;
const cleanup = setInterval(() => {
  const cutoff = utcDay(Date.now() - 2 * DAY_MS);
  for (const [ip, entry] of store) {
    if (entry.date < cutoff) store.delete(ip);
  }
}, 60 * 60 * 1000);
// Do not keep the process (or test run) alive because of this timer.
if (typeof cleanup.unref === 'function') cleanup.unref();
