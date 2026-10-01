import type { ReasonCode, ScamType, UrlFlagCode, Verdict } from '../types.js';

// Every user-facing sentence lives here. Short, plain, calm, no jargon, no blame.
// Never use the word "safe" as a verdict; best wording is "No obvious red flags".

export const REASONS: Record<ReasonCode, string> = {
  ASKS_PAYMENT: 'It asks you to send money or pay a fee.',
  ASKS_CREDENTIALS: 'It asks for a password, PIN, one-time code, or card details.',
  URGENCY_THREAT: 'It tries to rush you or threatens a bad outcome if you don’t act.',
  IMPERSONATION: 'It claims to be from an organization or person you may trust.',
  TOO_GOOD: 'It promises something that sounds too good to be true.',
  OFF_PLATFORM: 'It asks you to move to another app or pay outside the platform.',
  UNSOLICITED: 'It’s from someone you didn’t expect to hear from.',
  ASKS_CLICK: 'It pushes you to open a link, call a number, or install something.',
  PRESSURE_HIGH: 'The tone is highly pressuring.',
  LINK_HIGH_RISK: 'A link in this message shows strong warning signs.',
  LINK_MEDIUM_RISK: 'A link in this message looks unusual.',
  MIXED_SIGNALS: 'The message looks like a known scam pattern even though overall it’s not clear-cut.',
  DEGRADED_NO_AI: 'Our checker is temporarily unavailable, so this result is limited.',
};

export const FLAG_TEXT: Record<UrlFlagCode, string> = {
  SHORTENER: 'Shortened link that hides the real destination.',
  IP_HOST: 'Uses a numeric address instead of a normal website name.',
  USERINFO_AT: 'Contains a hidden login part before the real website name.',
  PUNYCODE: 'Website name uses encoded characters, sometimes used to imitate real sites.',
  NON_ASCII_HOST: 'Website name contains unusual characters.',
  BRAND_LOOKALIKE: 'Looks like a well-known brand but isn’t its real website.',
  RISKY_TLD: 'Ends in a web ending that scams often use.',
  DEEP_SUBDOMAIN: 'Unusually deep website name, a common trick to hide the real site.',
  NO_HTTPS: 'Uses an unencrypted connection instead of HTTPS.',
};

export const VERDICT_HEADING: Record<Verdict, string> = {
  very_likely_scam: 'Very likely a scam',
  likely_scam: 'Likely a scam',
  suspicious: 'Suspicious',
  no_obvious_red_flags: 'No obvious red flags',
};

export const VERDICT_DESCRIPTION: Record<Verdict, string> = {
  very_likely_scam: 'This shows strong signs of a scam attempt.',
  likely_scam: 'This shows clear warning signs of a common scam pattern.',
  suspicious: 'This has some warning signs. Treat it carefully.',
  no_obvious_red_flags: 'We didn’t spot common scam patterns in this message.',
};

export const DISCLAIMER =
  'This is a second opinion, not a guarantee. When in doubt, contact the company using a number or website you already trust.';

export const NOT_CERTAIN_NOTE =
  'We’re not certain. Treat this carefully and verify through an official channel.';

export const NO_RED_FLAGS_NOTE =
  'We didn’t spot clear warning signs, but scammers can be convincing. If it asks for money, codes or logins, verify through a trusted channel first.';

const COMMON_SCAM_ADVICE = [
  'Don’t click links or call numbers in the message.',
  'Contact the organization using a phone number or website you already trust.',
];

// ASSUMPTION: advice entries stay at 3–5 per type; add more lines freely.
export const ADVICE: Record<ScamType, string[]> = {
  delivery_fee: [
    ...COMMON_SCAM_ADVICE,
    'Check the courier’s official app or website with your tracking number.',
    'Real couriers rarely ask for fees by text link.',
  ],
  bank_phishing: [
    ...COMMON_SCAM_ADVICE,
    'Your bank will never ask for your PIN or full OTP by message.',
    'If you shared details, call your bank now and ask to block the card or reset access.',
  ],
  tech_support: [
    ...COMMON_SCAM_ADVICE,
    'Real companies don’t warn you about viruses out of the blue.',
    'Don’t let anyone remotely access your device.',
  ],
  romance: [
    ...COMMON_SCAM_ADVICE,
    'Never send money, gift cards or crypto to someone you haven’t met in person.',
    'Talk to someone you trust before sending anything.',
  ],
  investment_crypto: [
    ...COMMON_SCAM_ADVICE,
    'Guaranteed returns don’t exist.',
    'Check the firm with your country’s financial regulator.',
  ],
  fake_job: [
    ...COMMON_SCAM_ADVICE,
    'Real employers don’t charge you fees to start work.',
    'Never share ID or bank details before a verified contract.',
  ],
  prize_lottery: [
    ...COMMON_SCAM_ADVICE,
    'Real prizes never ask you to pay a fee to claim them.',
    'If you didn’t enter, you didn’t win.',
  ],
  government_tax: [
    ...COMMON_SCAM_ADVICE,
    'Tax offices don’t demand payment or arrest you by message.',
    'Look up the official contact on the agency’s own website.',
  ],
  family_emergency: [
    ...COMMON_SCAM_ADVICE,
    'Call the person on their usual number before sending anything.',
    'Agree a family code word for emergencies.',
  ],
  marketplace_overpayment: [
    ...COMMON_SCAM_ADVICE,
    'Never refund an “overpayment”; the original payment is usually fake.',
    'Keep payments on the platform.',
  ],
  fake_invoice: [
    ...COMMON_SCAM_ADVICE,
    'Check any invoice against your own records or account before paying.',
    'Log in to the service directly instead of using the message.',
  ],
  account_suspended: [
    ...COMMON_SCAM_ADVICE,
    'Log in by typing the website address yourself, never through the message.',
    'If you’re worried, contact the service through its official help page.',
  ],
  other_scam: [
    ...COMMON_SCAM_ADVICE,
    'Slow down. Pressure to act quickly is a classic scam tactic.',
    'Ask someone you trust for a second opinion before responding.',
  ],
  not_a_scam: [
    'If it asks for money, codes or logins, verify through a trusted channel first.',
    'Keep this message if anything about it later seems off.',
    'You can still ask us to check any future message before you act on it.',
  ],
};
