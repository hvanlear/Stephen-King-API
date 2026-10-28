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
      assert.match(res.headers.get("ratelimit") ?? "", /limit=100000, remaining=\d+, reset=\d+/);
      // Exposed so browser apps can read it
      assert.match(res.headers.get("access-control-expose-headers") ?? "", /RateLimit/);
    } finally {
      await server.close();
    }
  });

  it("counts each client once, whichever Cloudflare edge it comes through", async () => {
    // On Render, X-Forwarded-For arrives as "<client>, <Cloudflare edge>"
    const server = await startServer();
    const remaining = async (forwardedFor: string) => {
      const res = await fetch(`${server.url}/api/books?page=1&limit=1`, {
        headers: { "X-Forwarded-For": forwardedFor },
      });
      return Number(/remaining=(\d+)/.exec(res.headers.get("ratelimit") ?? "")?.[1]);
    };
    try {
      const first = await remaining("203.0.113.1, 104.23.243.1");
      assert.equal(await remaining("203.0.113.1, 104.23.243.2"), first - 1, "same client, another edge");
      assert.equal(await remaining("203.0.113.2, 104.23.243.1"), first, "another client, same edge");
      // A forged header keeps its entries in front of the real ones
      assert.equal(await remaining("6.6.6.6, 203.0.113.1, 104.23.243.3"), first - 2, "forged entries");
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
