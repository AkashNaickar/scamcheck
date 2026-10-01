import { describe, expect, it } from 'vitest';
import { normalize, redactForModel, splitUrlSegments, truncate } from '../src/core/sanitize.js';

describe('normalize (SPEC 6 step 2)', () => {
  it('applies NFKC to full-width letters and digits', () => {
    expect(normalize('ＡＢＣ１２３')).toBe('ABC123');
  });

  it('applies NFKC to the fi ligature', () => {
    expect(normalize('ﬁle')).toBe('file');
  });

  it('replaces CRLF with LF', () => {
    expect(normalize('a\r\nb')).toBe('a\nb');
  });

  it('collapses runs of 3+ newlines to 2', () => {
    expect(normalize('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('keeps a single blank line (2 newlines)', () => {
    expect(normalize('a\n\nb')).toBe('a\n\nb');
  });

  it('collapses runs of spaces and tabs to one space', () => {
    expect(normalize('a   \t  b')).toBe('a b');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalize('  hi  ')).toBe('hi');
  });
});

describe('truncate (SPEC 6 step 3)', () => {
  it('keeps the start and flags a cut', () => {
    expect(truncate('abcdef', 3)).toEqual({ text: 'abc', truncated: true });
  });

  it('does not flag a string within the limit', () => {
    expect(truncate('abc', 10)).toEqual({ text: 'abc', truncated: false });
  });

  it('does not flag an exact-length string', () => {
    expect(truncate('abc', 3)).toEqual({ text: 'abc', truncated: false });
  });
});

describe('splitUrlSegments (SPEC 6.3 intent)', () => {
  it('marks https URLs and preserves the surrounding text', () => {
    const segments = splitUrlSegments('see https://example.com/x now');
    expect(segments.filter((s) => s.isUrl)).toHaveLength(1);
    expect(segments.map((s) => s.text).join('')).toBe('see https://example.com/x now');
  });

  it('strips trailing punctuation back into the non-URL segment', () => {
    const segments = splitUrlSegments('Visit https://example.com.');
    expect(segments.some((s) => s.isUrl && s.text === 'https://example.com')).toBe(true);
    expect(segments[segments.length - 1]?.text).toBe('.');
  });
});

describe('redactForModel — non-URL rules (SPEC 6.1)', () => {
  it('redacts a dash-grouped card number as CARD_NUMBER and not PHONE', () => {
    const out = redactForModel('Card 4111-1111-1111-1111 expires soon');
    expect(out).toContain('[CARD_NUMBER]');
    expect(out).not.toContain('[PHONE]');
    expect(out).not.toContain('4111');
  });

  it('redacts a space-grouped card number', () => {
    const out = redactForModel('4111 1111 1111 1111');
    expect(out).toBe('[CARD_NUMBER]');
  });

  it('redacts a contiguous card number', () => {
    expect(redactForModel('4111111111111111')).toBe('[CARD_NUMBER]');
  });

  it('keeps a 4-8 digit OTP intact', () => {
    const out = redactForModel('your OTP is 482913');
    expect(out).toContain('482913');
    expect(out).not.toContain('[PHONE]');
    expect(out).not.toContain('[CARD_NUMBER]');
  });

  it('redacts a phone with +, spaces, dashes and parentheses', () => {
    const out = redactForModel('Call +1 (555) 123-4567 now');
    expect(out).toContain('[PHONE]');
    expect(out).not.toContain('555');
  });

  it('redacts a plain 10-digit phone number', () => {
    expect(redactForModel('ring 9876543210')).toContain('[PHONE]');
  });

  it('redacts an email address', () => {
    expect(redactForModel('mail jane.doe@example.com please')).toContain('[EMAIL]');
  });
});

describe('redactForModel — URL rules (SPEC 6.1)', () => {
  it('redacts query values and keeps parameter names', () => {
    const out = redactForModel('Go to https://shop.example.com/pay?email=a@b.com&token=xyz now');
    expect(out).toContain('email=[REDACTED]');
    expect(out).toContain('token=[REDACTED]');
    expect(out).toContain('https://shop.example.com/pay?');
    expect(out).not.toContain('a@b.com');
    expect(out).not.toContain('xyz');
  });

  it('drops the URL fragment', () => {
    expect(redactForModel('https://example.com/page#section')).toBe('https://example.com/page');
  });

  it('keeps the URL path untouched', () => {
    expect(redactForModel('https://example.com/a/b/c')).toBe('https://example.com/a/b/c');
  });

  it('redacts every query value but keeps bare param names', () => {
    expect(redactForModel('https://x.example.com/?a=1&b=2&flag')).toBe(
      'https://x.example.com/?a=[REDACTED]&b=[REDACTED]&flag',
    );
  });

  it('does not apply the phone rule inside a URL segment', () => {
    expect(redactForModel('https://example.com/?phone=+15551234567')).toBe(
      'https://example.com/?phone=[REDACTED]',
    );
  });

  it('still redacts a non-URL email next to a URL', () => {
    const out = redactForModel('jane@example.com see https://example.com/a?x=1');
    expect(out).toContain('[EMAIL]');
    expect(out).toContain('x=[REDACTED]');
  });
});
