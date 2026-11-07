# Tracker: FixProof

Last updated: 2026-11-08 01:45 PKT

## Current active work
Commit 6 (replay + probe). Next: KB (7), BM25 (8).

## Commits
| # | Message | Status | Build | Pushed |
|---|---|---|---|---|
| 1 | chore: scaffold Next.js 15 + TypeScript + Tailwind with pnpm | done | pass | yes |
| 2 | docs: add PRD, Techspec, Appflow, Schema and Structure for FixProof | done | pass | yes |
| 3 | docs: add ImplementationPlan, Tracker, Rules and Security | done | pass | yes |
| 4 | chore: add shadcn/ui, design tokens and base layout | done | pass | yes |
| 5 | feat(clocked): typed client wrapper with idempotency, backoff and credit headers | done | pass (19 tests) | yes |
| 6 | feat(clocked): replay mode backed by recorded fixtures | not started | | |
| 7 | feat(kb): add synthetic Northwind Labs knowledge base and personas | not started | | |
| 8 | feat(kb): minisearch BM25 index with chunk neighbors | not started | | |
| 9–25 | see ImplementationPlan.md | not started | | |

## Stories
| ID | Title | Priority | Status | Pass/fail | Evidence |
|---|---|---|---|---|---|
| S1 | Intake, personas, presets | P0 | not started | | |
| S2 | Screening via pipeline | P0 | not started | | |
| S3 | Understand: extract, fill, decide | P0 | not started | | |
| S4 | Rerank retrieval + content guard | P0 | not started | | |
| S5 | Compare conflicts | P0 | not started | | |
| S6 | Draft + Verify | P0 | not started | | |
| S7 | Inspect fix gate | P0 | not started | | |
| S8 | Handoff on escalation | P0 | not started | | |
| S9 | Proof Trail | P0 | not started | | |
| S10 | Replay + live caps | P0 | not started | | |
| S11 | Docs, video, deploy | P0 | not started | | |

## Blockers
None.

## Decisions
- 2026-11-08: Fonts from the `geist` npm package instead of `next/font/google`, because the build sandbox cannot reach Google Fonts and builds must be reproducible offline.
- 2026-11-08: Raw `fetch` transport instead of `clocked-sdk` 0.7.0, so the app owns idempotency keys per step, reads all `X-Clocked-*` headers, and replays fixtures through the same path (the SDK's built-in retries would stack on ours). Recorded in Techspec.

- 2026-11-08: Design references chosen (docs/DESIGN.md): Merit run trace (Dribbble) for the Proof Trail, Shift Studio support ticket system (Dribbble) for chrome/cards/rows, Sentry AI agent tracing for the step inspector. Reference images linked, not committed (third-party work).
- 2026-11-08: Own 30-line FIFO limiter instead of `p-limit` (one less dependency, same behavior, unit-tested).
- 2026-11-08: shadcn/ui (radix base, nova preset) with its `cn` package; dark tokens removed from P0.

## Assumptions
See PRD.md and /workspace PLAN (solo entry, Clocked-only AI, synthetic data, no DB).

## Verification history
- 2026-11-08 01:36 PKT: `pnpm build` pass (commit 1, 2).
- 2026-11-08 01:44 PKT: first live Clocked call (decide, 10 input tokens) → HTTP 200, `X-Clocked-Credits: 1`, `X-Clocked-Cost-Basis: reference` (trial basis, so concurrency may be 1 rather than 4; limiter must be configurable).

- 2026-11-08 02:05 PKT: commit 4 `pnpm build` + `pnpm lint` pass; headless Chrome screenshots at 1440 px and 390 px checked against R1/R2 (stacking, wrapping, focus ring present).
- 2026-11-08 02:20 PKT: commit 5 `pnpm typecheck`, `pnpm lint`, `pnpm test` (19 passed: same-key retries on 429/5xx, Retry-After, retryAsNew stop, no retry on 400/401/402/403/413/422, 409 only while recovering, timeouts, limiter peak, key never in errors), `pnpm build` pass. Live smoke through `createLiveClientFromEnv`: decide → 200, 1 credit, 11.3 model ms, transport door:east.
- Environment note: in the Hark build sandbox, Node's fetch reaches Clocked only with `NODE_USE_ENV_PROXY=1`; not needed on Vercel or a normal machine.

## Next actions
1. Design references → docs/DESIGN.md → commit 4.
2. Client + tests → commit 5.
