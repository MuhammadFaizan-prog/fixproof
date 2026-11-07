# Appflow: FixProof

## Primary journey (employee, preset or free text)
1. Land on `/`: ticket pane left, Proof Trail right (stacked on mobile).
2. Pick a persona (Windows finance analyst UK / macOS designer US / Linux engineer PK) and a preset, or type a ticket.
3. Submit. The Proof Trail fills step by step over SSE.
4. Outcome banner: **RESOLVED** (reply + Run fix), **CONFIRM** (reply, "Did this fix it?" Yes/No), or **ESCALATED** (handoff card).
5. Ticket saved to browser history.

## Onboarding
No sign-up. A one-line explainer above the intake ("Every step below is a Clocked call; each shows what it changed"), and a mode chip: Replay (default for presets, and always when no key is configured) or Live.

## Screens
| Screen | Content |
|---|---|
| Intake | persona select, preset chips, textarea (60k char cap shown), Submit, mode chip |
| Ticket pane | original text with highlights: PII violet underline, extracted teal, injected red strike; masked/unmasked toggle |
| Proof Trail | one card per call: endpoint, verdict, probability bar, evidence quote, credits, ms, effect line |
| Cards | ConflictCard (two quotes side by side), ClaimChips (green supported, red removed), ScriptGate (benign → Run fix; blocked → highlighted line), HandoffCard |
| History | list of past tickets from localStorage with outcome badges |

## Core actions
Submit ticket · switch persona · continue with safe remainder (after quarantine) · Run fix (simulated log only) · confirm fixed / not fixed (not fixed → escalate) · view raw JSON of a step.

## Navigation
Single page plus a history drawer. No auth, no routes beyond `/` and API routes.

## Empty states
- No ticket yet: preset chips and one example sentence.
- Rerank returns no "use" passage: "No KB article covers this for your setup" → escalate.
- Extract nulls: shown as "not stated" chips, never blank strings.
- History empty: "Tickets you submit stay in this browser only."

## Loading states
Each pending step shows a skeleton card with the endpoint name and elapsed time. A 429 shows "Waiting for a Clocked slot (attempt n)".

## Error states
- Retries exhausted / 5xx: step card red, outcome "Clocked unavailable: ticket queued for a human" with the handoff built locally from what is known.
- 402 insufficient credits or live cap hit: switch to replay with a banner.
- Invalid input (empty, > 60k chars): inline validation, no request sent.

## Permission-denied states
Live mode when the per-IP or daily cap is reached: "Live runs are paused to protect the demo budget; presets still replay."

## Edge cases
Unicode and emoji in tickets (offsets in code points), ticket that is only an injection (nothing remains → quarantine end), article without a script (fix gate skipped and stated), Compare with one passage (skipped and stated), Verify with all claims removed (escalate).

## Mobile and responsive
Below 1024 px the Proof Trail stacks under the ticket; cards are full width; evidence quotes wrap; tap targets >= 44 px.
