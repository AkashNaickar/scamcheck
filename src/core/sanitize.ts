/**
 * Pure text sanitizing for the ScamCheck pipeline.
 *
 * Rules live in SPEC.md section 6 / 6.1: normalize, truncate, then redact PII
 * before the text is ever handed to Jev. No I/O, no dependencies beyond the
 * language builtins.
 */

export interface UrlSegment {
  text: string;
  isUrl: boolean;
}

/** Matches an http(s) URL up to whitespace or a quote-like delimiter (SPEC 6.3). */
const URL_RE = /https?:\/\/[^\s<>"']+/g;

/** Trailing punctuation that is almost never part of a real URL (SPEC 6.3). */
const TRAILING_PUNCTUATION = /[.,;:!?)\]}>"']+$/;

/** 13-19 digits, optionally separated by single spaces/dashes (SPEC 6.1, applied first). */
const CARD_RE = /\b(?:\d[ -]?){12,18}\d\b/g;

/** Phone-like span; digit count is checked before replacing (SPEC 6.1). */
const PHONE_RE = /\+?\d[\d\s().-]{5,}\d/g;

/** Simple email address (SPEC 6.1). */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Unicode NFKC, CRLF -> LF, collapse 3+ newlines to 2, collapse space/tab runs
 * to a single space, then trim (SPEC 6 step 2).
 */
export function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Cut to `maxChars`, keeping the start. `truncated` is true only when a cut
 * actually happened (SPEC 6 step 3).
 */
export function truncate(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (maxChars >= 0 && text.length <= maxChars) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, Math.max(0, maxChars)), truncated: true };
}

/**
 * Split text into URL and non-URL segments, matching only `https?://` URLs and
 * stripping trailing punctuation back into the following non-URL segment.
 * Exported for tests; `redactForModel` is the public entry point.
 */
export function splitUrlSegments(text: string): UrlSegment[] {
  const segments: UrlSegment[] = [];
  const re = new RegExp(URL_RE.source, 'g');
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const raw = match[0] ?? '';
    if (raw.length === 0) continue;
    const url = raw.replace(TRAILING_PUNCTUATION, '');
    const start = match.index;
    const end = start + url.length;
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), isUrl: false });
    }
    segments.push({ text: url, isUrl: true });
    cursor = end;
    re.lastIndex = end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), isUrl: false });
  }
  return segments;
}

/** Keep scheme/host/path, redact each query value, drop the fragment. */
function redactUrlSegment(url: string): string {
  const withoutFragment = url.split('#')[0] ?? url;
  const queryIndex = withoutFragment.indexOf('?');
  if (queryIndex < 0) {
    return withoutFragment;
  }
  const base = withoutFragment.slice(0, queryIndex);
  const query = withoutFragment.slice(queryIndex + 1);
  const redacted = query
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      return eq < 0 ? pair : `${pair.slice(0, eq)}=[REDACTED]`;
    })
    .join('&');
  return `${base}?${redacted}`;
}

/** Card numbers first, then phones, then emails (SPEC 6.1 order). */
function redactNonUrlSegment(text: string): string {
  return text
    .replace(CARD_RE, '[CARD_NUMBER]')
    .replace(PHONE_RE, (m) => (m.replace(/\D/g, '').length >= 7 ? '[PHONE]' : m))
    .replace(EMAIL_RE, '[EMAIL]');
}

/**
 * Produce the redacted text that is sent to Jev: URL query values masked, PII
 * in plain text masked, short numeric codes left intact (SPEC 6.1).
 */
export function redactForModel(text: string): string {
  return splitUrlSegments(text)
    .map((segment) =>
      segment.isUrl ? redactUrlSegment(segment.text) : redactNonUrlSegment(segment.text),
    )
    .join('');
}
