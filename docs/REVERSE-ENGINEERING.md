# Reverse-engineering what wins (REA method)

Method: [REA, Reverse Engineer Anything](https://github.com/morluto/rea) (MIT). We did not install or vendor REA (its tooling targets binaries, apps and network captures); we applied its working rule: investigate the real artifact, return findings **with the evidence behind each one and its limits**, then build from the findings. Every row below cites a page we opened on 2026-11-08.

## 1. The rubric (primary source)
| Finding | Evidence | What FixProof does about it |
|---|---|---|
| Core integration is 30/100 and the tie-breaker; "a call whose result is ignored earns nothing" | [rules §7](https://clocked.rezolve.ai/build-challenge/rules), [challenge page](https://clocked.rezolve.ai/challenge) | Every Proof Trail row carries an `effect` line stating what the call changed; a step with nothing to do emits a local "skipped" row instead of a call. |
| The write-up must explain uncertain results, missing information and failed requests | rules §7 | `decideOutcome` checks + `failureMeaning(kind)`; the README section is planned from these. |
| Group awards weigh depth 40 > breadth 30 | rules §7 | Each group has a stage where its output decides the path, not just a badge. |

## 2. What Clocked praises in other entries (their own words)
Clocked's "SUBMISSION ALERT" posts end with the one design idea the team liked. Those are the closest thing to judge commentary before results.

| Entry | Idea Clocked singled out | Evidence | FixProof |
|---|---|---|---|
| Gatehouse | evidence marked on the original + a filtered copy; a **human-review band** for close calls | [post](https://www.linkedin.com/posts/clocked-ai_screen-a-github-issue-before-your-coding-activity-7521956697347915776-HWO0) | Ticket pane shows the ticket as typed with PII/injection marks and the safe copy every step reads; Decide's middle band confirms instead of guessing. |
| AgentShield | Guard's **category breakdown** turned "a red light into an explanation" | [post](https://www.linkedin.com/posts/clocked-ai_clockedchallenge-buildinpublic-activity-7521684988984086528-lFsi) | Inspector shows Guard/Inspect category distributions, not just the verdict. |
| ClockedOmniGuard | **short-circuiting**: stop a flagged workflow before later steps spend credits | [post](https://www.linkedin.com/posts/clocked-ai_clockedomniguard-10-endpoint-enterprise-activity-7522439801870917632-fyhM) | Pipeline `stop: true`; a held ticket makes no further calls; credits shown per row and per run. |
| ClientCheck PH | say when the **overall result is uncertain** even if each flag is clear | [post](https://www.linkedin.com/posts/clocked-ai_clientcheck-ph-activity-7522319089424314368-zhl0) | Outcome banner = the policy over all checks, with the deciding check named. |
| Margin | **narrow candidates locally** before sending pairs to Compare | [post](https://www.linkedin.com/posts/clocked-ai_margin-academic-integrity-review-system-activity-7521730304915451905-d6_T) | BM25 recall (local, free) → Rerank → Compare only on the kept passages. |
| KitBrief | corrections with an **exact quote**; a walkthrough that **replays captured responses** | [post](https://www.linkedin.com/posts/clocked-ai_clockedchallenge-buildinpublic-activity-7522379420796583936--7nu) | Every kept sentence shows its source quote; presets replay live recordings, labelled with their date. |
| Invoice Airlock | RELEASE / HOLD / BLOCK with an **uncertain band** | [post](https://www.linkedin.com/posts/clocked-ai_invoice-airlock-activity-7522696482450468864-NlFV) | AUTO_RESOLVED / CONFIRM_WITH_USER / ESCALATED. |

## 3. What Clocked says its product is for
"Uncertainty is explicit. Probabilities make thresholds and human-review policies part of the application. Evidence remains inspectable. Offsets and passages let a reviewer trace a result back to the supplied source." ([clocked.rezolve.ai/build-challenge](https://clocked.rezolve.ai/build-challenge)). The UI therefore shows probabilities as bars with the band thresholds drawn on them, and every highlight is an API offset.

## 4. Gaps in the field we can occupy
- Most entries are a **gate** in front of something else (Gatehouse, AgentShield, Inbox Shield, Invoice Airlock). FixProof closes the loop: ticket in, verified answer or a complete handoff out.
- A public entry we read in full ([RevisionDesk ENTRY.md](https://github.com/bgrubbs1/revisiondesk/blob/main/docs/ENTRY.md)) states "No credentialed Clocked call ... has occurred". FixProof's presets are **live recordings** (`synthetic: false`, usage headers kept) and the UI says so.
- Nobody we found uses Rerank's `different_case` or Compare's dated conflicts in the judges' own domain (IT service desk).

## Limits
Results are not announced until Nov 18, so "what wins" is inferred from the rubric and Clocked's own commentary, not from past winners. LinkedIn excerpts were read through search results; the posts are public.
