# Gauntlet loop log

Method: the gauntlet loop ([robonuggets/gauntlet-loop](https://github.com/robonuggets/gauntlet-loop), CC BY 4.0; technique by [Matt Shumer](https://github.com/mshumer/Claude-of-Duty)). For each milestone: pick a **named, fetchable, comparable bar**; a separate critic with fresh context compares ours with the bar and **picks one** (no scores); it names the single biggest gap; fix; repeat until ours wins. No code from either repo is vendored.

How we run it here: the critic is a separate browser agent with no access to the builder's context, reading the public repo/page; the builder fixes and pushes; rounds are logged below and in Tracker.md.

## Milestone 1: agent steps (commits 9–16)
**Bar:** the Clocked integration of [RevisionDesk](https://github.com/bgrubbs1/revisiondesk), a public entry in the same challenge, judged on rubric item 2 ("output changes what the app does").

### Round 1 (2026-11-08)
- **Critic pick:** FixProof (B). "Eight distinct Clocked endpoints wired across an eight-stage run where each call's output decides what the next step does ... live-recorded fixtures per preset, local handoff fallback." RevisionDesk: three endpoints once each, synthetic fixtures only, no retry.
- **Biggest gap named:** Decide's probabilities are reduced to a band by fixed thresholds. *Builder response:* the thresholds are the human-review band Clocked itself recommends; the real gap is that the UI must show the full distribution with the thresholds drawn, so the band is inspectable. Moved to the Proof Trail spec (commit: UI).
- **Smaller gaps:** (1) replay vs live not visible in the UI → UI shows "Recorded live, <date>" per row; (2) `runTicket` treated every failure kind the same → **fixed**: `failureMeaning(kind)` separates busy (retryable, P3), refused key/credits (P2, operator alert), invalid/unreadable, internal; tested with a 429 that outlasts the retry budget; (3) "no tests of retry paths" → already covered by 19 client tests in `tests/clocked-client.test.ts` (critic read only the replay test).
- **Exit:** ours picked over the bar. Next bar is harder: the UI milestone is judged against R1 Merit and R3 Sentry screenshots.
