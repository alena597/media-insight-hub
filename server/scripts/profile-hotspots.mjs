import { performance } from 'node:perf_hooks';
import bcrypt from 'bcryptjs';

const USERS = 800;
const HISTORY_TOTAL = 120_000;
const FAVORITES_TOTAL = 80_000;
const TARGET_USER = 'u-42';
const HISTORY_LIMIT = 80;
const FAVORITES_LIMIT = 100;

function makeHistoryRows(total) {
  const out = [];
  const now = Date.now();
  for (let i = 0; i < total; i += 1) {
    const userId = `u-${i % USERS}`;
    const ms = now - (i % 2_000_000);
    out.push({
      id: `h-${i}`,
      user_id: userId,
      kind: 'analysis',
      label: `history-${i}`,
      path: '/dashboard',
      created_at: new Date(ms).toISOString(),
      created_at_ms: ms
    });
  }
  return out;
}

function makeFavoriteRows(total) {
  const out = [];
  const now = Date.now();
  for (let i = 0; i < total; i += 1) {
    const userId = `u-${i % USERS}`;
    const ms = now - (i % 2_500_000);
    out.push({
      id: `f-${i}`,
      user_id: userId,
      title: `fav-${i}`,
      path: '/ocr',
      kind: 'module',
      created_at: new Date(ms).toISOString(),
      created_at_ms: ms
    });
  }
  return out;
}

function baselineHistory(rows, userId, limit) {
  return rows
    .filter((h) => h.user_id === userId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

function baselineFavorites(rows, userId, limit) {
  return rows
    .filter((f) => f.user_id === userId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

function createdAtMs(row) {
  if (typeof row.created_at_ms === 'number' && Number.isFinite(row.created_at_ms)) {
    return row.created_at_ms;
  }
  const ms = Date.parse(row.created_at);
  return Number.isFinite(ms) ? ms : 0;
}

function newestByUser(rows, userId, limit) {
  return rows
    .filter((row) => row.user_id === userId)
    .sort((a, b) => createdAtMs(b) - createdAtMs(a))
    .slice(0, limit);
}

function benchSync(fn, iterations = 50) {
  const t0 = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    fn();
  }
  const t1 = performance.now();
  return (t1 - t0) / iterations;
}

async function benchAsync(fn, iterations = 20) {
  const t0 = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await fn();
  }
  const t1 = performance.now();
  return (t1 - t0) / iterations;
}

async function eventLoopBlockPctDuring(task) {
  let ticks = 0;
  const timer = setInterval(() => {
    ticks += 1;
  }, 10);

  const t0 = performance.now();
  await task();
  const elapsedMs = performance.now() - t0;
  clearInterval(timer);

  const expectedTicks = elapsedMs / 10;
  if (expectedTicks <= 0) return 0;
  const blockPct = (1 - ticks / expectedTicks) * 100;
  return Math.max(0, Math.min(100, blockPct));
}

function percentFaster(before, after) {
  return ((before - after) / before) * 100;
}

async function main() {
  const history = makeHistoryRows(HISTORY_TOTAL);
  const favorites = makeFavoriteRows(FAVORITES_TOTAL);

  const baselineHistoryMs = benchSync(() => baselineHistory(history, TARGET_USER, HISTORY_LIMIT));
  const optimizedHistoryMs = benchSync(() => newestByUser(history, TARGET_USER, HISTORY_LIMIT));

  const baselineFavMs = benchSync(() => baselineFavorites(favorites, TARGET_USER, FAVORITES_LIMIT));
  const optimizedFavMs = benchSync(() => newestByUser(favorites, TARGET_USER, FAVORITES_LIMIT));

  const payload = { users: [], history, favorites };
  const compactPersistMs = benchSync(() => JSON.stringify(payload), 10);
  const prettyPersistMs = benchSync(() => JSON.stringify(payload, null, 2), 10);

  const password = 'example-password-123';
  const hash = await bcrypt.hash(password, 10);

  const bcryptSyncBlockPct = await eventLoopBlockPctDuring(async () => {
    for (let i = 0; i < 20; i += 1) {
      bcrypt.compareSync(password, hash);
    }
  });
  const bcryptAsyncBlockPct = await eventLoopBlockPctDuring(async () => {
    for (let i = 0; i < 20; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await bcrypt.compare(password, hash);
    }
  });

  const rows = [
    {
      hotspot: 'GET /history selection',
      beforeMs: baselineHistoryMs,
      afterMs: optimizedHistoryMs
    },
    {
      hotspot: 'GET /favorites selection',
      beforeMs: baselineFavMs,
      afterMs: optimizedFavMs
    },
    {
      hotspot: 'store persist serialization',
      beforeMs: prettyPersistMs,
      afterMs: compactPersistMs
    },
    {
      hotspot: 'auth event-loop block percent',
      beforeMs: bcryptSyncBlockPct,
      afterMs: bcryptAsyncBlockPct
    }
  ];

  const result = rows.map((r) => ({
    hotspot: r.hotspot,
    beforeMs: Number(r.beforeMs.toFixed(2)),
    afterMs: Number(r.afterMs.toFixed(2)),
    improvementPct: Number(percentFaster(r.beforeMs, r.afterMs).toFixed(1))
  }));

  const memory = process.memoryUsage();
  const summary = {
    dataset: { USERS, HISTORY_TOTAL, FAVORITES_TOTAL, TARGET_USER, HISTORY_LIMIT, FAVORITES_LIMIT },
    memoryMiB: {
      rss: Number((memory.rss / 1024 / 1024).toFixed(1)),
      heapUsed: Number((memory.heapUsed / 1024 / 1024).toFixed(1))
    },
    result
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
