import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { startServer } from "./server";
import { createApiLimiter } from "../src/modules/apiLimiter";

describe("API rate limit", () => {
  it("sends the limit in headers on every API response", async () => {
    const server = await startServer();
    try {
      const res = await fetch(`${server.url}/api/books?page=1&limit=1`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get("ratelimit"), /limit=100000, remaining=\d+, reset=\d+/);
      // Exposed so browser apps can read it
      assert.match(res.headers.get("access-control-expose-headers"), /RateLimit/);
    } finally {
      await server.close();
    }
  });

  it("answers 429 in JSON once a client goes over", async () => {
    // A throwaway app with a tiny limit, so the test doesn't need 100 requests
    const app = express();
    app.use(createApiLimiter(2));
    app.get("/", (req, res) => {
      res.json({ ok: true });
    });
    const server = await startServer(app);
    try {
      for (let i = 0; i < 2; i++) {
        assert.equal((await fetch(server.url)).status, 200);
      }
      const res = await fetch(server.url);
      assert.equal(res.status, 429);
      assert.deepEqual(await res.json(), {
        error: "Too many requests. Try again in a minute.",
      });
      assert.ok(Number(res.headers.get("retry-after")) > 0, "Retry-After is set");
    } finally {
      await server.close();
    }
  });
});
