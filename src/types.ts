export type Channel = 'sms' | 'email' | 'whatsapp' | 'social' | 'marketplace' | 'other';

export type Verdict = 'very_likely_scam' | 'likely_scam' | 'suspicious' | 'no_obvious_red_flags';

export type Confidence = 'high' | 'medium' | 'low';

export const SCAM_TYPES = [
  'delivery_fee',
  'bank_phishing',
  'tech_support',
  'romance',
  'investment_crypto',
  'fake_job',
  'prize_lottery',
  'government_tax',
  'family_emergency',
  'marketplace_overpayment',
  'fake_invoice',
  'account_suspended',
  'other_scam',
  'not_a_scam',
] as const;
export type ScamType = (typeof SCAM_TYPES)[number];

export type SignalCode =
  | 'ASKS_PAYMENT'
  | 'ASKS_CREDENTIALS'
  | 'URGENCY_THREAT'
  | 'IMPERSONATION'
  | 'TOO_GOOD'
  | 'OFF_PLATFORM'
  | 'UNSOLICITED'
  | 'ASKS_CLICK';

export interface JevSignals {
  isScam: number; // 0..1 (Noul)
  signals: Record<SignalCode, number>; // each 0..1 (Noul)
  scamType: ScamType; // Choice
  scamTypeConfidence: number; // 0..1
  pressure: number; // Score, 0..3
}

export type UrlRisk = 'none' | 'medium' | 'high';

export type UrlFlagCode =
  | 'SHORTENER'
  | 'IP_HOST'
  | 'USERINFO_AT'
  | 'PUNYCODE'
  | 'NON_ASCII_HOST'
  | 'BRAND_LOOKALIKE'
  | 'RISKY_TLD'
  | 'DEEP_SUBDOMAIN'
  | 'NO_HTTPS';

export interface UrlFinding {
  url: string;
  host: string;
  risk: UrlRisk;
  flags: { code: UrlFlagCode; text: string }[];
}

export type ReasonCode =
  | SignalCode
  | 'PRESSURE_HIGH'
  | 'LINK_HIGH_RISK'
  | 'LINK_MEDIUM_RISK'
  | 'MIXED_SIGNALS'
  | 'DEGRADED_NO_AI';

export interface Reason {
  code: ReasonCode;
  text: string;
}

export interface CheckResult {
  requestId: string;
  verdict: Verdict;
  riskScore: number;
  scamType: ScamType;
  confidence: Confidence;
  reasons: Reason[];
  links: UrlFinding[];
  advice: string[];
  degraded: boolean;
  truncated: boolean;
  modelVersion: string;
}

export interface JevState {
  message: string;
  channel: Channel;
  link_facts: { host: string; flags: UrlFlagCode[] }[];
}
