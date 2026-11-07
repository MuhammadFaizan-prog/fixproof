# Schema: FixProof

**No database.** State lives in four places: committed KB markdown, committed fixtures, in-memory server state (BM25 index, rate-limit counters), and browser localStorage (ticket history). All boundaries are validated with zod in `lib/**/types.ts`.

## KB article (`data/kb/*.md`)
Frontmatter:
| Field | Type | Rule |
|---|---|---|
| id | string | kebab-case, unique, equals file name |
| title | string | <= 120 chars |
| category | enum | network, identity, hardware, software, printing, security, accounts |
| os | enum[] | windows, macos, linux, any |
| region | enum[] | uk, us, pk, any |
| updated | date (YYYY-MM-DD) | used to resolve Compare conflicts (newer wins) |
| supersedes | string? | id of an older article |
| has_script | boolean | true when the body has a fenced script block |
| script_lang | enum? | powershell, bash, zsh |
| synthetic | true | all KB content is fictional |

Body: markdown sections (`##`). A section is the chunk unit; a fenced script belongs to its section.

## KB chunk (in memory)
`{ id: "<article>#<n>", articleId, index, title, section, text, os, region, updated, hasScript }`. Neighbors: `index - 1` and `index + 1` in the same article.

## Persona (`data/personas.ts`)
`{ id, name, role, os, device, region, department, approvedScope }`. Names are fictional.

## Scenario (`data/scenarios.ts`)
`{ id, title, personaId, text, expects: { outcome, proves } }`.

## Fixture (`fixtures/<scenario>/<step>.json`)
```
{ "synthetic": boolean, "recorded_at": "YYYY-MM-DD" | null, "source": "docs-shape" | "live",
  "endpoint": "pipeline" | "decide" | ..., "request": {...},
  "response": {...}, "headers": { "x-clocked-credits": "7", ... } }
```
`synthetic: true` means the response was built from the documented shape, not returned by the API. Live recording overwrites with `synthetic: false`, `source: "live"`.

## StepEvent (SSE)
`{ step, endpoint, status: "running" | "ok" | "error" | "skipped", verdict?, probability?, evidence?, credits?, modelMs?, ms, attempts, effect, replay: boolean, synthetic: boolean }`.

## Ticket history (localStorage key `fixproof.history.v1`)
`{ id, createdAt, personaId, maskedText, outcome, credits }[]`, max 50 entries, masked text only (never raw PII).

## Ownership, retention, deletion
History belongs to the browser and is cleared from the History drawer. Server keeps no ticket data; logs exclude ticket text.

## Seed data
~30 KB articles including: a VPN v1/v2 conflict pair, a tampered printer script (`Set-MpPreference -DisableRealtimeMonitoring $true`), a poisoned passage for content Guard, Windows/macOS/Linux variants of the same fix for `different_case`.

## Migrations
None. Fixture format is versioned by its keys; a breaking change bumps the history key (`.v2`).

## Open questions
Whether to store per-step credit totals in history for a "cost this week" view (P1).
