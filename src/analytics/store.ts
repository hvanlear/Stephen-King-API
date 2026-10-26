import prisma from "../db";
import config from "../config";

interface EndpointStats {
  hits: number;
  lastAccessed: Date;
}

interface AnalyticsData {
  endpoints: Record<string, { hits: number; lastAccessed: string }>;
  totalHits: number;
  startedAt: string;
}

const FLUSH_INTERVAL_MS = 60 * 1000;

// Only production saves counts. The local dev server points at the same
// database, so saving from it would mix test traffic into the real numbers.
const persist = config.stage === "production";

const startedAt = new Date().toISOString();

// Hits recorded since the last successful flush
let pending = new Map<string, EndpointStats>();

function addHits(
  target: Map<string, EndpointStats>,
  routeKey: string,
  stats: EndpointStats
): void {
  const existing = target.get(routeKey);
  if (!existing) {
    target.set(routeKey, { ...stats });
    return;
  }
  existing.hits += stats.hits;
  if (stats.lastAccessed > existing.lastAccessed) {
    existing.lastAccessed = stats.lastAccessed;
  }
}

export function recordHit(routeKey: string): void {
  addHits(pending, routeKey, { hits: 1, lastAccessed: new Date() });
}

export async function getStats(): Promise<AnalyticsData> {
  const totals = new Map<string, EndpointStats>();

  if (persist) {
    const rows = await prisma.endpointStat.findMany();
    for (const row of rows) {
      totals.set(row.endpoint, {
        hits: row.hits,
        lastAccessed: row.lastAccessed,
      });
    }
  }
  pending.forEach((stats, routeKey) => addHits(totals, routeKey, stats));

  const endpoints: AnalyticsData["endpoints"] = {};
  let totalHits = 0;
  totals.forEach((stats, routeKey) => {
    endpoints[routeKey] = {
      hits: stats.hits,
      lastAccessed: stats.lastAccessed.toISOString(),
    };
    totalHits += stats.hits;
  });

  return { endpoints, totalHits, startedAt };
}

// Never throws: on failure the batch goes back into pending and is retried
// on the next flush.
export async function flushStats(): Promise<void> {
  if (!persist || pending.size === 0) {
    return;
  }

  const batch = pending;
  pending = new Map();

  try {
    await prisma.$transaction(
      Array.from(batch, ([endpoint, { hits, lastAccessed }]) =>
        prisma.endpointStat.upsert({
          where: { endpoint },
          create: { endpoint, hits, lastAccessed },
          update: { hits: { increment: hits }, lastAccessed },
        })
      )
    );
  } catch (error) {
    console.error("Failed to save API hit counts, will retry:", error);
    batch.forEach((stats, routeKey) => addHits(pending, routeKey, stats));
  }
}

export function startPersistence(): NodeJS.Timeout {
  return setInterval(() => void flushStats(), FLUSH_INTERVAL_MS);
}

export function stopPersistence(intervalId: NodeJS.Timeout): void {
  clearInterval(intervalId);
}
