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
Presets always replay (0 credits). Live free text: per-IP runs per hour (`LIVE_PER_IP_RUNS_PER_HOUR`) and a global daily credit cap (`LIVE_DAILY_CREDIT_CAP`) computed from `X-Clocked-Credits`. Concurrency limited to the account allowance. On cap: replay-only banner.

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
