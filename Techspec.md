# Techspec: FixProof

## Architecture overview
One Next.js 15 (App Router) app on Vercel. The browser posts a ticket to `/api/triage`; a Node route handler runs the orchestrator (`lib/agent/run.ts`) and streams step events back over Server-Sent Events. Each step calls Clocked through one wrapper (`lib/clocked/client.ts`). Retrieval recall is local BM25 over a committed markdown KB; Clocked Rerank does the judgment.

```
Browser ── POST /api/triage ──► orchestrator ──► lib/clocked/client ──► https://clocked.rezolve.ai/clocked/<endpoint>
   ▲                                │                     └─ replay: fixtures/<scenario>/<step>.json
   └──── SSE step events ◄──────────┘
```

## Frontend
React 19, Tailwind CSS v4, shadcn/ui primitives, lucide-react icons, framer-motion only for the Proof Trail. Client state is local React state; ticket history in localStorage. No global store.

## Backend
Next.js route handlers on the Node runtime (not Edge), `maxDuration = 60`.
- `POST /api/triage` body `{ text, personaId, scenarioId?, mode: "replay" | "live" }` → `text/event-stream` of `StepEvent` then one `OutcomeEvent`.
- `GET /api/health` → `{ ok, mode, keyConfigured }` (never the key).

## Orchestrator steps
1. screen: `pipeline` [pii(anonymize: replace), injection(source user, stop: true)]; on flag, cut evidence spans by offset and re-run `injection` on the remainder.
2. understand (parallel, <= 4): `extract`, `fill` (record), `decide` (policy).
3. retrieve: minisearch top 20 → `rerank` (context = persona, top_n 8) → expand neighbors once → `injection` (source content) on each "use" passage.
4. reconcile: `compare` when >= 2 "use" passages.
5. draft: `fill` with one `generate` field (max_tokens 220).
6. prove: `grounding` (documents = use passages, evidence all, threshold 0.7, question = ticket).
7. fix gate: `script` with approved-scope instructions.
8. outcome: pure `policy.ts` → AUTO_RESOLVED | CONFIRM_WITH_USER | ESCALATED; on ESCALATED a `fill` handoff record.

## Clocked integration (lib/clocked)
- Transport: raw `fetch` to `https://clocked.rezolve.ai/clocked/<endpoint>` with `Authorization: Bearer`, `Content-Type: application/json`, `Idempotency-Key` (docs: authentication). Chosen over `clocked-sdk` 0.7.0 so the app owns the idempotency key per logical step, reads every `X-Clocked-*` header, and replays fixtures through the same code path; the SDK's own retries would stack on ours. The SDK remains a documented option.
- Idempotency: one UUID per logical step, reused on every retry of that step with the identical payload (docs: errors).
- Retries: bounded exponential backoff with full jitter on 429 and 5xx and on network errors; stop when the body has `retryAsNew: true`; never retry 400/401/402/403/413/422; 409 retried only while recovering an unknown outcome.
- Concurrency: one shared limiter sized by `CLOCKED_CONCURRENCY`, default 1 (Trial plan allows 1 concurrent request; Build allows 4).
- Usage: parse `X-Clocked-Credits`, `X-Clocked-Model-Ms`, `X-Clocked-Cost-Usd`, `X-Clocked-Cost-Basis`, `X-Clocked-Transport` into a `ClockedMeta` returned beside the data.
- Offsets: Unicode code points (`Array.from`), never `String.slice` (docs: responses).
- Timeouts: 110 s gateway; client per-attempt timeout 115 s; the route streams progress so the UI never looks frozen.

## Replay mode
`fixtures/<scenario>/<step>.json` holds `{ meta, request, response, headers }`. Replay is used when `CLOCKED_API_KEY` is unset, when the request is a preset, or when `mode: "replay"`. Fixtures not yet recorded from the live API are marked `"synthetic": true` and the UI labels them "Synthetic fixture (doc-shaped)"; recorded ones say "Recorded response, <date>".

## Dependencies
next 15, react 19, tailwindcss 4, geist (local fonts; the build must not depend on Google Fonts), shadcn/ui deps (class-variance-authority, clsx, tailwind-merge, lucide-react), zod, minisearch 7, vitest. Planned: framer-motion, @upstash/ratelimit (only if setup < 15 min), playwright.

## Caching
KB index built once per server instance (module scope). No response caching beyond Clocked's own idempotent replay.

## Deployment
Vercel, Node runtime. Env: `CLOCKED_API_KEY` (server only), `CLOCKED_BASE_URL` (optional), `LIVE_DAILY_CREDIT_CAP`, `LIVE_PER_IP_RUNS_PER_HOUR`.

## Observability
Per call: endpoint, step, status, attempts, credits, model ms, transport, round-trip ms; logged without ticket text or the Authorization header. Shown in the Proof Trail.

## Tradeoffs
- BM25 instead of vectors: no vector DB, cheap; Rerank fixes recall quality.
- Clocked-only generation: one provider and bill, but Fill `generate` is capped at 400 tokens, so replies are short step lists.
- No DB: nothing to secure or migrate; history is per browser.

## Technical constraints (from Clocked docs)
Pipeline: 1–16 steps, one 800-credit reservation, steps share the text. Verify/Compare: 58k-token admission. Rerank: 1–256 docs. Protect/Guard: 60k chars. Body 3.5 MB. Concurrency 4.
