import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, TestServer } from "./server";

const resources = [
  { list: "/api/books", detail: "/api/book", total: 63, missing: "Book not found" },
  { list: "/api/shorts", detail: "/api/short", total: 212, missing: "Short not found" },
  { list: "/api/villains", detail: "/api/villain", total: 115, missing: "Villain not found" },
];

let server: TestServer;
before(async () => {
  server = await startServer();
});
after(() => server.close());

async function get(requestPath: string) {
  const res = await fetch(server.url + requestPath);
  // Response shapes are checked by the assertions, not the type system
  const body: any = await res.json();
  return { status: res.status, body };
}

for (const { list, detail, total, missing } of resources) {
  describe(list, () => {
    it("lists every record in id order", async () => {
      const { status, body } = await get(list);
      assert.equal(status, 200);
      assert.equal(body.data.length, total);
      const ids = body.data.map((record) => record.id);
      assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
      assert.equal(body.pagination, undefined);
    });

    it("paginates when page and limit are both given", async () => {
      const { status, body } = await get(`${list}?page=2&limit=10`);
      assert.equal(status, 200);
      assert.deepEqual(
        body.data.map((record) => record.id),
        Array.from({ length: 10 }, (_, i) => 11 + i)
      );
      assert.deepEqual(body.pagination, {
        page: 2,
        limit: 10,
        total,
        totalPages: Math.ceil(total / 10),
      });
    });

    it("ignores limit without page", async () => {
      const { body } = await get(`${list}?limit=10`);
      assert.equal(body.data.length, total);
    });

    it("caps limit at 100", async () => {
      const { body } = await get(`${list}?page=1&limit=500`);
      assert.equal(body.pagination.limit, 100);
      assert.equal(body.data.length, Math.min(100, total));
    });

    it("returns an empty page past the end", async () => {
      const { status, body } = await get(`${list}?page=99&limit=10`);
      assert.equal(status, 200);
      assert.deepEqual(body.data, []);
    });

    it("returns one record by id", async () => {
      const { status, body } = await get(`${detail}/1`);
      assert.equal(status, 200);
      assert.equal(body.data.id, 1);
    });

    it("returns 404 for an id that doesn't exist", async () => {
      const { status, body } = await get(`${detail}/9999`);
      assert.equal(status, 404);
      assert.deepEqual(body, { error: missing });
    });

    it("returns 400 for a malformed id", async () => {
      for (const id of ["abc", "1.5", "-1", "1e1"]) {
        const { status, body } = await get(`${detail}/${id}`);
        assert.equal(status, 400, id);
        assert.match(body.error, /id must be a whole number$/);
      }
    });

    it("returns 400 for a malformed page or limit", async () => {
      for (const query of ["page=x&limit=10", "page=1&limit=1.5", "page=1&page=2&limit=10", "limit=abc"]) {
        const { status, body } = await get(`${list}?${query}`);
        assert.equal(status, 400, query);
        assert.deepEqual(body, { error: "page and limit must be whole numbers" });
      }
    });

    it("still treats page 0 as page 1", async () => {
      const { status, body } = await get(`${list}?page=0&limit=5`);
      assert.equal(status, 200);
      assert.equal(body.pagination.page, 1);
      assert.deepEqual(body.data.map((record) => record.id), [1, 2, 3, 4, 5]);
    });
  });
}

describe("unimplemented routes", () => {
  it("are gone rather than answering 501", async () => {
    for (const [method, requestPath] of [
      ["GET", "/api/book/1/villains"],
      ["PUT", "/api/book/1"],
      ["POST", "/api/shorts"],
      ["DELETE", "/api/villains"],
    ]) {
      const res = await fetch(server.url + requestPath, { method });
      assert.equal(res.status, 404, `${method} ${requestPath}`);
    }
  });
});

describe("links", () => {
  it("point both ways between villains and books", async () => {
    const { body } = await get("/api/villains");
    for (const villain of body.data) {
      for (const book of villain.books) {
        const id = book.url.split("/").pop();
        const { body: linked } = await get(`/api/book/${id}`);
        assert.ok(
          linked.data.villains.some((v) => v.url.endsWith(`/api/villain/${villain.id}`)),
          `book ${id} doesn't link back to villain ${villain.id}`
        );
      }
    }
  });
});
