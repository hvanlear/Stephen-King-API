// Only production reads and saves counts, so the store is loaded as if it
// were. The test runner gives each file its own process.
process.env.STAGE = "production";

import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/db";
import { recordHit, getStats, flushStats } from "../src/analytics/store";

interface Row {
  endpoint: string;
  hits: number;
  lastAccessed: Date;
}

// mock.method can't see through the Prisma delegate, so its methods are
// swapped by hand; $transaction on the client itself mocks fine
const delegate = prisma.endpointStat as unknown as Record<string, unknown>;
const original = { findMany: delegate.findMany, upsert: delegate.upsert };

let rows: Row[];
let upserts: any[];
let transactions: number;
let transaction: (ops: unknown[]) => Promise<unknown>;

beforeEach(() => {
  rows = [];
  upserts = [];
  transactions = 0;
  transaction = async () => undefined;
  delegate.findMany = async () => rows;
  delegate.upsert = (args: unknown) => {
    upserts.push(args);
    return args;
  };
  mock.method(prisma, "$transaction", (ops: unknown[]) => {
    transactions++;
    return transaction(ops);
  });
});

afterEach(async () => {
  // Leave nothing pending or failing for the next test
  transaction = async () => undefined;
  mock.method(console, "log", () => {});
  await flushStats();
  Object.assign(delegate, original);
  mock.restoreAll();
});

describe("analytics store", () => {
  it("adds the hits in memory to the saved totals", async () => {
    rows = [{ endpoint: "GET /api/books", hits: 10, lastAccessed: new Date("2026-01-01T00:00:00.000Z") }];
    recordHit("GET /api/books");
    recordHit("GET /api/book/:id");

    const stats = await getStats();
    assert.equal(stats.endpoints["GET /api/books"].hits, 11);
    assert.ok(stats.endpoints["GET /api/books"].lastAccessed > "2026-01-01T00:00:00.000Z", "keeps the newer time");
    assert.equal(stats.endpoints["GET /api/book/:id"].hits, 1);
    assert.equal(stats.totalHits, 12);
  });

  it("saves pending hits as increments, then has nothing left to save", async () => {
    recordHit("GET /api/books");
    recordHit("GET /api/books");
    await flushStats();

    assert.equal(transactions, 1);
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0].where.endpoint, "GET /api/books");
    assert.equal(upserts[0].create.hits, 2);
    assert.deepEqual(upserts[0].update.hits, { increment: 2 });
    assert.ok(upserts[0].update.lastAccessed instanceof Date);

    // Once saved, the hits only count through the database
    assert.deepEqual((await getStats()).endpoints, {});
    await flushStats();
    assert.equal(transactions, 1, "nothing pending, nothing saved");
  });

  it("keeps a failed batch and retries it with the next flush", async () => {
    const failures = mock.method(console, "error", () => {});
    transaction = async () => {
      throw new Error("db down");
    };
    recordHit("GET /api/books");
    await flushStats();
    recordHit("GET /api/books");
    await flushStats();

    assert.equal(transactions, 2);
    assert.equal(failures.mock.callCount(), 1, "the outage is logged once");
    assert.equal((await getStats()).endpoints["GET /api/books"].hits, 2, "nothing is lost");

    const recoveries = mock.method(console, "log", () => {});
    transaction = async () => undefined;
    upserts = [];
    await flushStats();
    assert.deepEqual(upserts[0].update.hits, { increment: 2 });
    assert.equal(recoveries.mock.callCount(), 1, "the recovery is logged once");

    recordHit("GET /api/books");
    await flushStats();
    assert.equal(recoveries.mock.callCount(), 1);
    assert.equal(failures.mock.callCount(), 1);
  });

  it("still counts hits while a batch is being saved", async () => {
    let commit!: () => void;
    transaction = () => new Promise<void>((resolve) => (commit = resolve));
    recordHit("GET /api/books");
    const flushing = flushStats();

    assert.equal((await getStats()).endpoints["GET /api/books"].hits, 1, "counted while in flight");

    commit();
    await flushing;
    rows = [{ endpoint: "GET /api/books", hits: 1, lastAccessed: new Date() }];
    assert.equal((await getStats()).endpoints["GET /api/books"].hits, 1, "not counted twice once saved");
  });
});
