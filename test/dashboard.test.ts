import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startServer, TestServer } from "./server";

let server: TestServer;
before(async () => {
  server = await startServer();
});
after(() => server.close());

// The settings are read on every request, so each test can set its own
beforeEach(() => {
  process.env.DASHBOARD_PASSWORD = "redrum";
  process.env.DASHBOARD_SECRET = "test-secret";
});
after(() => {
  delete process.env.DASHBOARD_PASSWORD;
  delete process.env.DASHBOARD_SECRET;
});

function logIn(password: string) {
  return fetch(`${server.url}/dashboard/login`, {
    method: "POST",
    body: new URLSearchParams({ password }),
    redirect: "manual",
  });
}

function openDashboard(cookie?: string) {
  return fetch(`${server.url}/dashboard`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
}

describe("dashboard login", () => {
  it("stays off unless both settings are set", async () => {
    delete process.env.DASHBOARD_SECRET;
    assert.equal((await logIn("redrum")).status, 503);
  });

  it("rejects a wrong password", async () => {
    const res = await logIn("heeeres-johnny");
    assert.equal(res.status, 401);
    assert.deepEqual(res.headers.getSetCookie(), []);
  });

  it("lets the right password in", async () => {
    const res = await logIn("redrum");
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/dashboard");

    const cookie = res.headers.getSetCookie()[0].split(";")[0];
    const dashboard = await openDashboard(cookie);
    assert.equal(dashboard.status, 200);
    assert.match(await dashboard.text(), /<title>Dashboard/);
  });

  it("sends anyone without a valid session back to the login page", async () => {
    const cookie = (await logIn("redrum")).headers.getSetCookie()[0].split(";")[0];
    const [name, value] = cookie.split("=");
    const [expires, signature] = decodeURIComponent(value).split(".");
    const forged = `${name}=${encodeURIComponent(`${Number(expires) + 1000}.${signature}`)}`;

    for (const attempt of [undefined, forged]) {
      const res = await openDashboard(attempt);
      assert.equal(res.status, 302, String(attempt));
      assert.equal(res.headers.get("location"), "/dashboard/login");
    }

    // Changing the secret logs everyone out
    process.env.DASHBOARD_SECRET = "rotated-secret";
    assert.equal((await openDashboard(cookie)).status, 302);
  });
});
