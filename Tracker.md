# Tracker: FixProof

Last updated: 2026-11-08 02:23 PKT

## Current active work
Agent steps in progress (commits 9–15).

## Commits
| # | Message | Status | Build | Pushed |
|---|---|---|---|---|
| 1 | chore: scaffold Next.js 15 + TypeScript + Tailwind with pnpm | done | pass | yes |
| 2 | docs: add PRD, Techspec, Appflow, Schema and Structure for FixProof | done | pass | yes |
| 3 | docs: add ImplementationPlan, Tracker, Rules and Security | done | pass | yes |
| 4 | chore: add shadcn/ui, design tokens and base layout | done | pass | yes |
| 5 | feat(clocked): typed client wrapper with idempotency, backoff and credit headers | done | pass (19 tests) | yes |
| 6 | feat(clocked): replay mode backed by recorded fixtures | done | pass (50 tests) | yes |
| 7 | feat(kb): add synthetic Northwind Labs knowledge base and personas | done | pass (61 tests) | yes |
| 8 | feat(kb): minisearch BM25 index with chunk neighbors | done | pass (79 tests) | yes |
| 9 | feat(agent): screening step via pipeline (pii + injection stop) | done | pass (91 tests) | yes |
| 9a | fix(clocked): default concurrency to 1 for the Trial plan | done | pass (92 tests) | yes |
| 10 | feat(agent): understand step with extract, fill record and decide policy | done | pass (99 tests) | yes |
| 11 | feat(agent): rerank retrieval with expand loop and content guard | done | pass (107 tests) | yes |
| 12 | feat(agent): compare use-passages and resolve conflicts | done | pass (112 tests) | yes |
| next | see ImplementationPlan.md | not started | | |

## Stories
| ID | Title | Priority | Status | Pass/fail | Evidence |
|---|---|---|---|---|---|
| S1 | Intake, personas, presets | P0 | not started | | |
| S2 | Screening via pipeline | P0 | done (lib) | pass (unit) | tests/agent-screen.test.ts |
| S3 | Understand: extract, fill, decide | P0 | done (lib) | pass (unit + live spot check) | tests/agent-understand.test.ts |
| S4 | Rerank retrieval + content guard | P0 | done (lib) | pass (unit + live spot check) | tests/agent-retrieve.test.ts |
| S5 | Compare conflicts | P0 | done (lib) | pass (unit) | tests/agent-reconcile.test.ts |
| S6 | Draft + Verify | P0 | not started | | |
| S7 | Inspect fix gate | P0 | not started | | |
| S8 | Handoff on escalation | P0 | not started | | |
| S9 | Proof Trail | P0 | not started | | |
| S10 | Replay + live caps | P0 | not started | | |
| S11 | Docs, video, deploy | P0 | not started | | |

## Blockers
None.

