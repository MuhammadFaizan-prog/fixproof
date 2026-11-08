# Security: FixProof

## Auth model
No end-user auth (public demo). The only credential is the Clocked account API key, used server side.

## Roles
Anonymous visitor (replay presets, capped live runs). Operator (Faizi): sets env vars on Vercel, records fixtures locally.

## Trust boundaries
1. Browser → `/api/triage`: all input untrusted; zod-validated; 60,000 char cap (Protect/Guard limit).
2. Server → Clocked: HTTPS, Bearer key, idempotency key.
3. KB markdown and fixtures: committed, but treated as untrusted content (KB passages are screened by Guard with `source: "content"` before generation).
4. Fix scripts: data only. FixProof never executes a script; "Run fix" shows a simulated log.

## Protected routes
`/api/triage` live mode is rate limited; `/api/health` exposes only booleans.

## Data protection
- Synthetic data only (challenge rule). Personas and KB are fictional.
- Ticket text is masked by Protect before any later step, storage, or handoff. History stores masked text only.
- Protect's response still contains original values in `entities`; only `anonymized_text` leaves the screening step.
- Server logs never include ticket text, KB passages, or the Authorization header.

## Secret handling
`CLOCKED_API_KEY` is server-only (no `NEXT_PUBLIC_` prefix), read only in `lib/clocked/client.ts`, set in Vercel env and `.env.local` (gitignored). `.env.example` has placeholders. On exposure: revoke in the Clocked dashboard, rotate in Vercel, redeploy.

## Validation
zod on request bodies, fixture files, and Clocked responses that drive policy (a malformed response is treated as a failed step, not trusted).

## Rate limiting and credit-drain abuse
Presets always replay (0 credits). Live free text passes `lib/server/live-guard.ts` before any Clocked call: per-visitor runs per sliding hour (`LIVE_PER_IP_RUNS_PER_HOUR`, default 5), one live run in flight (`LIVE_MAX_INFLIGHT`, default 1, matching Trial concurrency), and a daily credit cap per UTC day (`LIVE_DAILY_CREDIT_CAP`, default 2000) that reserves `LIVE_RUN_CREDIT_ESTIMATE` (60) per run and settles to the summed `X-Clocked-Credits`. Denials are HTTP 429 with `Retry-After` and a code (`rate_limited`, `busy`, `daily_cap`); `/api/health` reports `dailyCapReached` and the intake shows a replay-only note. Visitor IPs are map keys only, never logged.

**Global vs per-instance budget (honest limits).** The rate and in-flight counters live in process memory, so on a serverless host they are per warm instance. The daily credit cap has two modes, reported by `/api/health` as `liveBudget`:
- `global`: when `KV_REST_API_URL`/`KV_REST_API_TOKEN` (or the `UPSTASH_REDIS_REST_*` pair) are set, every run atomically reserves its estimate against one Redis key per UTC day before any Clocked call and settles to what Clocked charged, so `LIVE_DAILY_CREDIT_CAP` holds across all instances. If the store cannot be reached, live runs are refused (`budget_unavailable`, fail closed); presets still replay.
- `per-instance`: with no store, each warm instance's cap is lowered to `LIVE_INSTANCE_CREDIT_CAP` (default 400). Worst case per day is that cap times the number of instances Vercel keeps warm; this is a bound, not an exact meter.
In both modes every live run is bounded by `LIVE_RUN_CREDIT_CEILING` (default 90): once a run's summed `X-Clocked-Credits` reach it, the next call is refused and the run is handed to a person with a local handoff (`lib/clocked/budget.ts`). Input is capped at 4,000 characters (zod) before anything else runs. Concurrency stays at 1 (`CLOCKED_CONCURRENCY`) until the CLOCKEDHACKATHON upgrade to 4 concurrent requests is confirmed on the account page.

## Abuse cases
- Prompt injection in the ticket → Guard (user) quarantines and strips by offset.
- Poisoned KB article → Guard (content) drops the passage.
- Tampered remediation script → Inspect blocks Run fix; escalate.
- Hallucinated fix → Verify strips unsupported claims; escalate below threshold.
- Oversized payloads → 60k char cap, 3.5 MB body cap.
- Replaying idempotency keys from the client → keys are generated server side only.

## Prompt-injection risks
Guard is a detector, not an enforcement boundary (Clocked docs). Least privilege holds regardless: FixProof has no tools that change systems, never runs scripts, and cannot grant access.

## Privacy and compliance
No real personal data, no cookies beyond Next defaults, localStorage history clearable by the user. Not a production ITSM; no compliance claims.

## Supply chain
Dependencies: next, react, tailwind, geist, shadcn/ui deps, zod, minisearch, vitest. Pinned via pnpm-lock. No postinstall scripts beyond Next's own. `clocked-sdk` not used (raw fetch), so no third-party code sees the key.

## Deployment
Vercel Node runtime, env vars encrypted, preview deployments without the key run in replay mode.

## Incident / key rotation
Revoke key → new key in Vercel → redeploy → verify `/api/health` → re-run probe.

## Verified 2026-11-08 (API route commit)
- `.next/static` contains no `CLOCKED` string and no copy of the key value (grep after a clean build).
- `/api/health` returns only `{ ok, keyConfigured, liveAvailable, dailyCapReached, liveBudget }`: booleans and the budget mode, never usage figures or any part of the key.
- The route logs only an error name and scenario id, never ticket text or headers. Presets ignore client-sent text, so a preset run can never be steered by the client.
