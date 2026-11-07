# ImplementationPlan: FixProof

Deadline: Wed Nov 11 09:59 PKT (Nov 10 11:59 PM ET). Target submit: Tue Nov 10 22:00 PKT.
Every commit must pass `pnpm build`; from commit 5 on, `pnpm test` too. Push to `origin main` after each commit. No squash, no force-push.

## Milestones
| Milestone | Commits | Exit check |
|---|---|---|
| M1 Foundations | 1–6 | build green; probe script records a real response from every endpoint with credits |
| M2 Knowledge | 7–8 | unit test: the expected article is in BM25 top 20 for each preset |
| M3 Agent loop | 9–15 | **Checkpoint A** (Sun Nov 8 night): `pnpm tsx scripts/run-scenario.ts <id>` matches expected outcome for 6 presets, live |
| M4 UI + streaming | 16–19 | Playwright clicks each preset and asserts the outcome banner |
| M5 Hardening | 20–23 | forced-429 test, missing-key replay test, **Checkpoint B** (Mon Nov 9 night): live URL works |
| M6 Ship | 24–25 | live URL in incognito, repo public, form saved |

## Order change (2026-11-08)
Preset fixtures were recorded right after the agent loop (Checkpoint A ran live with `--record`), so `feat: record fixtures for all presets` landed before the SSE route. The API and UI commits then replay real runs from the start. Remaining order: SSE route → intake UI → Proof Trail → cards/banner → live caps → tests/e2e → states/mobile → docs.

## Phases and task order
1. **Scaffold + docs** (1–3). Verify: `pnpm build`.
2. **Design system** (4): shadcn/ui, tokens from docs/DESIGN.md references, base layout. Design checkpoint: screenshot reviewed against the references.
3. **Clocked client** (5): fetch transport, idempotency, backoff, credit headers, limiter. Verify: unit tests with a mocked fetch (429 → retry same key; retryAsNew → stop; 422 → no retry; headers parsed).
4. **Replay** (6): fixture store + replay transport; probe script records one small live call per endpoint. Verify: replay test with no key; probe fixtures marked `synthetic: false` only when recorded live.
5. **KB + personas** (7), **BM25** (8). Verify: index tests.
6. **Agent steps** (9–15), one step per commit, each with a unit test against fixtures.
7. **SSE + UI** (16–19).
8. **Fixtures for presets, caps, tests, states** (20–23).
9. **Docs, deploy** (24–25).

## Vertical slices
The first slice that proves value end to end is preset "VPN on macOS": screen → understand → retrieve → draft → prove → fix gate → AUTO_RESOLVED, even before the UI (CLI runner).

## Dependencies
Clocked key (connected 2026-11-08, trial-basis billing observed: `X-Clocked-Cost-Basis: reference`). GitHub repo (exists, public). Vercel project (later).

## Test checkpoints
- Unit: offsets, policy bands, client retry rules, replay lookup, BM25 recall.
- Orchestrator: mocked client per scenario.
- E2E: Playwright smoke on presets (replay).

## Security checkpoints
Before commit 16 (API route): key never reaches the client bundle (grep `.next/static` for `CLOCKED`), logs exclude ticket text. Before deploy: live caps enforced.

## Release checkpoints
Vercel preview → production; README links; demo video; LinkedIn post (Faizi approves); form submission.

## Rollback / recovery
Each commit is small and pushed; revert with a new commit (never rewrite history). If live Clocked fails during judging, replay mode keeps every preset working.

## Verification commands
```
pnpm build
pnpm test
pnpm lint
pnpm tsx scripts/probe.ts            # live, ~15 credits
pnpm tsx scripts/run-scenario.ts vpn-macos
```
