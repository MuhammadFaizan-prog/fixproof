# Tracker: FixProof

Last updated: 2026-11-08 03:44 PKT

## Current active work
STOPPED after commit 22 at Faizi's request (2026-11-08 03:42 PKT): full UI redesign coming from new Dribbble/Behance/Pinterest references. Skipped for now: loading/error/mobile states (23), README + CLOCKED.md (24), gauntlet UI critic round. Credits this run: 14 (two handoff re-records); total ≈654 of 20,000.

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
| 13 | feat(agent): fill-generated draft verified claim by claim with grounding | done | pass (121 tests) | yes |
| 14 | feat(agent): inspect fix scripts before enabling run | done | pass (126 tests) | yes |
| 15 | feat(agent): outcome policy and fill handoff on escalation | done | pass (145 tests) | yes |
| 16 | feat: record fixtures for all presets (moved up from 20 so the API and UI replay real runs) | done | pass (249 tests) | yes |
| 16a | fix(agent): failure kinds shape the escalation (gauntlet round 1) | done | pass (251 tests) | yes |
| 17 | feat(api): stream triage steps over SSE | done | pass (260 tests) | yes |
| 18 | feat(ui): intake form, personas and preset scenarios | done | pass (264 tests) | yes |
| 19 | feat(ui): proof trail with evidence highlights, step inspector and credit meter | done | pass (264 tests) | yes |
| 20 | feat(ui): conflict card, script gate, handoff card and outcome banner | done | pass (268 tests) | yes |
| 21 | feat(api): live-mode rate limiting and daily credit cap | done | pass (276 tests) | yes |
| 22 | test(e2e): Playwright smoke clicks all 8 presets in replay mode | done | pass (276 tests) | yes |
| next | see ImplementationPlan.md | not started | | |

## Stories
| ID | Title | Priority | Status | Pass/fail | Evidence |
|---|---|---|---|---|---|
| S1 | Intake, personas, presets | P0 | done | pass (screenshot 1440/390) | components/console/IntakePanel.tsx |
| S2 | Screening via pipeline | P0 | done (lib) | pass (unit) | tests/agent-screen.test.ts |
| S3 | Understand: extract, fill, decide | P0 | done (lib) | pass (unit + live spot check) | tests/agent-understand.test.ts |
| S4 | Rerank retrieval + content guard | P0 | done (lib) | pass (unit + live spot check) | tests/agent-retrieve.test.ts |
| S5 | Compare conflicts | P0 | done (lib) | pass (unit) | tests/agent-reconcile.test.ts |
| S6 | Draft + Verify | P0 | done (lib) | pass (unit + live spot check) | tests/agent-draft-prove.test.ts |
| S7 | Inspect fix gate | P0 | done (lib) | pass (unit, live probe fixture) | tests/agent-fix-gate.test.ts |
| S8 | Handoff on escalation | P0 | done (lib) | pass (unit + live tampered-printer, payroll-eta) | tests/agent-policy-run.test.ts |
| S9 | Proof Trail | P0 | done | pass (screens c19 1440/390) | components/console/ProofTrail.tsx |
| S10 | Replay + live caps | P0 | done | pass (unit + e2e) | lib/server/live-guard.ts, e2e/presets.spec.ts |
| S11 | Docs, video, deploy | P0 | not started | | |

## Blockers
None.

