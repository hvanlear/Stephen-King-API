import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { startServer, TestServer } from "./server";
import { errorHandler } from "../src/modules/errorHandler";

describe("errors", () => {
  let server: TestServer;
  before(async () => {
    server = await startServer();
  });
  after(() => server.close());

  it("returns JSON 404s for unknown /api routes", async () => {
    const res = await fetch(`${server.url}/api/nope`);
    assert.equal(res.status, 404);
    assert.match(res.headers.get("content-type"), /^application\/json/);
    assert.deepEqual(await res.json(), { error: "Not found" });
  });

  it("returns 400, not 500, for malformed JSON", async () => {
    const res = await fetch(`${server.url}/api/books`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{oops",
    });
    assert.equal(res.status, 400);
    const body: any = await res.json();
    assert.match(body.error, /JSON/);
  });

  it("logs unexpected errors and keeps their details out of the response", async () => {
    // A throwaway app, so the test doesn't need a real bug to trigger
    const brokenApp = express();
    brokenApp.get("/boom", () => {
      throw new Error("secret detail");
    });
    brokenApp.use(errorHandler);
    const broken = await startServer(brokenApp);
    const log = mock.method(console, "error", () => {});
    try {
      const res = await fetch(`${broken.url}/boom`);
      assert.equal(res.status, 500);
      assert.deepEqual(await res.json(), {
        message: "All work and no play makes a server error",
      });
      assert.equal(log.mock.callCount(), 1);
      const [summary, error] = log.mock.calls[0].arguments;
      assert.equal(summary, "GET /boom failed:");
      assert.equal(error.message, "secret detail");
    } finally {
      log.mock.restore();
      await broken.close();
    }
  });
});
