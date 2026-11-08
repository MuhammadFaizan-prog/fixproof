# VALUE.md: what FixProof is worth to a service desk

**Short version:** a full FixProof run costs a median of **37 Clocked credits (≈ $0.0089)** per ticket. A Level 1 ticket costs about **$20** fully loaded. So the Clocked spend is small next to the cost of the tickets it can close, and the bigger value is safety: on the same 32 tickets, a naive Tier-0 bot would have shipped a wrong or unsafe answer on **20**, FixProof on **1**.

Every figure is labelled:
- **[cited]** comes from a published source, linked.
- **[measured]** comes from FixProof's own locked eval ([EVAL.md](EVAL.md), [`eval/scorecard.json`](eval/scorecard.json)).
- **[inferred]** is my own reasoning or arithmetic on those figures. It is not a measurement.

---

## Who it is for

**[inferred]** IT service-desk leads and IT directors at companies of roughly 500 to 5,000 employees, and managed service providers running Level 1 for clients. Their problem is Level 1 volume on repeat tickets, plus the risk that an AI desk ships a confident wrong or unsafe fix. FixProof covers both halves of a Tier-0 desk: it resolves the simple tickets, and the rest reach a person already analysed, with the masked ticket, the failed check and what was already tried.

## Cited inputs

| Fact | Value | Source |
|---|---|---|
| Fully loaded Level 1 ticket, North America | ~$20 | [cited] MetricNet, https://www.metricnet.com/resources/the-unexpected-effect-of-ai-on-desktop-support-and-field-services |
| Desktop support / field services ticket | ~$70 / ~$200 | [cited] same MetricNet page |
| Escalation costs add up (L1 + L2) | $22 + $62 = $84 (example) | [cited, secondary excerpt] MetricNet roundup, https://www.metricnet.com/resources/it-support-metrics-roundup |
| Assisted vs self-service contact, median | $13.50 vs $1.84 | [cited] Gartner, https://www.gartner.com/en/documents/5164231 (customer service, **not IT-specific**) |
| Autonomous resolution on common ticket types | 60–80% | [cited] Rezolve.ai platform claim, https://www.rezolve.ai/teams/it (vendor claim, not FixProof's) |
| Clocked Build plan price | $0.24 per 1,000 credits | [cited] https://clocked.rezolve.ai/pricing |

## FixProof's measured cost and speed

On the 32 locked eval tickets (run 1, pre-tuning):

| Measure | Value | Label |
|---|---|---|
| Credits per ticket | median 37, p95 55 | [measured] |
| Clocked cost per ticket at $0.24 / 1,000 credits | median ≈ $0.0089, p95 ≈ $0.0132 | [measured credits × cited price] |
| Model time per ticket | median 804 ms, p95 1,148 ms | [measured] |
| Live wall time per ticket (concurrency 1) | median 4.7 s, p95 6.9 s (24 live cases) | [measured] |
| Outcomes | 10 resolved, 12 confirm with the employee, 10 handed to a person | [measured] |

Credits are the summed `X-Clocked-Credits` headers of FixProof's own calls for each ticket.

## The cost comparison

- **[inferred]** Clocked cost per ticket is about **0.04%** of a $20 Level 1 ticket ($0.0089 ÷ $20).
- **[inferred]** Break-even: running *every* ticket through FixProof pays for its Clocked credits once it fully resolves about **1 in 2,250** tickets that would otherwise reach Level 1 ($20 ÷ $0.0089 ≈ 2,252).
- **[inferred]** Tickets that end as *confirm* or *handed to a person* still spend credits. That spend is included in the median above, because the median is across all 32 tickets and all three outcomes.

## The safety value

This is the part a cost-per-ticket figure misses. On the same 32 tickets ([EVAL.md](EVAL.md)):

| | Naive Tier-0 bot (simulated baseline) | FixProof |
|---|---|---|
| Tickets where a wrong or unsafe answer would ship | 20 / 32 | 1 / 32 |
| Showed a fix script that Inspect blocks (it disables antivirus) | 3 | 0 |
| Passed an injected instruction to the model | 4 | 0 |
| Drafted from an article for a different OS or setup | 11 | 1 |
| Sentences Verify could not support | 34 of 160 | 0 shown |
| Auto-resolved a ticket that needs a person or a question | n/a (answers everything) | 0 / 12 |

**[inferred]** A desk that deflects tickets by shipping wrong steps does not save the $20. The employee comes back, and the ticket then costs Level 1 plus whatever the wrong fix broke. The escalation example above ($22 + $62) shows how costs add up once a ticket moves up a tier. FixProof stops when a check fails rather than guessing, so its savings come only from tickets it can actually close.

The one FixProof miss (`c-guest-wifi-scope`) was not auto-resolved (it went to the employee to confirm), but its reply would have mentioned guest codes that do not work at that office. See EVAL.md.

---

## Worked example: ILLUSTRATIVE ONLY

> **Illustrative.** These inputs are editable assumptions, not a production measurement. The auto-resolve share is a placeholder: FixProof's eval set was built to be hard (23 of its 32 tickets are injection, poisoned-KB, tampered-script, conflict, wrong-OS, ambiguous or outage-bait cases; 9 are routine), so its 10 / 32 resolved rate is **not** a forecast for a real desk's mix.

Assumptions:
- A desk receives **1,000 tickets a month**, and every one runs through FixProof. [assumption]
- FixProof fully resolves **30%** of them (*r* = 0.30). [assumption; a real value must come from a pilot on that desk's tickets]
- Each resolved ticket avoids one Level 1 ticket at **$20**. [cited cost; treating it as fully avoided is an inference]
- Clocked cost is **$0.0089 per ticket**, the measured median. [measured × cited]

Arithmetic:

| Line | Calculation | Result |
|---|---|---|
| Clocked spend for all tickets | 1,000 × $0.0089 (37,000 credits × $0.24 / 1,000) | **≈ $8.88 / month** |
| Level 1 cost avoided | 1,000 × 0.30 × $20 | **$6,000 / month** |
| Net, before any platform or staff cost | $6,000 − $8.88 | **≈ $5,991 / month** |

**[inferred]** What this leaves out: hosting, integration with the desk's ticketing system, knowledge-base upkeep, the technician time spent on *confirm* and *handoff* tickets (which the handoff record aims to shorten but which FixProof has not measured), and any residual cost on a resolved ticket. Change *r* and the cost per ticket to your own numbers; the Clocked line stays small at any plausible volume.

---

## What is not claimed

- No measured deflection rate on a real desk. All data is synthetic.
- No measured technician time saved per handoff.
- The Gartner figure is customer service, not IT, and is used only to show the general assisted-vs-self-service gap.
- The 60–80% autonomous-resolution figure is Rezolve's own platform claim, cited as market context, not as FixProof's performance.
