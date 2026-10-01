// Phase 0: prove the Jev API call works. Prints the full raw response.
import 'dotenv/config';
import { TypeSafeClient } from '@typesafe-ai/sdk';
// Single source of truth for question texts (SPEC section 8): reuse the real set.
import { QUESTIONS } from '../src/core/jevQuestions.js';

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
    is_scam: QUESTIONS.is_scam,
    scam_type: QUESTIONS.scam_type,
    pressure: QUESTIONS.pressure,
  },
});

console.dir(response, { depth: null });
