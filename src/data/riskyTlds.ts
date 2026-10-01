// TLDs with heavy scam/phishing abuse. Checked case-insensitively against the
// URL host's public suffix label (e.g. "xyz" in "paypal-secure-login.xyz").
export const RISKY_TLDS: ReadonlySet<string> = new Set([
  'zip',
  'mov',
  'top',
  'xyz',
  'click',
  'icu',
  'gq',
  'cf',
  'tk',
  'ml',
  'ga',
  'rest',
  'support',
  'work',
  'loan',
  'cfd',
  'sbs',
  'cyou',
  'monster',
  'bond',
]);
