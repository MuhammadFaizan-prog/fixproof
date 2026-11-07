# DESIGN: FixProof

Direction: a calm service-desk console where the hero is the **Proof Trail**, a run trace that reads like a receipt. No generic hero, no gradient blobs, no equal card grids. Reference images are linked, not copied into the repo (they belong to their authors).

## References (researched 2026-11-08)

### R1. Merit: "The Overnight Run Trace" (AI agent app), Ilias Miah, Dribbble
https://dribbble.com/shots/27692006-Merit-The-Overnight-Run-Trace-AI-Agent-App-Animation
Why: it is exactly our problem: an agent run summarized as a funnel of steps, each saying what it dropped and why ("174 dropped: below comp floor 81, wrong location 62"). That is our "effect" line.
- **Layout:** single column, 24 px side padding; serif headline summary (2 lines) → one muted meta line → one white card holding stacked step rows separated by hairlines → a second card for a learned rule with an inline "Undo" link.
- **Step row:** left number column (~56 px, right-aligned, 26–28 px semibold, tabular), right column: title 17 px semibold, description 15 px muted, 2 lines max, then a 4 px progress bar (green fill on a pale track, fully rounded). Duration pill top-right: 12 px text on #EFEEE8, radius full, 4×10 px padding. The final row's number is green (the outcome).
- **Type scale:** headline serif ~30/36 regular; title 17/22 semibold; body 15/22; meta 14/20 muted; eyebrow 12 px uppercase, letter-spacing ~0.08em, green.
- **Spacing:** card padding 20–24 px; row vertical padding 16 px; 16 px gap between cards.
- **Colors (sampled):** canvas #EDECE5 (frame) / #FAFAF7 (screen); card #FFFFFF; hairline ≈ #E4E2DB; accent green #1E6950 / #117151; track #EEEDE7; muted text ≈ #6B6A63.
- **Components:** RunSummary headline, StepRow, DurationPill, ProgressBar, InsightCard (eyebrow + text + action link).

### R2. Support Ticket System Software UI UX, Salim Era for Shift Studio, Dribbble
https://dribbble.com/shots/23657590-Support-Ticket-System-Software-UI-UX
Why: a credible, quiet help-desk chrome in the judges' domain.
- **Layout grid:** fixed left nav (~200 px at 1440) + content; top bar ~60 px with breadcrumb ("Support / Support Overview") left and one dark primary action right; content padding 24 px; 12-col grid with 16 px gutters; 4 stat cards in a row, then 7/5 split cards.
- **Cards:** white, 1 px #E6E6E6 border, radius 12 px, no heavy shadow; card title 15 px semibold, 20 px padding; a "View all ↗" outline button 32 px tall in the card header.
- **Ticket rows:** a 4 px colored left bar per row (status color), date 14 px semibold, title 15 px medium + one-line muted preview truncated with ellipsis, status pill on the right (Overdue red-soft, Open blue-soft, Completed green-soft, Pending amber-soft); hovered row lifts with a soft shadow and shows an ↗ icon button.
- **Type:** Inter-like sans; stat number 24 px semibold; labels 14–15 px; nav 15 px with 20 px icons.
- **Colors:** page #EFEFEF, cards #FFFFFF, ink #282423, status pills on soft tints.

### R3. Sentry: AI Agent Tracing (waterfall + span inspector)
https://sentry.io/product/tracing/ai-agent/
Why: the industry pattern for "click a step, see its exact input/output", which judges will recognise.
- **Layout:** header with trace name + key metrics on the right (Issues 3 · Spans 92 · Root duration 1.41 min) as label-over-number stat stack; tabs row; split view: waterfall list left, inspector panel right with a close button and pinned span name.
- **Inspector:** title with icon, big duration number with a green "82% faster than avg" chip, key/value rows (label 15 px muted left column ~150 px, value right), Input/Output/Attributes tabs with an underline indicator, system/user message blocks on a sunken grey surface with "Show more".
- **Waterfall row:** 28 px rows, tree indent guides, colored duration bars on a time axis, selected row outlined in the accent.

## How FixProof applies them
| Area | From | Spec |
|---|---|---|
| Canvas / palette | R1 | canvas #F4F3EE, cards #FFFFFF, hairline #E4E2DB, accent #1B6B50, track #EEEDE7, muted #6B6A63 |
| Chrome | R2 | 56 px top bar: wordmark + breadcrumb "Northwind Labs / Service desk / New ticket" left; mode chip + session credits right. No fake sidebar links: only real destinations. |
| Grid | R2 | max-width 1440, 24 px padding, `lg` 12-col: ticket pane 5 cols, Proof Trail 7 cols, 24 px gap; stacks below 1024 px |
| Proof Trail | R1 | serif summary headline ("9 checks ran. 1 claim removed."), meta line (persona · mode · credits · seconds), step rows with number column = the step's key count (chunks kept, claims supported, entities masked), effect line as description, probability bar, credits/ms pill |
| Step inspector | R3 | right-side Sheet on step click: endpoint + verdict, key/value rows (credits, model ms, attempts, idempotency key prefix, transport, replay/synthetic), Request / Response tabs with JSON on the sunken surface |
| Ticket list / history | R2 | rows with 4 px status bar + outcome pill (Resolved green, Confirm amber, Escalated red) |
| Insight card | R1 | eyebrow + sentence + inline action ("Continue with the safe remainder") for quarantine and handoff notes |

## Tokens (implemented in `app/globals.css`)
- Fonts: Geist Sans (UI, from the `geist` package), Geist Mono (evidence, scripts, JSON), Newsreader (serif headline only, `font-heading`).
- Type scale: display 30/36 serif; h2 17/22 semibold; body 15/22; small 13/18; eyebrow 11–12 px uppercase tracking 0.08em.
- Spacing: 4 px base; card padding 20 px; row padding 16 px; section gap 24 px.
- Radius: cards 12 px, pills full, inputs 10 px.
- Shadow: none on cards (hairlines carry structure); `shadow-sm` only on hover rows and the open inspector.
- Semantic colors: ok #1B6B50 / #E3EFE9, warn #A15C07 / #FBF0DC, risk #B42318 / #FBE7E5, info #3F5BD8 / #E8ECFB.
- Evidence marks: PII violet #6D4FC2 underline, extracted green underline, injected red strike-through.
- Motion: 150 ms ease-out on hover/focus; step rows fade-up 200 ms as they arrive (only the Proof Trail animates).
- Focus: 2 px accent outline, 2 px offset, on every interactive element.
- Dark mode: not in P0 (removed from the scaffold tokens; P1 stretch).

## States checklist (per master prompt §11)
Empty (no ticket, no use passage, null extractions), loading (skeleton row with endpoint name + elapsed), uncertain (amber band with the probability shown), error (red row + queued-for-human outcome), long text (2-line clamp + expand), small screens (stacked panes, 44 px targets).
