# Fixtures

Saved Clocked exchanges, replayed through the same client code path as live calls (`lib/clocked/replay.ts`). Layout: `fixtures/<scenario>/<step>.json`.

| Folder | source | synthetic | What it is |
|---|---|---|---|
| `docs/` | `docs-example` | `true` | The recorded examples from Clocked's own reference pages (request + response copied verbatim). Not produced by FixProof's key, so no usage headers. Used for shape tests. |
| `probe/` | `live` | `false` | One tiny real call per endpoint plus Pipeline, recorded by `pnpm probe` on 2026-11-08 with FixProof's key. Keeps only `X-Clocked-*` usage headers and `Server-Timing`. |
| `<preset>/` | `live` | `false` | Every Clocked call of each of the 8 presets, recorded end to end by `pnpm scenario all --record` on 2026-11-08. Step files are named after the run's step ids (`retrieve:guard:mfa-new-phone#3` → `retrieve-guard-mfa-new-phone-3.json`). Re-recording a preset deletes its folder first so no stale step survives. |

Rules: never edit a live fixture by hand and keep `synthetic: false`; a hand-built response must say `synthetic: true` and `source: "docs-shape"`. No fixture may contain an Authorization header or key.
