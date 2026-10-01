// Phase 0: prove the Jev API call works. Prints the full raw response.
import 'dotenv/config';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { choice, noul, score } from '@typesafe-ai/sdk';

if (!process.env.TYPESAFE_API_KEY) {
  console.error('TYPESAFE_API_KEY is missing. Put it in .env and retry.');
  process.exit(1);
}

const client = new TypeSafeClient();

const response = await client.systemOne({
  model: process.env.JEV_MODEL ?? 'jev-latest',
  state: {
    message: 'URGENT: Your parcel is held. Pay $1.99 at http://bit.ly/x1 within 2 hours.',
    channel: 'sms',
    link_facts: [{ host: 'bit.ly', flags: ['SHORTENER'] }],
  },
  questions: {
    is_scam: noul(
      'Is `message` an attempt by the sender to trick the reader into sending money, giving up personal, banking or account information, sharing a verification code, or installing something, for the sender\'s benefit?',
    ),
    scam_type: choice(
      'If `message` were a scam, which kind would it be? If it does not look like a scam, choose not_a_scam.',
      {
        delivery_fee: 'Missed parcel or delivery, asks for a redelivery or customs fee',
        not_a_scam: 'Looks like a normal, legitimate message',
        other_scam: 'A scam that fits none of the above',
      },
    ),
    pressure: score('How much manipulation pressure does `message` apply to the reader?', [
      'No pressure; neutral or informational',
      'Mild nudge; polite request or reminder with no deadline',
      'Strong pressure; deadline, limited offer, or warning of a negative outcome',
      'Extreme pressure; threats, fear, secrecy demands, or "act in the next few minutes"',
    ]),
  },
});

console.dir(response, { depth: null });
