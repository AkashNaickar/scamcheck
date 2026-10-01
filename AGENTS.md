# AGENTS.md — ScamCheck

Project: a scam checker (web app + API + browser extension) powered by Jev (TypeSafe AI "System One" model, returns typed probabilistic decisions, not text).

**The full spec is `SPEC.md`. Read it before doing anything. Follow it exactly.**

## Non-negotiable rules
1. Work on ONE phase of SPEC.md section 12 at a time. Run the phase GATE. Commit. Then stop and report, unless told to continue.
2. Run `npm run typecheck && npm test` after every change set. Never leave the repo red.
3. Only the dependencies listed in SPEC.md section 3. No frameworks, no DB, no auth, no payments.
4. Jev is NOT a chat model. One Jev call per check. Never ask it for text. Never ask it to count or compare numbers/dates. Compute in code.
5. User-facing text only from `src/core/templates.ts`. Thresholds only in `src/config.ts`. Questions only in `src/core/jevQuestions.ts`.
6. Never log, store, or return the user's message text beyond the single request. Never fetch URLs found in messages.
7. `TYPESAFE_API_KEY` stays server-side. Never in `public/`, `extension/`, logs, or git.
8. Code may only RAISE risk relative to Jev's output, never lower it.
9. Never write the word "safe" in a verdict. Best verdict: "No obvious red flags".
10. Do not invent SDK/API fields. If unsure, inspect `node_modules/@typesafe-ai/sdk` types or run `npm run smoke` and read the raw response.
11. Tests never hit the network; use `FakeJudge`.
12. Keep files under ~200 lines and follow the layout in SPEC.md section 4.
13. If something is ambiguous, choose the simplest option, leave `// ASSUMPTION: ...`, and continue.

## Commands
- `npm run dev` start server (port 8787)
- `npm run typecheck` / `npm test`
- `npm run smoke` real Jev smoke call
- `npm run eval` real Jev accuracy report on fixtures
