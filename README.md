# ScamCheck

Paste a suspicious message, email, link or listing and get back a scam verdict, a risk score, plain-language reasons, and what to do next.

Decisions are made by **Jev** (TypeSafe AI "System One"), which returns typed, calibrated decisions — not text. Every user-facing sentence comes from our own templates; Jev only answers yes/no, choice and score questions.

## Requirements

- Node.js >= 20
- A TypeSafe API key

## Setup

```sh
npm install
cp .env.example .env   # Windows: copy .env.example .env
# then put your real key in .env
```

`.env` is gitignored. The key is read only by `src/config.ts` and used only in `JevJudge`; it is never sent to the frontend or extension.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `TYPESAFE_API_KEY` | (empty) | Server-side Jev key. If missing, the server still starts but `/api/check` returns 503. |
| `JEV_MODEL` | `jev-latest` | Model alias sent to Jev. |
| `PORT` | `8787` | HTTP port. |
| `MAX_INPUT_CHARS` | `6000` | Text is truncated to this many characters before analysis. |
| `FREE_DAILY_LIMIT` | `10` | Checks per IP per UTC day. |
| `ALLOWED_ORIGINS` | `http://localhost:8787` | Comma-separated CORS allow-list. `chrome-extension://` origins are always allowed. |
| `FEEDBACK_FILE` | `data/feedback.jsonl` | JSONL feedback log (no message text). |

## Running

```sh
npm run dev     # tsx watch, port 8787
npm start       # tsx, port 8787
```

Open http://localhost:8787.

## API

`POST /api/check` — body `{ "text": string, "channel"?: "sms"|"email"|"whatsapp"|"social"|"marketplace"|"other" }`

```sh
curl -s localhost:8787/api/check -H 'content-type: application/json' \
  -d '{"text":"Your package is held. Pay $1.99 at http://bit.ly/x1 now","channel":"sms"}'
```

Returns `requestId`, `verdict`, `riskScore` (0–100), `scamType`, `confidence`, `reasons[]`, `links[]`, `advice[]`, `degraded`, `truncated`, `modelVersion`.

- `POST /api/feedback` — `{ "requestId": uuid, "label": "scam"|"not_scam"|"unsure" }` → `204`
- `GET /api/health` → `{ "ok": true }`

Errors: `400` validation, `413` body > 50 KB, `429` daily limit, `503` key missing / checker unavailable. When Jev is unreachable the checker returns HTTP 200 with `degraded: true` and a URL-only result (never a green verdict).

## Testing and evaluation

```sh
npm run typecheck   # tsc --noEmit
npm test            # vitest (no network; uses FakeJudge)
npm run smoke       # one real Jev call, prints the raw response
npm run eval        # real-Jev accuracy report on tests/fixtures/cases.json
```

`npm run eval` prints a table, scam/not-scam accuracy, a confusion matrix and a threshold sweep. It exits 0 and is skipped with a clear message when no API key is set.

## Privacy

- Message text is never logged, stored or returned beyond the single request.
- Links in messages are analysed as strings only — never opened, no DNS, no HTTP.
- Emails, phone numbers and card numbers are masked before the text is sent to Jev.
- Feedback stores only `{requestId, label, verdict, riskScore, ts}` — no message text.

## Project layout

```
src/
  server.ts        Hono app, static files, routes
  config.ts        env parsing + all tunable constants (THRESHOLDS)
  types.ts         shared types
  routes/          POST /api/check, POST /api/feedback
  middleware/      rate limit + CORS
  core/            pipeline, sanitize, urls, jevQuestions, judge, verdict, templates
  data/            shorteners, brands, risky TLDs
public/            index.html, app.js, styles.css (no framework, no bundler)
scripts/           jev-smoke.ts, eval.ts
tests/             unit + API tests (FakeJudge) and fixtures/cases.json
extension/         Manifest V3 browser extension
```

## Disclaimer

This is a second opinion, not a guarantee. When in doubt, contact the company using a number or website you already trust.
