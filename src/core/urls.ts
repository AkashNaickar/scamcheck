import { parse as parseDomain } from 'tldts';
import { BRANDS } from '../data/brands.js';
import { RISKY_TLDS } from '../data/riskyTlds.js';
import { SHORTENERS } from '../data/shorteners.js';
import { FLAG_TEXT } from './templates.js';
import type { UrlFinding, UrlFlagCode, UrlRisk } from '../types.js';

const TRAILING_PUNCTUATION = /[.,;:!?)\]}>"']+$/;

// Explicit http(s) URLs first; then bare domains that are not already inside a
// word, an email address or another URL. ASSUMPTION: a "known-looking TLD" is an
// alphabetic label of 2-24 characters (SPEC 6.3 does not give a whitelist).
const URL_PATTERN =
  /(?:https?:\/\/[^\s<>"'`]+|(?<![@\w.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}(?:\/[^\s<>"'`]*)?)/gi;

const FLAG_ORDER: UrlFlagCode[] = [
  'SHORTENER',
  'IP_HOST',
  'USERINFO_AT',
  'PUNYCODE',
  'NON_ASCII_HOST',
  'BRAND_LOOKALIKE',
  'RISKY_TLD',
  'DEEP_SUBDOMAIN',
  'NO_HTTPS',
];

/** All URL-ish strings in `text`, in order, trailing punctuation stripped, deduped case-insensitively. */
export function extractUrls(text: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0];
    if (!raw) continue;
    const url = raw.replace(TRAILING_PUNCTUATION, '');
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(url);
  }
  return urls;
}

/** Host text as written in `raw`, before WHATWG punycoding. Used only for NON_ASCII_HOST. */
function originalHost(raw: string): string {
  let s = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  s = s.split(/[/?#]/)[0] ?? '';
  s = s.replace(/:\d+$/, '');
  const at = s.lastIndexOf('@');
  if (at !== -1) s = s.slice(at + 1);
  return s;
}

function containsKeyword(host: string, keyword: string): boolean {
  return new RegExp(`(?:^|[^a-z0-9])${keyword}(?=$|[^a-z0-9])`).test(host);
}

function isBrandLookalike(host: string, domain: string | null): { count: number; lookalike: boolean } {
  const lower = host.toLowerCase();
  const keywords = Object.keys(BRANDS).filter((k) => containsKeyword(lower, k));
  const dom = (domain ?? '').toLowerCase();
  const lookalike = keywords.some((k) => {
    const legit = BRANDS[k];
    return !legit || !legit.includes(dom);
  });
  return { count: keywords.length, lookalike };
}

/** Analyze one URL-ish string. Pure string analysis: no DNS, no HTTP. Returns null if unparseable. */
export function analyzeUrl(raw: string): UrlFinding | null {
  const explicitHttp = /^http:\/\//i.test(raw);
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  let parsed: URL;
  try {
    parsed = new URL(hasScheme ? raw : `http://${raw}`);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const info = parseDomain(host);
  const domain = info.domain ? info.domain.toLowerCase() : null;
  const publicSuffix = (info.publicSuffix ?? host.split('.').pop() ?? '').toLowerCase();
  const tld = publicSuffix.includes('.') ? (publicSuffix.split('.').pop() ?? '') : publicSuffix;

  const codes = new Set<UrlFlagCode>();
  if (SHORTENERS.has(host) || (domain !== null && SHORTENERS.has(domain))) codes.add('SHORTENER');
  if (info.isIp === true) codes.add('IP_HOST');
  if (parsed.username !== '' || parsed.password !== '') codes.add('USERINFO_AT');
  if (host.split('.').some((label) => label.startsWith('xn--'))) codes.add('PUNYCODE');
  if (/[^\x00-\x7F]/.test(originalHost(raw))) codes.add('NON_ASCII_HOST');

  const brand = isBrandLookalike(host, domain);
  if (brand.lookalike) codes.add('BRAND_LOOKALIKE');
  if (RISKY_TLDS.has(publicSuffix) || (tld !== '' && RISKY_TLDS.has(tld))) codes.add('RISKY_TLD');
  if (info.subdomain !== null && info.subdomain !== '' && info.subdomain.split('.').length >= 4) {
    codes.add('DEEP_SUBDOMAIN');
  }
  if (explicitHttp) codes.add('NO_HTTPS');

  const hasBrandInHost = brand.count > 0;
  const high =
    codes.has('BRAND_LOOKALIKE') ||
    codes.has('IP_HOST') ||
    codes.has('USERINFO_AT') ||
    ((codes.has('PUNYCODE') || codes.has('NON_ASCII_HOST')) && hasBrandInHost);

  let risk: UrlRisk = 'none';
  if (high) {
    risk = 'high';
  } else if (
    codes.has('SHORTENER') ||
    codes.has('RISKY_TLD') ||
    codes.has('DEEP_SUBDOMAIN') ||
    codes.has('PUNYCODE') ||
    codes.has('NON_ASCII_HOST') ||
    codes.has('NO_HTTPS')
  ) {
    risk = 'medium';
  }

  const flags = FLAG_ORDER.filter((code) => codes.has(code)).map((code) => ({
    code,
    text: FLAG_TEXT[code],
  }));

  return { url: raw, host, risk, flags };
}

/** Extract and analyze up to `maxUrls` URLs; `extraUrls` counts the ones ignored past the cap. */
export function analyzeText(text: string, maxUrls: number): { findings: UrlFinding[]; extraUrls: number } {
  const urls = extractUrls(text);
  const cap = Math.max(0, maxUrls);
  const considered = urls.slice(0, cap);
  const findings: UrlFinding[] = [];
  for (const url of considered) {
    const finding = analyzeUrl(url);
    if (finding) findings.push(finding);
  }
  return { findings, extraUrls: Math.max(0, urls.length - cap) };
}
