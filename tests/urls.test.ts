import { describe, expect, it } from 'vitest';
import { analyzeText, analyzeUrl, extractUrls } from '../src/core/urls.js';
import { FLAG_TEXT } from '../src/core/templates.js';
import type { UrlFinding, UrlFlagCode } from '../src/types.js';

function must(raw: string): UrlFinding {
  const finding = analyzeUrl(raw);
  if (!finding) throw new Error(`expected ${raw} to parse`);
  return finding;
}

function codes(raw: string): UrlFlagCode[] {
  return must(raw).flags.map((f) => f.code);
}

describe('extractUrls', () => {
  it('finds bare domains with a path', () => {
    expect(extractUrls('Visit example.com/path today')).toEqual(['example.com/path']);
  });

  it('finds explicit http(s) URLs in order', () => {
    expect(extractUrls('See https://example.com/a then http://foo.org/b')).toEqual([
      'https://example.com/a',
      'http://foo.org/b',
    ]);
  });

  it('strips trailing punctuation', () => {
    expect(extractUrls('Go to example.com/path! Then (https://example.com/x).')).toEqual([
      'example.com/path',
      'https://example.com/x',
    ]);
  });

  it('dedupes case-insensitively, keeping the first spelling', () => {
    expect(extractUrls('EXAMPLE.com/path and example.com/path')).toEqual(['EXAMPLE.com/path']);
  });

  it('returns every URL when no cap is applied at extraction time', () => {
    expect(extractUrls('a.com b.com c.com')).toEqual(['a.com', 'b.com', 'c.com']);
  });
});

describe('SPEC 10 examples', () => {
  it('does not flag a legitimate PayPal sign-in link', () => {
    const finding = must('https://www.paypal.com/signin');
    expect(finding.risk).toBe('none');
    expect(finding.flags).toEqual([]);
  });

  it('flags a PayPal lookalike as high risk', () => {
    const finding = must('https://paypal-secure-login.xyz');
    expect(finding.risk).toBe('high');
    expect(codes('https://paypal-secure-login.xyz')).toContain('BRAND_LOOKALIKE');
  });

  it('flags an IP host over http as high risk', () => {
    const finding = must('http://192.168.1.5/login');
    expect(finding.risk).toBe('high');
    expect(codes('http://192.168.1.5/login')).toContain('IP_HOST');
    expect(codes('http://192.168.1.5/login')).toContain('NO_HTTPS');
  });

  it('flags bit.ly as a medium-risk shortener', () => {
    expect(must('https://bit.ly/3abc').risk).toBe('medium');
    expect(codes('https://bit.ly/3abc')).toContain('SHORTENER');
  });
});

describe('per-flag positive and negative cases', () => {
  it('SHORTENER: t.co yes, wa.me no', () => {
    expect(codes('https://t.co/abc')).toContain('SHORTENER');
    expect(codes('https://wa.me/123')).not.toContain('SHORTENER');
    expect(must('https://wa.me/123').risk).toBe('none');
  });

  it('IP_HOST: IPv6 literal yes, normal domain no', () => {
    expect(codes('http://[::1]/login')).toContain('IP_HOST');
    expect(codes('https://example.com')).not.toContain('IP_HOST');
  });

  it('USERINFO_AT: credentials yes, plain host no', () => {
    expect(codes('https://paypal.com@evil.example')).toContain('USERINFO_AT');
    expect(codes('https://example.com/login')).not.toContain('USERINFO_AT');
  });

  it('PUNYCODE: encoded label yes, ASCII host no', () => {
    expect(codes('https://xn--80ak6aa92e.com')).toContain('PUNYCODE');
    expect(codes('https://example.com')).not.toContain('PUNYCODE');
  });

  it('NON_ASCII_HOST: unicode host yes, ASCII host no', () => {
    expect(codes('https://exämple.com/login')).toContain('NON_ASCII_HOST');
    expect(codes('https://example.com')).not.toContain('NON_ASCII_HOST');
  });

  it('BRAND_LOOKALIKE: keyword in subdomain yes, real domain no', () => {
    expect(codes('https://paypal.secure-login.xyz')).toContain('BRAND_LOOKALIKE');
    expect(codes('https://www.paypal.com/signin')).not.toContain('BRAND_LOOKALIKE');
  });

  it('RISKY_TLD: xyz yes, com no', () => {
    expect(codes('https://shop.xyz')).toContain('RISKY_TLD');
    expect(codes('https://example.com')).not.toContain('RISKY_TLD');
  });

  it('DEEP_SUBDOMAIN: four labels yes, one label no', () => {
    expect(codes('https://a.b.c.d.example.com')).toContain('DEEP_SUBDOMAIN');
    expect(codes('https://www.example.com')).not.toContain('DEEP_SUBDOMAIN');
  });

  it('NO_HTTPS: explicit http yes, https no', () => {
    expect(codes('http://example.com')).toContain('NO_HTTPS');
    expect(codes('https://example.com')).not.toContain('NO_HTTPS');
  });
});

describe('risk levels', () => {
  it('punycode alone is medium', () => {
    expect(must('https://xn--80ak6aa92e.com').risk).toBe('medium');
  });

  it('non-ASCII host alone is medium', () => {
    expect(must('https://exämple.com').risk).toBe('medium');
  });

  it('deep subdomain is medium', () => {
    expect(must('https://a.b.c.d.example.com').risk).toBe('medium');
  });

  it('risky TLD is medium', () => {
    expect(must('https://shop.xyz').risk).toBe('medium');
  });

  it('userinfo is high', () => {
    expect(must('https://user:pass@example.com').risk).toBe('high');
  });
});

describe('parsing and shape', () => {
  it('returns null for an unparseable URL', () => {
    expect(analyzeUrl('http://')).toBeNull();
    expect(analyzeUrl('https://')).toBeNull();
  });

  it('keeps the original URL text and lowercases the host', () => {
    const bare = must('Example.com/Path');
    expect(bare.url).toBe('Example.com/Path');
    expect(bare.host).toBe('example.com');
    expect(must('https://WWW.PAYPAL.COM').host).toBe('www.paypal.com');
  });

  it('uses flag text from templates', () => {
    expect(must('https://bit.ly/3abc').flags[0]?.text).toBe(FLAG_TEXT.SHORTENER);
  });
});

describe('analyzeText cap', () => {
  it('analyzes only the first maxUrls and counts the rest', () => {
    const result = analyzeText('a.com b.com c.com', 2);
    expect(result.findings).toHaveLength(2);
    expect(result.findings.map((f) => f.host)).toEqual(['a.com', 'b.com']);
    expect(result.extraUrls).toBe(1);
  });

  it('reports zero extra when under the cap', () => {
    expect(analyzeText('example.com', 5).extraUrls).toBe(0);
  });
});
