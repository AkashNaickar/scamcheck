import type { MiddlewareHandler } from 'hono';
import type { Config } from '../config.js';

const ALLOW_METHODS = 'POST, GET, OPTIONS';
const ALLOW_HEADERS = 'Content-Type';

function isAllowedOrigin(origin: string, cfg: Config): boolean {
  return cfg.allowedOrigins.includes(origin) || origin.startsWith('chrome-extension://');
}

/** CORS for the API: only allow-listed origins and chrome-extension:// origins get headers. */
export function cors(cfg: Config): MiddlewareHandler {
  return async (c, next) => {
    const origin = c.req.header('origin');

    // No Origin header (curl, same-origin): nothing to negotiate, pass through.
    if (!origin) {
      await next();
      return;
    }

    if (!isAllowedOrigin(origin, cfg)) {
      if (c.req.method === 'OPTIONS') return c.body(null, 403);
      await next();
      return;
    }

    c.header('Access-Control-Allow-Origin', origin);
    c.header('Vary', 'Origin');
    c.header('Access-Control-Allow-Methods', ALLOW_METHODS);
    c.header('Access-Control-Allow-Headers', ALLOW_HEADERS);

    if (c.req.method === 'OPTIONS') return c.body(null, 204);
    await next();
  };
}