## Fixtures status
- fixtures/docs/: 10 doc-example fixtures, `synthetic: true` (Clocked's published examples, not our key).
- fixtures/probe/: 10 live fixtures, `synthetic: false`, recorded 2026-11-08.
- Preset scenario fixtures: not recorded yet (commit 20).

## Decisions
- 2026-11-08: Fonts from the `geist` npm package instead of `next/font/google`, because the build sandbox cannot reach Google Fonts and builds must be reproducible offline.
- 2026-11-08: Raw `fetch` transport instead of `clocked-sdk` 0.7.0, so the app owns idempotency keys per step, reads all `X-Clocked-*` headers, and replays fixtures through the same path (the SDK's built-in retries would stack on ours). Recorded in Techspec.

- 2026-11-08: Design references chosen (docs/DESIGN.md): Merit run trace (Dribbble) for the Proof Trail, Shift Studio support ticket system (Dribbble) for chrome/cards/rows, Sentry AI agent tracing for the step inspector. Reference images linked, not committed (third-party work).
- 2026-11-08: Own 30-line FIFO limiter instead of `p-limit` (one less dependency, same behavior, unit-tested).
- 2026-11-08: shadcn/ui (radix base, nova preset) with its `cn` package; dark tokens removed from P0.

- 2026-11-08: Decide bands: auto needs auto_resolve ≥ 0.80 and self_service_safe ≥ 0.50; escalate needs escalate ≥ 0.70; anything between is a close call and confirms with the employee. Decide criteria are about request type (access, security exception, outage, physical damage), never urgency.

- 2026-11-08: Content Guard runs per KB section (not per passage) so a poisoned section is cut and the rest of the article is still used; Rerank gets all 20 recalled passages without top_n so skip reasons are shown for each.

## Assumptions
See PRD.md and /workspace PLAN (solo entry, Clocked-only AI, synthetic data, no DB).

## Verification history
- 2026-11-08 01:36 PKT: `pnpm build` pass (commit 1, 2).
- 2026-11-08 01:44 PKT: first live Clocked call (decide, 10 input tokens) → HTTP 200, `X-Clocked-Credits: 1`, `X-Clocked-Cost-Basis: reference` (trial basis, so concurrency may be 1 rather than 4; limiter must be configurable).

- 2026-11-08 02:05 PKT: commit 4 `pnpm build` + `pnpm lint` pass; headless Chrome screenshots at 1440 px and 390 px checked against R1/R2 (stacking, wrapping, focus ring present).
- 2026-11-08 02:20 PKT: commit 5 `pnpm typecheck`, `pnpm lint`, `pnpm test` (19 passed: same-key retries on 429/5xx, Retry-After, retryAsNew stop, no retry on 400/401/402/403/413/422, 409 only while recovering, timeouts, limiter peak, key never in errors), `pnpm build` pass. Live smoke through `createLiveClientFromEnv`: decide → 200, 1 credit, 11.3 model ms, transport door:east.
- Environment note: in the Hark build sandbox, Node's fetch reaches Clocked only with `NODE_USE_ENV_PROXY=1`; not needed on Vercel or a normal machine.
- 2026-11-08 02:35 PKT: `pnpm probe` (live, 37 credits total, all HTTP 200, cost basis `reference`): decide 1 · extract 3 · fill 4 · pii 5 · injection 4 · script 3 · grounding 4 · compare 5 · rerank 2 · pipeline(pii+injection) 6. Observed behavior that the agent relies on: rerank skipped the Windows article as `different_case` for a macOS user; grounding marked "restored by 2pm" `not_stated`; compare found 2 conflicts between VPN policy v1/v2; script flagged `Set-MpPreference -DisableRealtimeMonitoring $true` as malicious; pipeline stopped at injection (flagged). Saved as live fixtures in fixtures/probe/.
- Credits used so far: 39 of 20,000 (2 smoke calls + probe).
- 2026-11-08 02:40 PKT: commit 6 typecheck, lint, test (50 passed), build pass.
- 2026-11-08 02:55 PKT: commit 7: 30 synthetic articles (VPN per OS, VPN policy 2024 vs 2026 conflict, tampered printer script, poisoned MFA passage, payroll outage with no ETA), 3 personas, 8 presets; KB validation tests pass; build pass.
- Note: scenarios (data/scenarios.ts) landed with the KB in commit 7 because the BM25 recall test in commit 8 needs them; the intake UI for them is still commit 17.
- 2026-11-08 03:05 PKT: commit 8: MiniSearch 7.2 BM25 over 30 articles' `##` chunks (title×2, section×1.5, prefix ≥4 chars, fuzzy ≥6 chars, help-desk stopwords); all 8 presets have their expected articles in the top 20; neighbors for expand. typecheck, lint, test (79 passed), build pass.
- 2026-11-08 02:13 PKT: commit 9: screen step: one Pipeline call (Protect replace + Guard stop), FixProof rebuilds the safe text from the shared original offsets (PII → <TYPE>, injected spans cut, code-point safe via lib/text/offsets.ts), Guard re-checks the remainder; flagged-without-span holds the whole ticket. Tested on the live probe pipeline fixture + doc-shaped cases. typecheck, lint, test (91), build pass.
- 2026-11-08 02:14 PKT: commit 9a: CLOCKED_CONCURRENCY now defaults to 1 (Trial), invalid values fall back to 1; .env.example and Techspec updated; test added. typecheck, lint, test (92), build pass.
- 2026-11-08 02:17 PKT: commit 10: Extract (error codes, asset tag, apps, deadline, device with offsets) + Fill record (category choice, severity score, affected service, needs_admin) in parallel, then Decide (policy choice + self_service_safe noul) with the record. Live tuning on 5 tickets (~15 credits): Decide's criteria now say urgency alone is not a reason to escalate (VPN ticket went escalate 65% → auto_resolve 99%). Escalate band raised to ≥0.70 so a 54/39 split (laptop charging) is a close call → confirm. typecheck, lint, test (99), build pass.
- 2026-11-08 02:22 PKT: commit 11: BM25 top 20 (Fill category boost via boostDocument) → Rerank of all 20 with the employee as context (no top_n so every skip reason is visible) → widen expand passages to neighbouring sections and rerank once → newer superseding article pulled by metadata → one passage per article → Guard (source content) per KB section, poisoned sections cut, rest kept. Live spot check: vpn-macos skipped 7 Windows/Linux passages as different_case; mfa-poisoned cut 'Faster verification' (0.99 instruction override) and kept Steps. typecheck, lint, test (107), build pass.
- 2026-11-08 02:23 PKT: commit 12: Compare over the kept passages (≥2): conflicting pairs become one conflict card each (strongest finding, both quotes with offsets); the newer article wins and the older passage is removed before drafting; same-date conflicts stay unresolved (policy will not auto-resolve); 'same' pairs drop the weaker duplicate. typecheck, lint, test (112), build pass.

## Next actions
1. Commit 9: screening step via pipeline (pii + injection stop), cut flagged spans by code-point offsets, re-check the remainder.
2. Commit 10–15: understand, retrieve (rerank + expand + content guard), compare, draft + verify, inspect, policy + handoff.
3. Vercel: make sure data/kb and fixtures are traced into the serverless bundle (`outputFileTracingIncludes`) before the first deploy.
4. Concurrency: defaults to 1 (Trial). Set CLOCKED_CONCURRENCY=4 only after upgrading to Build.
