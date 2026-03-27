# Lab 8 - Profiling and Performance Optimization

## Scope and goals

This profiling pass targets the Node.js/Express backend in `server/` with focus on:

- CPU-heavy request paths (`/api/history`, `/api/favorites`, auth bcrypt checks)
- store serialization overhead (`data.json` writes)
- event-loop responsiveness under CPU-bound operations

## Tooling used

- `node:perf_hooks` for deterministic micro-benchmarks
- `process.memoryUsage()` for memory snapshots
- synthetic dataset generator inside benchmark script
- manual runtime profiling hooks:
  - `node --cpu-prof src/index.js`
  - `node --heap-prof src/index.js`

Profiling script:

```bash
cd server
npm run profile:hotspots
```

## Key metrics

- **avg operation time (ms)** for hotspot functions
- **event-loop block percent** for auth checks (lower is better)
- **memory snapshot (RSS / heapUsed MiB)** during benchmark

## Test scenarios and dataset

Synthetic dataset (in `server/scripts/profile-hotspots.mjs`):

- users: `800`
- history rows: `120000`
- favorites rows: `80000`
- target user for reads: `u-42`
- result caps:
  - history: top `80`
  - favorites: top `100`

Benchmark runs compare:

1. **Before** (baseline implementation)
2. **After** (optimized implementation)

## Baseline hotspots (before optimization)

1. `GET /history` selection (`filter + sort + Date parsing`)
2. `GET /favorites` selection (`filter + sort + Date parsing`)
3. Store persist serialization (`JSON.stringify(..., null, 2)`)
4. Auth password validation (`bcrypt.compareSync`) causing high event-loop blocking

## Implemented optimizations

### 1) Read paths (`history`, `favorites`)

Files:

- `server/src/routes/historyRoutes.js`
- `server/src/routes/favoritesRoutes.js`

Changes:

- added persisted `created_at_ms` timestamp on insert
- replaced comparator `new Date(...).getTime()` with cached numeric timestamp via `createdAtMs()`
- kept result capped (`slice(limit)`) with the same response shape

### 2) Auth CPU path

File:

- `server/src/routes/authRoutes.js`

Changes:

- replaced blocking calls:
  - `bcrypt.hashSync` -> `await bcrypt.hash`
  - `bcrypt.compareSync` -> `await bcrypt.compare`
- handlers switched to `async` with `try/catch + next(err)` for safe Express error propagation

### 3) Persist serialization cost

File:

- `server/src/store.js`

Changes:

- switched default JSON persist to compact mode (`JSON.stringify(cache)`)
- optional pretty mode preserved via env flag `STORE_PRETTY_JSON=1`
- added typing hints for store entities used in benchmarked routes

Config update:

- `server/.env.example` includes `STORE_PRETTY_JSON` note

## Profiling results (after optimization run)

Command output source: `npm run profile:hotspots` (current branch state).

| Hotspot | Before | After | Improvement |
|---|---:|---:|---:|
| GET /history selection (ms) | 4.18 | 3.47 | 17.0% |
| GET /favorites selection (ms) | 3.00 | 2.35 | 21.9% |
| Store persist serialization (ms) | 265.37 | 204.13 | 23.1% |
| Auth event-loop block percent | 100.00 | 84.42 | 15.6% |

Memory snapshot during run:

- RSS: `130.0 MiB`
- heapUsed: `52.0 MiB`

## Before/after summary

- read endpoints improved due to less expensive timestamp comparisons
- persist path improved substantially due to compact serialization
- auth path no longer performs sync bcrypt, improving event-loop responsiveness under load

## New hotspots / further work

After current optimizations, remaining heavy areas:

1. JSON file storage itself remains a scaling limit for write-heavy workloads
2. bcrypt still dominates CPU cost at higher auth concurrency (even async version is CPU-expensive)
3. request logging overhead can become noticeable on high RPS

Recommended next steps:

- migrate store to DB / append-only WAL
- add request-level sampling for `http_response` logs
- introduce cache for frequently read user slices (history/favorites)
- run HTTP load tests (`autocannon`) for p95/p99 latency baselines
