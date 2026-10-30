import fs from "fs";
import path from "path";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, TestServer } from "./server";

// From the files, so adding a record doesn't mean editing this test
const count = (file: string) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "..", "catalog", file), "utf8")).length;

const resources = [
  { list: "/api/books", detail: "/api/book", total: count("books.json"), missing: "Book not found" },
  { list: "/api/shorts", detail: "/api/short", total: count("shorts.json"), missing: "Short not found" },
  { list: "/api/villains", detail: "/api/villain", total: count("villains.json"), missing: "Villain not found" },
  { list: "/api/places", detail: "/api/place", total: count("places.json"), missing: "Place not found" },
  { list: "/api/types", detail: "/api/type", total: count("types.json"), missing: "Type not found" },
  { list: "/api/collections", detail: "/api/collection", total: count("collections.json"), missing: "Collection not found" },
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
      const ids = body.data.map((record: { id: number }) => record.id);
      assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
      assert.equal(body.pagination, undefined);
    });

    it("paginates when page and limit are both given", async () => {
      const { body: all } = await get(list);
      const { status, body } = await get(`${list}?page=2&limit=10`);
      assert.equal(status, 200);
      // Ids can skip retired numbers, so page 2 is the 11th to 20th records
      assert.deepEqual(
        body.data.map((record: { id: number }) => record.id),
        all.data.slice(10, 20).map((record: { id: number }) => record.id)
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
      const { body: all } = await get(list);
      assert.deepEqual(body.data, all.data.slice(0, 5));
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
          linked.data.villains.some((v: { url: string }) => v.url.endsWith(`/api/villain/${villain.id}`)),
          `book ${id} doesn't link back to villain ${villain.id}`
        );
      }
    }
  });

  it("point both ways between places and the places in them", async () => {
    const { body } = await get("/api/places");
    const idOf = (link: { url: string }) => Number(link.url.split("/").pop());
    const names = new Map(body.data.map((place: { id: number; name: string }) => [place.id, place.name]));
    for (const place of body.data) {
      const inside = body.data.filter((other: any) => other.parent && idOf(other.parent) === place.id);
      assert.deepEqual(
        place.places.map(idOf),
        inside.map((other: { id: number }) => other.id),
        `place ${place.id} doesn't list every place inside it`
      );
      for (const link of [place.parent, ...place.places].filter(Boolean)) {
        assert.equal(link.name, names.get(idOf(link)), `place ${place.id} links ${link.url} under the wrong name`);
      }
    }
  });

  it("from places to books, shorts and villains use their names", async () => {
    const names = new Map<string, string>();
    for (const { list, detail } of resources) {
      const { body } = await get(list);
      for (const record of body.data) {
        names.set(`${detail}/${record.id}`, record.Title ?? record.title ?? record.name);
      }
    }
    const { body } = await get("/api/places");
    for (const place of body.data) {
      for (const link of [...place.books, ...place.shorts, ...place.villains]) {
        const linked = new URL(link.url).pathname;
        assert.ok(names.has(linked), `place ${place.id} links ${link.url}, which doesn't exist`);
        assert.equal(link.title ?? link.name, names.get(linked), `place ${place.id} links ${link.url} under the wrong name`);
      }
    }
  });

  it("point both ways between places and the works set there", async () => {
    const { body: placeList } = await get("/api/places");
    const fromPlaces = new Set<string>();
    for (const place of placeList.data) {
      for (const link of [...place.books, ...place.shorts]) {
        fromPlaces.add(`${new URL(link.url).pathname} ${place.id}`);
      }
    }
    const fromWorks = new Set<string>();
    for (const [list, detail] of [["/api/books", "/api/book"], ["/api/shorts", "/api/short"]]) {
      const { body } = await get(list);
      for (const work of body.data) {
        for (const link of work.places) {
          fromWorks.add(`${detail}/${work.id} ${Number(link.url.split("/").pop())}`);
        }
      }
    }
    assert.deepEqual([...fromWorks].sort(), [...fromPlaces].sort());
  });

  it("list each villain's home among the place's residents", async () => {
    const { body } = await get("/api/villains");
    for (const villain of body.data) {
      for (const home of villain.residence) {
        const { body: place } = await get(new URL(home.url).pathname);
        assert.equal(home.name, place.data.name);
        assert.ok(
          place.data.villains.some((v: { url: string }) => v.url.endsWith(`/api/villain/${villain.id}`)),
          `place ${place.data.id} doesn't list villain ${villain.id}`
        );
      }
    }
  });

  it("point both ways between villains and their types", async () => {
    const { body: typeList } = await get("/api/types");
    const parents = new Map(
      typeList.data.map((type: any) => [`/api/type/${type.id}`, type.parent && new URL(type.parent.url).pathname])
    );
    // A villain belongs to its type, its kinds and every type above a kind
    const expected = new Map<string, number[]>();
    const { body } = await get("/api/villains");
    for (const villain of body.data) {
      const typePaths = new Set<string>();
      for (const link of [villain.type, ...villain.kinds]) {
        for (let at = new URL(link.url).pathname; at; at = parents.get(at) as string) {
          typePaths.add(at);
        }
      }
      for (const at of typePaths) {
        expected.set(at, [...(expected.get(at) || []), villain.id]);
      }
    }
    for (const type of typeList.data) {
      assert.deepEqual(
        type.villains.map((link: { url: string }) => Number(link.url.split("/").pop())),
        expected.get(`/api/type/${type.id}`) || [],
        `type ${type.id} (${type.name}) lists the wrong villains`
      );
    }
  });

  it("point both ways between shorts and their collections", async () => {
    const { body: collectionList } = await get("/api/collections");
    const { body: shortList } = await get("/api/shorts");
    const idOf = (link: { url: string }) => Number(link.url.split("/").pop());
    const names = new Map(collectionList.data.map((collection: { id: number; name: string }) => [collection.id, collection.name]));
    const fromShorts = new Map<number, number[]>();
    for (const short of shortList.data) {
      if (short.collectedIn.startsWith("Uncollected")) {
        assert.equal(short.collection, null, `short ${short.id} is uncollected but links a collection`);
        continue;
      }
      assert.ok(short.collection, `short ${short.id} has no collection`);
      assert.match(short.collection.url, /\/api\/collection\/\d+$/);
      assert.equal(short.collection.name, names.get(idOf(short.collection)), `short ${short.id} links its collection under the wrong name`);
      fromShorts.set(idOf(short.collection), [...(fromShorts.get(idOf(short.collection)) || []), short.id]);
    }
    const titles = new Map(shortList.data.map((short: { id: number; title: string }) => [short.id, short.title]));
    for (const collection of collectionList.data) {
      assert.deepEqual(
        collection.shorts.map(idOf),
        fromShorts.get(collection.id) || [],
        `collection ${collection.id} (${collection.name}) lists the wrong shorts`
      );
      for (const link of collection.shorts) {
        assert.equal(link.title, titles.get(idOf(link)), `collection ${collection.id} links ${link.url} under the wrong title`);
      }
    }
  });

  it("point both ways between books and the collections they are", async () => {
    const { body: collectionList } = await get("/api/collections");
    const { body: bookList } = await get("/api/books");
    const fromBooks = bookList.data
      .filter((book: any) => book.collection)
      .map((book: any) => `${new URL(book.collection.url).pathname} /api/book/${book.id}`);
    const fromCollections = collectionList.data
      .filter((collection: any) => collection.book)
      .map((collection: any) => `/api/collection/${collection.id} ${new URL(collection.book.url).pathname}`);
    assert.deepEqual(fromBooks, fromCollections);
    // The Gunslinger and Blaze
    assert.equal(fromBooks.length, 2);
  });

  it("list a place's residents in every place it's in", async () => {
    const { body } = await get("/api/places");
    const byUrl = new Map(body.data.map((place: { id: number }) => [`/api/place/${place.id}`, place]));
    for (const place of body.data) {
      const parent: any = place.parent && byUrl.get(new URL(place.parent.url).pathname);
      for (const villain of parent ? place.villains : []) {
        assert.ok(
          parent.villains.some((v: { url: string }) => v.url === villain.url),
          `${villain.name} lives in place ${place.id} but isn't listed in ${parent.id}`
        );
      }
    }
  });
});