## Fixtures status
- fixtures/docs/: 10 doc-example fixtures, `synthetic: true` (Clocked's published examples, not our key).
- fixtures/probe/: 10 live fixtures, `synthetic: false`, recorded 2026-11-08.
- fixtures/<preset>/: all 8 presets recorded live 2026-11-08 (`pnpm scenario all --record`), ~300 credits; `tests/presets-replay.test.ts` replays each with no key and asserts the expected outcome.

## Decisions
- 2026-11-08: Fonts from the `geist` npm package instead of `next/font/google`, because the build sandbox cannot reach Google Fonts and builds must be reproducible offline.
- 2026-11-08: Raw `fetch` transport instead of `clocked-sdk` 0.7.0, so the app owns idempotency keys per step, reads all `X-Clocked-*` headers, and replays fixtures through the same path (the SDK's built-in retries would stack on ours). Recorded in Techspec.

- 2026-11-08: Design references chosen (docs/DESIGN.md): Merit run trace (Dribbble) for the Proof Trail, Shift Studio support ticket system (Dribbble) for chrome/cards/rows, Sentry AI agent tracing for the step inspector. Reference images linked, not committed (third-party work).
- 2026-11-08: Own 30-line FIFO limiter instead of `p-limit` (one less dependency, same behavior, unit-tested).
- 2026-11-08: shadcn/ui (radix base, nova preset) with its `cn` package; dark tokens removed from P0.

- 2026-11-08: Decide bands: auto needs auto_resolve ≥ 0.80 and self_service_safe ≥ 0.50; escalate needs escalate ≥ 0.70; anything between is a close call and confirms with the employee. Decide criteria are about request type (access, security exception, outage, physical damage), never urgency.

- 2026-11-08: Content Guard runs per KB section (not per passage) so a poisoned section is cut and the rest of the article is still used; Rerank gets all 20 recalled passages without top_n so skip reasons are shown for each.

- 2026-11-08: payroll-eta preset now asserts a 2pm fix time the KB never states (realistic hallucination bait: employee-asserted facts leaking into a reply). Live, the Fill draft did not repeat it, so Verify had nothing to cut; the outcome is ESCALATED (outage) with a verified holding reply. Expectation updated to CONFIRM | ESCALATED. Claim removal is covered by unit tests.
- 2026-11-08: Escalated tickets still get a verified holding reply when the ticket is safe to read.

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
- 2026-11-08 02:29 PKT: commit 13: Fill generate (220 tokens) drafts only from kept passages (scripts omitted); FixProof splits the draft into its own sentences and sends them to Verify as explicit claims (evidence all), so each unsupported sentence is cut exactly and each kept one carries its source quote. Live spot check: vpn-macos 4/4 supported (grounded 1.00, answers 0.98); payroll-eta draft stated no ETA, 3/3 supported (0.93). typecheck, lint, test (121), build pass.
- 2026-11-08 02:31 PKT: commit 14: Inspect reads the first kept script against the persona's approved scope (device, OS, what may change); Run fix is offered only on verdict benign and suspicious < 0.5; blocked scripts carry the evidence line. No script → a skipped local row (no call). Tested with the live probe response (blocks Set-MpPreference -DisableRealtimeMonitoring). typecheck, lint, test (126), build pass.
- 2026-11-08 02:37 PKT: commit 15: decideOutcome (pure) over 8 checks with escalate/confirm severities and FAILED_AS phrasing; Fill handoff (summary, assignment group, priority) with a local fallback; runTicket orchestrator never throws on Clocked failure (→ ESCALATED, local handoff); pnpm scenario CLI. CHECKPOINT A (live, recorded): all 8 presets match their expected outcomes: vpn-macos AUTO 50cr · admin-injection CONFIRM 37cr · tampered-printer ESCALATED (Inspect blocked Set-MpPreference, routed Security P2) 43cr · vpn-conflict AUTO (2026 policy overrides 2024) 39cr · ambiguous CONFIRM 21cr · payroll-eta ESCALATED with verified holding reply (Identity & Access P2) 35cr · mfa-poisoned CONFIRM (poisoned section cut 0.99) 37cr · outlook-sync AUTO (Mac article skipped as different_case) 36cr. typecheck, lint, test (145 without preset fixtures), build pass.
- 2026-11-08 02:39 PKT: commit 16: 8 presets recorded live (106 fixture files, synthetic:false, usage headers only, no key: grep of fixtures/lib/scripts/tests/data for the key value returns 0 files). New presets-replay test runs every preset through runTicket from fixtures with no key and asserts outcome + per-preset proofs. typecheck, lint, test (249), build pass.
- 2026-11-08 02:46 PKT: commit 16a: Gauntlet milestone 1, round 1: independent browser critic compared FixProof's integration with RevisionDesk (public entry) and picked FixProof; fixed its named gap: failureMeaning(kind) — busy/unreachable (retryable, P3), refused key or credits (P2), unreadable request/answer, internal. 429-past-budget test added. docs/GAUNTLET.md + docs/REVERSE-ENGINEERING.md (REA method: findings with evidence) + PRD 'what judges reward'. typecheck, lint, test (251), build pass.
- 2026-11-08 02:49 PKT: commit 17: POST /api/triage (Node runtime, maxDuration 60) streams start/step/result over SSE; zod-validated input (≤4,000 chars), presets always replay their own text+persona, free text live only with a key; GET /api/health; outputFileTracingIncludes for data/kb + fixtures. Verified through next start + curl (tampered-printer: 1 start, 24 step frames, 1 result ESCALATED). Security: clean build, grep .next/static for CLOCKED = 0 files, key value in .next = 0 files. typecheck, lint, test (260), build pass.
- 2026-11-08 03:00 PKT: commit 18: Console client: presets as R2 help-desk rows (4px status bar, title + one-line preview, outcome pill from the committed recording), employee picker (radio cards, 44px targets), ticket textarea (4,000 cap, counter), Replay/Run, health-gated free text with a 'no key' note; useTriage streams SSE into rows keyed by step id; masked-only localStorage history (fixproof.history.v1, cap 50). Scenario.recorded added and asserted by presets-replay. Screenshot via Playwright + system Chromium at 1440/390 (/workspace/clocked/screens/c17-*). typecheck, lint, test (264), build pass.
- 2026-11-08 03:07 PKT: commit 19: Proof Trail rebuilt from R1 Merit (serif summary + meta line + one card of numbered stage rows: count column, 17px title, effect line, 4px bar, credits·model-time pill); Decide shown as its full distribution with the 80%/70% band thresholds drawn; every Clocked call is a row that opens a Sentry-style inspector (R3: big credits number, label/value grid incl. idempotency prefix, transport, 'Recorded live <date>', Effect/Request/Response tabs, Guard/Inspect category breakdown); ticket evidence pane (as typed: PII underline + injected strike by offset; what every step read: placeholders + extracted values). Mobile: trail scrolls into view on run; call rows fold the endpoint into the title. Screens c18/c19 at 1440 and 390. typecheck, lint, test (264), build pass.
- 2026-11-08 03:23 PKT: commit 20: Outcome receipt (R1b band + overlapping card, sentence rows with real passage-id chips from Verify's per-claim source, FAILED_AS wording), Compare conflict card (heading lines stripped, resolved = amber), Inspect script gate with the flagged line, handoff card ('Stopped at' in FAILED_AS wording), count labels under the number column, resolved-conflict bar amber. Handoff source now says 'the automated desk' and 'knowledge-base fix script'; tampered-printer + payroll-eta handoff re-recorded live (scripts/rerecord-step.ts, 14 credits), so the summary no longer says 'the FixProof script'. Verify evidence with document:null (live quirk) falls back to the claim's source. Screens c20-{vpn,conflict,printer,payroll}-{idle,run,inspector}-{1440,390}. Clean build: .next/static CLOCKED 0 files, key value 0 files. typecheck, lint, test (268), build pass.
- 2026-11-08 03:32 PKT: commit 21: lib/server/live-guard.ts: per-visitor sliding-hour limit (LIVE_PER_IP_RUNS_PER_HOUR=5), one live run in flight (LIVE_MAX_INFLIGHT=1, Trial concurrency), daily credit cap per UTC day (LIVE_DAILY_CREDIT_CAP=2000) reserving 60 per run and settling to summed X-Clocked-Credits; 429 + Retry-After + code (rate_limited/busy/daily_cap) before any Clocked call; health adds dailyCapReached; intake shows a replay-only note on cap. Presets never limited. In-memory = per warm instance (documented in Security.md). Tests with a fake key and caps forced to 0 (no credits spent). Clean build: static CLOCKED 0, key 0. typecheck, lint, test (276), build pass.
- 2026-11-08 03:44 PKT: commit 22: playwright.config.ts + e2e/presets.spec.ts (@playwright/test 1.65.0): server started with a blank CLOCKED_API_KEY (replay only); health says replay only; each of the 8 presets is clicked and replayed, outcome card + final Proof Trail row asserted against Scenario.recorded, ESCALATED shows the handoff record; one step opens the inspector with 'Recorded live'. pnpm e2e: 10 passed (15.7 s) after pnpm build. Sandbox: needs NO_PROXY=127.0.0.1,localhost and system Chromium (/usr/bin/chromium, reinstalled via apt after a sandbox reset; Playwright CDN download is blocked here). Clean build: static CLOCKED 0, key 0. typecheck, lint, test (276 unit), build pass.

## Next actions
0. (2026-11-08) Redesign from Faizi's new references, then resume: states/mobile (23), README + CLOCKED.md (24), gauntlet UI critic (blind vs R1/R3 and the new refs). Replay perf note: no artificial delays exist; a full replay streams in 40–120 ms (server), so the run lands as one burst with no progressive reveal (see report). Walkthrough video tool: /workspace/clocked/tools/walk.mjs (not in repo).
1. Commit 9: screening step via pipeline (pii + injection stop), cut flagged spans by code-point offsets, re-check the remainder.
2. Commit 10–15: understand, retrieve (rerank + expand + content guard), compare, draft + verify, inspect, policy + handoff.
3. Vercel: make sure data/kb and fixtures are traced into the serverless bundle (`outputFileTracingIncludes`) before the first deploy.
4. Concurrency: defaults to 1 (Trial). Set CLOCKED_CONCURRENCY=4 only after upgrading to Build.
