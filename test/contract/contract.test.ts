import fs from "fs";
import path from "path";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, TestServer } from "../server";

// Every response must match what production returned (see capture.ts)
const FIXTURE_DIR = path.join(__dirname, "fixtures");

const fixtures = fs
  .readdirSync(FIXTURE_DIR)
  .filter((file) => file.endsWith(".json"))
  .map((file) => JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), "utf8")));

describe("responses match the production snapshots", () => {
  let server: TestServer;
  before(async () => {
    server = await startServer();
  });
  after(() => server.close());

  for (const fixture of fixtures) {
    it(fixture.path, async () => {
      const res = await fetch(server.url + fixture.path);
      assert.equal(res.status, fixture.status);
      const body = await res.json();
      assert.deepEqual(body, fixture.body);
      // deepEqual ignores key order; consumers might not
      assert.equal(
        JSON.stringify(body),
        JSON.stringify(fixture.body),
        "same values, but the keys are in a different order"
      );
    });
  }
});
