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

  it("ends every session on logout", async () => {
    const cookie = (await logIn("redrum")).headers.getSetCookie()[0].split(";")[0];
    assert.equal((await openDashboard(cookie)).status, 200);

    const res = await fetch(`${server.url}/dashboard/logout`, { headers: { cookie }, redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/dashboard/login");
    assert.match(res.headers.getSetCookie()[0], /^dashboard_session=;/);

    // A copy of the cookie is no good either, but logging in again works right away
    assert.equal((await openDashboard(cookie)).status, 302);
    const again = (await logIn("redrum")).headers.getSetCookie()[0].split(";")[0];
    assert.equal((await openDashboard(again)).status, 200);
  });

  it("locks a client out after 5 failed attempts, not counting logins", async () => {
    // Its own client address, so these attempts don't count against the other tests
    const client = "203.0.113.7, 104.23.243.1";
    const attempt = async (password: string) => {
      const res = await fetch(`${server.url}/dashboard/login`, {
        method: "POST",
        body: new URLSearchParams({ password }),
        headers: { "X-Forwarded-For": client },
        redirect: "manual",
      });
      // Read to the end, so the server has finished counting it
      return { status: res.status, type: res.headers.get("content-type") ?? "", body: await res.text() };
    };
    for (let i = 0; i < 4; i++) {
      assert.equal((await attempt("wrong")).status, 401);
    }
    assert.equal((await attempt("redrum")).status, 302);
    assert.equal((await attempt("wrong")).status, 401, "a successful login doesn't count");

    const locked = await attempt("wrong");
    assert.equal(locked.status, 429);
    assert.match(locked.type, /^text\/html/);
    assert.match(locked.body, /Too many failed attempts/);
    assert.equal((await attempt("redrum")).status, 429, "the right password is locked out too");
  });
});
