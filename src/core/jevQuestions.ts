import { choice, noul, score } from '@typesafe-ai/sdk';
import type { SignalCode } from '../types.js';

// Single source of truth for the Jev question set (SPEC section 8).
// Do not duplicate these texts anywhere else.

export const QUESTIONS = {
  is_scam: noul(
    'Is `message` an attempt by the sender to trick the reader into sending money, giving up personal, banking or account information, sharing a verification code, or installing something, for the sender\'s benefit?',
  ),

  asks_payment: noul(
    'Does `message` ask the reader to pay money, a fee, a deposit, or send gift cards, crypto or a transfer?',
  ),
  asks_credentials: noul(
    'Does `message` ask the reader for a password, PIN, one-time code, card details, ID number, or to log in or "verify" an account?',
  ),
  urgency_threat: noul(
    'Does `message` pressure the reader to act immediately or threaten a bad consequence such as account closure, arrest, fines or missing out?',
  ),
  impersonation: noul(
    'Does `message` claim to come from a bank, courier, government agency, well-known company, employer, or a family member or friend?',
  ),
  too_good: noul(
    'Does `message` promise a prize, easy money, guaranteed returns, or a job or reward that seems unrealistically generous?',
  ),
  off_platform: noul(
    'Does `message` ask the reader to move the conversation to a different app or channel such as WhatsApp or Telegram, or to pay outside the platform?',
  ),
  unsolicited: noul(
    'Does `message` read like contact the reader did not ask for, from someone they have no established relationship with?',
  ),
  asks_click: noul(
    'Does `message` tell the reader to open a link, call a number, or download or install something?',
  ),

  scam_type: choice(
    'If `message` were a scam, which kind would it be? If it does not look like a scam, choose not_a_scam.',
    {
      delivery_fee: 'Missed parcel or delivery, asks for a redelivery or customs fee',
      bank_phishing: 'Pretends to be a bank or payment app, asks to verify details, card or login',
      tech_support: 'Claims a device is infected or hacked, offers support or a refund',
      romance: 'Affection or relationship building leading to money requests',
      investment_crypto: 'Promises high returns, trading tips, crypto or forex schemes',
      fake_job: 'Job offer or task work that asks for fees, personal details, or advance payment',
      prize_lottery: 'Claims the reader won a prize, lottery or giveaway',
      government_tax: 'Pretends to be tax, police, customs or a government service',
      family_emergency: 'Pretends to be a relative or friend in urgent trouble needing money',
      marketplace_overpayment:
        'Buyer or seller on a marketplace, overpayment, fake payment proof, off-platform payment',
      fake_invoice: 'Fake invoice, subscription renewal or order confirmation asking for payment or a call',
      account_suspended: 'Claims an account is locked, suspended or compromised and needs action',
      other_scam: 'A scam that fits none of the above',
      not_a_scam: 'Looks like a normal, legitimate message',
    },
  ),

  pressure: score('How much manipulation pressure does `message` apply to the reader?', [
    'No pressure; neutral or informational',
    'Mild nudge; polite request or reminder with no deadline',
    'Strong pressure; deadline, limited offer, or warning of a negative outcome',
    'Extreme pressure; threats, fear, secrecy demands, or "act in the next few minutes"',
  ]),
} as const;

export const SIGNAL_KEY_MAP: Record<SignalCode, string> = {
  ASKS_PAYMENT: 'asks_payment',
  ASKS_CREDENTIALS: 'asks_credentials',
  URGENCY_THREAT: 'urgency_threat',
  IMPERSONATION: 'impersonation',
  TOO_GOOD: 'too_good',
  OFF_PLATFORM: 'off_platform',
  UNSOLICITED: 'unsolicited',
  ASKS_CLICK: 'asks_click',
};
