# Fixtures

Saved Clocked exchanges, replayed through the same client code path as live calls (`lib/clocked/replay.ts`). Layout: `fixtures/<scenario>/<step>.json`.

| Folder | source | synthetic | What it is |
|---|---|---|---|
| `docs/` | `docs-example` | `true` | The recorded examples from Clocked's own reference pages (request + response copied verbatim). Not produced by FixProof's key, so no usage headers. Used for shape tests. |
| `probe/` | `live` | `false` | One tiny real call per endpoint plus Pipeline, recorded by `pnpm probe` on 2026-11-08 with FixProof's key. Keeps only `X-Clocked-*` usage headers and `Server-Timing`. |
| `<preset>/` | `live` | `false` | Per-step recordings of each preset scenario (added with the agent loop). |

Rules: never edit a live fixture by hand and keep `synthetic: false`; a hand-built response must say `synthetic: true` and `source: "docs-shape"`. No fixture may contain an Authorization header or key.
