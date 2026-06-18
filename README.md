# DuckDB-WASM POC

Full end-to-end skeleton for the browser-native analytics pipeline described in the technical spec.

## Project structure

```
src/
  lib/
    duckdb.js        — Phase 3 + 4: WASM bundle selection, threading, storage mount
    storageTier.js   — Section 5: 3-tier storage degradation state machine
    parquet.js       — Phase 1 + 2: S3 Parquet loading with predicate pushdown
    arrow.js         — Phase 5: Apache Arrow zero-copy hand-off to React
  hooks/
    useDuckDB.js     — React hook wiring all phases together
  components/
    Dashboard.jsx    — Example dashboard with region filter + Recharts line chart
.github/
  workflows/
    ci.yml           — Section 4 Pipeline 1: dbt compile + test (PR gate)
    cd.yml           — Section 4 Pipeline 2: manifest.json deploy on main merge
vite.config.js       — Phase 3: COOP + COEP headers for SharedArrayBuffer
```

## Phase mapping

| Phase | File | What it does |
|-------|------|--------------|
| 1 — S3 pre-sort | `parquet.js` | `read_parquet()` with hive partitioning + WHERE predicate to exploit row-group MIN/MAX stats |
| 2 — Parallel scan | `parquet.js` | DuckDB parallelises row-group fetches automatically; each group = one HTTP Range Request on a separate core |
| 3 — WASM threading | `duckdb.js`, `vite.config.js` | `selectBundle()` picks `eh.wasm` (multi-thread) if COOP/COEP present, else falls back to `mvp.wasm` |
| 4 — OPFS cache | `storageTier.js`, `duckdb.js` | Probes OPFS → RAM → streaming; mounts the best available tier |
| 5 — Arrow hand-off | `arrow.js` | `conn.send()` returns Arrow IPC bytes; `tableFromIPC()` reconstructs with zero copy |

## Getting started

```bash
npm install
cp .env.example .env        # add your AWS credentials
npm run dev
```

The dev server emits COOP + COEP headers automatically (see `vite.config.js`).
Open the browser console to see which WASM bundle and storage tier were selected.

## Environment variables

```
VITE_AWS_ACCESS_KEY=...
VITE_AWS_SECRET_KEY=...
```

For production, replace static credentials with presigned S3 URLs or short-lived STS tokens.

## Storage tier behaviour

| Tier | Trigger | DuckDB path | Latency |
|------|---------|-------------|---------|
| 1 — OPFS | Standard HTTPS, not incognito | `opfs://client_analytics.db` | ~5ms |
| 2 — RAM | Incognito / strict privacy | `:memory:` | ~5ms (lost on refresh) |
| 3 — Stream | Insufficient RAM | VIEW over S3 | 300ms+ |

## Cross-origin isolation

The COOP + COEP headers are required for `SharedArrayBuffer` (multi-threaded WASM).
For Vercel, add to `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ]
}
```

For CloudFront, attach a response headers policy with the same values.
