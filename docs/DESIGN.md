# DESIGN: FixProof (direction D)

Direction (Faizi, 2026-11-08): **one reference, D**, followed closely at the level of layout grid, panel arrangement, palette, type scale, spacing, radii, borders/shadows, and chip, bar and list styles, then mapped onto FixProof's own content. Nothing is copied from it: no logo, brand name, illustration, avatar, icon or copy. Icons are lucide; every word is ours. The reference image is linked, not committed (it belongs to its author).

The earlier references (Merit run trace, Shift Studio support desk, Sentry agent tracing) and the secondary reference B (Aivia ticket page) are retired; B was dropped entirely.

## Reference
**D. OrchestrateIQ: AI Agent Management Product**, Nizam, Dribbble
https://dribbble.com/shots/27743423-OrchestrateIQ-AI-Agent-Management-Product
(Retired: B. Aivia AI Customer Support Dashboard, Ticket Page, Ryan Indra, https://dribbble.com/shots/26990881-Aivia-AI-Customer-Support-Dashboard-Ticket-Page)

## What was measured from D
The shot is a 4× export (6400 × 4800) of a 1600 × 1200 canvas, so a 25 % downscale gives 1 CSS px per pixel. Values below were read from crops of that downscale (ImageMagick) and pixel samples.

| Element | D (1×) | FixProof (1440) |
|---|---|---|
| Top bar | three floating white pill groups on the canvas: name (66 px tall), centre nav (active item a solid blue pill ~50 px), status chip + account | name pill 56 px (mark in a 40 px tinted circle), centre pill of real in-page anchors (Tickets · Proof trail · Evidence, active = primary pill 44 px), mode chip + session credits |
| Grid | icon rail ~74 px · main panel stack · right rail ~400 px, ~20 px gutters | ticket queue 340 · main (fluid, ~676) · rail 344, 20 px gutters; each column scrolls on its own at ≥1280 px |
| Panels | ~28–32 px radius, near-white fill barely above the canvas, no visible shadow | `rounded-[28px]`, fill `--panel` #FBFCFC, 1 px hairline #E3E9E9, no shadow |
| Header panel | breadcrumb 14 px muted · title ~40 px weight 500 + dot status chip · 15 px muted meta line · uppercase label · node card → violet connector with a metrics pill → node card · two action pills top right | same structure: breadcrumb (Service desk › preset id › Proof trail), 36/44 weight-500 title + outcome chip, persona meta line, "Ticket path": employee node → violet connector carrying credits / model / calls / checks → outcome node; actions "Replay again" (outline) and "Inspect a call" (primary) |
| Node cards | white, ~20 px radius, soft drop shadow, 44 px tinted icon circle, 18 px title + 13 px muted line | `rounded-[20px]`, shadow `0 2px 10px rgba(15,23,25,.05)`, 44 px circle, 17/24 title + 13/18 sub |
| Table panel | 28–30 px title, count chip top right, 12–13 px uppercase column labels, each row a separate white box ~41 px tall, ~18 px radius, 13 px gap, status chip right | outcome receipt: 28/36 title + "n of n sentences supported" chip; columns Sentence · Source · Status; rows are 18 px boxes with 8 px gaps; status chip right |
| Highlighted row | light mint fill | final trail row tinted by outcome (`--ok-wash` / `--warn-wash` / `--risk-wash`), removed sentences red wash |
| Callout | mint pill, 15 px green text with a check-circle icon | `Callout`: `rounded-[20px]`, `--ok-tint` #DCFBE6 + #0B5A2B (or warn/risk tints), lucide icon |
| Bar | 12 px yellow fill on a grey track, label row above | 6 px bars (`fp-bar`, grow from 0), primary for confidence, gold/red by meaning, label + bold % to the right |
| Recent runs | plain rows ~35 px pitch, id · coloured dot + state · numbers · time | "Recent runs · this browser": preset id · outcome dot + label · credits · time |
| Rail | uppercase label, 2 × 2 stat tiles (~16 px radius, 14 px label, ~24 px value), section with tinted badge icon, mint callout, list cards with green dots | "Run health · this ticket" 2 × 2 tiles (credits, model time, Clocked calls, checks passed); "Evidence" with a violet badge icon and tabs (Ticket / Sources / Script / Handoff); "Employee scope" list card with green dot |

## Tokens (implemented in `app/globals.css`)
Palette (from D, chosen by Faizi), with derived shades where AA text needs them. Contrast ratios computed with the WCAG formula.

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--background` | #F4F7F7 | canvas | ink 16.9:1 |
| `--panel` | #FBFCFC | big panels | muted 8.2:1 |
| `--card` | #FFFFFF | rows, tiles, nodes | |
| `--foreground` | #0F1719 | ink | |
| `--muted-foreground` | #435051 | muted ink | 8.4:1 on white, 7.8:1 on canvas |
| `--neutral` | #B8B8B8 | control borders, idle marks | non-text |
| `--hairline` / `--border` | #E3E9E9 | panel and row borders (light tint of the neutral) | non-text |
| `--primary` | #0C21D4 | electric blue: active nav, primary buttons, confidence bars | white on it 9.6:1; on white 9.6:1 |
| `--primary-soft` | #E7EAFC | selected rows, tinted icon circles | primary text 8.0:1 |
| `--ok-soft` | #B6F8CC | mint: Resolved chips | text #0B5A2B 6.9:1 |
| `--ok-tint` / `--ok-wash` | #DCFBE6 / #EEFDF3 | callout / resolved row wash | #0B5A2B 7.6:1 / 8.0:1 |
| `--ok-fill` | #2FBF6B | dots | non-text |
| `--violet` / `--violet-soft` | #4B3A9E / #EEEAFB | evidence badge | 7.4:1 |
| `--mark-pii` | #BAACEB | PII underline (accent from D) | non-text; ink on it 8.8:1 |
| `--violet-line` | #8E78E8 | ticket-path connector | non-text |
| `--warn-fill` | #BB9C27 | gold: Confirm dots, resolved-conflict bars | non-text |
| `--warn` / `--warn-soft` | #6B5610 / #F7F0D6 | Confirm chips | 6.2:1 |
| `--risk` / `--risk-soft` | #B42335 / #FDE8EB | Escalated chips, blocked script lines | 5.5:1 (6.5:1 on white) |
| `--risk-fill` | #D6374B | dots, escalate bars | non-text |

- **Type:** Geist Sans for everything (Newsreader removed, dependency dropped), Geist Mono for ids, passage chips, scripts and JSON. Scale: page title 36/44 w500 −0.02em (30/38 mobile); panel title 28/36 w500 −0.015em (24/32 mobile); queue/composer titles 22/32; node title 17/24; row title 15/22 w500; body 15/22 and 14/21; meta 13/18–19; labels 12/16 uppercase w500 +0.06em; chips 12–14 w500; stat value 24/30 w500.
- **Radii:** panels 28, path nodes 20, list rows / textarea / call rows 18 (call rows 12), stat tiles 16, chips and buttons full.
- **Shadow:** none on panels and rows; only path nodes and the metrics pill (`0 2px 10px rgba(15,23,25,.05)`); the inspector sheet keeps its own.
- **Spacing:** 4 px base; panel padding 28 px (20 mobile); 20 px between columns and panels; 8 px between list rows.
- **Motion:** rows fade/slide in 180 ms (`fp-row-in`); bars grow from 0 over 420 ms (`fp-bar`); skeleton shimmer for running/pending steps; 150–200 ms colour transitions. No backdrop blur anywhere (sheet overlay is a flat 20 % ink). `prefers-reduced-motion` turns all of it off and replays without staggering.
- **Replay pacing:** `lib/client/pace.ts`: each finished step waits 80–150 ms scaled from its recorded model time, compressed to ≤1.9 s total; the result lands 120 ms after the last step. Live runs stream as before.
- **Focus:** 2 px primary outline, 2 px offset, on every interactive element.

## Layout
- **Desktop ≥1280:** compact pill top bar; three columns, each its own scroll: ticket queue + composer | run header → outcome receipt → Proof Trail → recent runs | run health, evidence tabs, employee scope. No long page.
- **1024–1279:** queue left, run view and rail stacked right; page scroll.
- **Mobile 390:** one column; after a run the order is run header → outcome → trail → recent runs → rail → queue/composer, so the outcome comes first. Trail rows put the bar, count and credits on their own line.

## Proof Trail row
Icon circle (lucide per stage: ShieldCheck, ScanText, Search, GitCompareArrows, PenLine, BadgeCheck, FileCode2, Flag) · 2-digit step number · title · count chip · one-line result (full when open) · confidence bar with label + % (Decide shows its three-way split) · credits · ms · chevron. Collapsed by default; opening a stage lists its Clocked calls as small boxed rows, each opening the step inspector (endpoint, verdict, credits, model time, attempts, idempotency prefix, transport, recording date, Effect / Request / Response).

## States checklist
Idle (pending timeline with each stage's promise, dashed icon circles, "–" metrics), running (skeleton receipt, shimmer on the running stage, pending stages dimmed), uncertain (gold band, Decide split with thresholds), error (red banner + queued-for-human outcome), long text (one-line clamp, full on expand), small screens (single column, 44 px targets).
