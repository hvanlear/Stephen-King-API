import fs from "fs";
import path from "path";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, TestServer } from "./server";
// After ./server, which sets URL before the response builders read it
import { kinds } from "../src/kinds";

// Totals come from the files rather than what the app loaded, so a record the
// loader drops is caught. Every catalog file is named for its list route,
// except villains, which are the characters marked as one.
const records = (file: string): any[] =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "..", "catalog", file), "utf8"));
const count = (list: string) =>
  list === "villains" ? records("characters.json").filter((c) => c.villain === true).length : records(`${list}.json`).length;

// The 404 text is pinned per kind by the contract fixtures, so taking it from
// the list here doesn't leave it unchecked
const resources = kinds.map((kind) => ({
  list: `/api/${kind.list}`,
  detail: `/api/${kind.one}`,
  total: count(kind.list),
  missing: kind.notFound,
}));

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

// Where the API links a character: a villain at /api/villain/:id, anyone else
// at /api/character/:id
const characterPath = (character: { id: number; villain: boolean }) =>
  `/api/${character.villain ? "villain" : "character"}/${character.id}`;

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

describe("characters and villains", () => {
  it("lists as villains exactly the characters marked as one, served the same", async () => {
    const { body: characters } = await get("/api/characters");
    const { body: villains } = await get("/api/villains");
    assert.deepEqual(villains.data, characters.data.filter((character: { villain: boolean }) => character.villain));
    assert.ok(characters.data.some((character: { villain: boolean }) => !character.villain));
    const { body: asCharacter } = await get("/api/character/57");
    const { body: asVillain } = await get("/api/villain/57");
    assert.deepEqual(asVillain, asCharacter);
  });

  it("has no villain route for a character who isn't one", async () => {
    const { status, body } = await get("/api/villain/202");
    assert.equal(status, 404);
    assert.deepEqual(body, { error: "Villain not found" });
    const { status: found, body: ben } = await get("/api/character/202");
    assert.equal(found, 200);
    assert.equal(ben.data.name, "Ben Mears");
  });

  it("link a villain at its villain route and anyone else at their character route", async () => {
    const { body } = await get("/api/characters");
    const byId = new Map(body.data.map((character: any) => [character.id, character]));
    const links: { url: string; name?: string }[] = [];
    const collect = (value: any): void => {
      if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === "object") {
        if (typeof value.url === "string" && /\/api\/(villain|character)\/\d+$/.test(value.url)) links.push(value);
        Object.values(value).forEach(collect);
      }
    };
    for (const list of ["/api/books", "/api/shorts", "/api/characters", "/api/places", "/api/types"]) {
      collect((await get(list)).body.data);
    }
    assert.ok(links.some((link) => link.url.includes("/api/character/")));
    for (const link of links) {
      const id = Number(link.url.split("/").pop());
      const character: any = byId.get(id);
      assert.ok(character, `${link.url} doesn't match any character`);
      assert.equal(new URL(link.url).pathname, characterPath(character), `${link.url} is the wrong route for ${character.name}`);
      assert.equal(link.name, character.name, `${link.url} is linked under the wrong name`);
    }
  });
});

describe("links", () => {
  it("point both ways between characters and the books and shorts they're in", async () => {
    const { body } = await get("/api/characters");
    const fromCharacters: string[] = [];
    for (const character of body.data) {
      for (const work of [...character.books, ...character.shorts]) {
        fromCharacters.push(`${new URL(work.url).pathname} ${characterPath(character)}`);
      }
    }
    const fromWorks: string[] = [];
    for (const [list, detail] of [["/api/books", "/api/book"], ["/api/shorts", "/api/short"]]) {
      const { body: works } = await get(list);
      for (const work of works.data) {
        for (const link of work.characters) {
          fromWorks.push(`${detail}/${work.id} ${new URL(link.url).pathname}`);
        }
      }
    }
    assert.deepEqual(fromWorks.sort(), fromCharacters.sort());
  });

  it("list a work's villains and protagonists among its characters", async () => {
    const { body } = await get("/api/characters");
    const byPath = new Map(body.data.map((character: any) => [characterPath(character), character]));
    for (const list of ["/api/books", "/api/shorts"]) {
      const { body: works } = await get(list);
      for (const work of works.data) {
        const among = (keep: (link: any) => boolean) => work.characters.filter(keep);
        assert.deepEqual(
          work.villains,
          among((link) => (byPath.get(new URL(link.url).pathname) as any).villain),
          `${list} ${work.id} lists the wrong villains`
        );
        // A protagonist of another story who turns up here isn't one of this story's
        assert.deepEqual(work.protagonists, among((link) => link.role === "protagonist"), `${list} ${work.id} lists the wrong protagonists`);
      }
    }
  });

  it("give a character's role in a work on both ends of the link", async () => {
    const roles = [null, "protagonist", "antagonist", "supporting", "minor"];
    const fromCharacters = new Map<string, unknown>();
    const { body } = await get("/api/characters");
    for (const character of body.data) {
      for (const work of [...character.books, ...character.shorts]) {
        assert.deepEqual(Object.keys(work), ["title", "url", "role"], `character ${character.id}`);
        assert.ok(roles.includes(work.role), `character ${character.id} has the role ${work.role}`);
        fromCharacters.set(`${new URL(work.url).pathname} ${characterPath(character)}`, work.role);
      }
      // A protagonist leads at least one story
      const leads = [...character.books, ...character.shorts].some((work: any) => work.role === "protagonist");
      assert.equal(character.protagonist, leads, `character ${character.id}`);
      const keys = Object.keys(character);
      assert.equal(keys[keys.indexOf("villain") + 1], "protagonist", `character ${character.id}: protagonist doesn't follow villain`);
    }
    const fromWorks = new Map<string, unknown>();
    for (const [list, detail] of [["/api/books", "/api/book"], ["/api/shorts", "/api/short"]]) {
      const { body: works } = await get(list);
      for (const work of works.data) {
        for (const link of [...work.characters, ...work.villains, ...work.protagonists]) {
          assert.deepEqual(Object.keys(link), ["name", "url", "role"], `${detail}/${work.id}`);
          const key = `${detail}/${work.id} ${new URL(link.url).pathname}`;
          assert.equal(link.role, fromCharacters.get(key), `${key} has a different role at each end`);
          fromWorks.set(key, link.role);
        }
      }
    }
    assert.deepEqual([...fromWorks.keys()].sort(), [...fromCharacters.keys()].sort());
  });

  it("list a story's own protagonists, not ones visiting from another", async () => {
    const book = async (title: string) => {
      const { body } = await get("/api/books");
      return body.data.find((b: { Title: string }) => b.Title === title);
    };
    const it = await book("It");
    assert.deepEqual(
      it.protagonists.map((link: { name: string }) => link.name),
      ["Bill Denbrough", "Ben Hanscom", "Beverly Marsh", "Richie Tozier", "Eddie Kaspbrak", "Mike Hanlon", "Stan Uris"]
    );
    assert.equal(it.villains.find((link: { name: string }) => link.name === "It (Creature)").role, "antagonist");
    // Beverly and Richie are in 11/22/63, as minor characters
    const jfk = await book("11/22/63");
    assert.deepEqual(jfk.protagonists, []);
    assert.equal(jfk.characters.find((link: { name: string }) => link.name === "Beverly Marsh").role, "minor");
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

  it("from places to books, shorts and characters use their names", async () => {
    const names = new Map<string, string>();
    for (const { list, detail } of resources) {
      const { body } = await get(list);
      for (const record of body.data) {
        names.set(`${detail}/${record.id}`, record.Title ?? record.title ?? record.name);
      }
    }
    const { body } = await get("/api/places");
    for (const place of body.data) {
      for (const link of [...place.books, ...place.shorts, ...place.characters, ...place.villains]) {
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

  it("list each character's home among the place's residents", async () => {
    const { body } = await get("/api/characters");
    for (const character of body.data) {
      for (const home of character.residence) {
        const { body: place } = await get(new URL(home.url).pathname);
        assert.equal(home.name, place.data.name);
        assert.ok(
          place.data.characters.some((c: { url: string }) => new URL(c.url).pathname === characterPath(character)),
          `place ${place.data.id} doesn't list character ${character.id}`
        );
      }
    }
  });

  it("list a place's and a type's villains among its characters", async () => {
    for (const list of ["/api/places", "/api/types"]) {
      const { body } = await get(list);
      for (const record of body.data) {
        assert.deepEqual(
          record.villains,
          record.characters.filter((link: { url: string }) => link.url.includes("/api/villain/")),
          `${list} ${record.id} lists the wrong villains`
        );
      }
    }
  });

  it("point both ways between characters and their types", async () => {
    const { body: typeList } = await get("/api/types");
    const parents = new Map(
      typeList.data.map((type: any) => [`/api/type/${type.id}`, type.parent && new URL(type.parent.url).pathname])
    );
    // A character belongs to its type, its kinds and every type above a kind
    const expected = new Map<string, number[]>();
    const { body } = await get("/api/characters");
    for (const character of body.data) {
      const typePaths = new Set<string>();
      for (const link of [character.type, ...character.kinds]) {
        for (let at = new URL(link.url).pathname; at; at = parents.get(at) as string) {
          typePaths.add(at);
        }
      }
      for (const at of typePaths) {
        expected.set(at, [...(expected.get(at) || []), character.id]);
      }
    }
    for (const type of typeList.data) {
      assert.deepEqual(
        type.characters.map((link: { url: string }) => Number(link.url.split("/").pop())),
        expected.get(`/api/type/${type.id}`) || [],
        `type ${type.id} (${type.name}) lists the wrong characters`
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

  it("point both ways between shorts and where they first appeared", async () => {
    const { body: publicationList } = await get("/api/publications");
    const { body: shortList } = await get("/api/shorts");
    const idOf = (link: { url: string }) => Number(link.url.split("/").pop());
    const names = new Map(publicationList.data.map((publication: { id: number; name: string }) => [publication.id, publication.name]));
    const fromShorts = new Map<number, number[]>();
    for (const short of shortList.data) {
      // null when it first appeared in its collection, on its own, or nowhere recorded
      if (short.publication === null) {
        continue;
      }
      assert.match(short.publication.url, /\/api\/publication\/\d+$/);
      assert.equal(short.publication.name, names.get(idOf(short.publication)), `short ${short.id} links its publication under the wrong name`);
      fromShorts.set(idOf(short.publication), [...(fromShorts.get(idOf(short.publication)) || []), short.id]);
    }
    const titles = new Map(shortList.data.map((short: { id: number; title: string }) => [short.id, short.title]));
    for (const publication of publicationList.data) {
      // A publication only exists because a short first appeared there
      assert.ok(publication.shorts.length, `publication ${publication.id} (${publication.name}) has no shorts`);
      assert.deepEqual(
        publication.shorts.map(idOf),
        fromShorts.get(publication.id) || [],
        `publication ${publication.id} (${publication.name}) lists the wrong shorts`
      );
      for (const link of publication.shorts) {
        assert.equal(link.title, titles.get(idOf(link)), `publication ${publication.id} links ${link.url} under the wrong title`);
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

  it("point both ways between killers and the characters they killed", async () => {
    const { body } = await get("/api/characters");
    // A character in a group of killers counts as a killer
    const fromDeaths: string[] = [];
    for (const character of body.data) {
      for (const killer of character.death?.killed_by ?? []) {
        for (const one of [killer, ...(killer.members ?? [])]) {
          if (one.url !== null) {
            fromDeaths.push(`${new URL(one.url).pathname} ${characterPath(character)}`);
          }
        }
      }
    }
    const fromKilled: string[] = [];
    for (const character of body.data) {
      const ids = character.killed.map((link: { url: string }) => Number(link.url.split("/").pop()));
      assert.deepEqual(ids, [...ids].sort((a: number, b: number) => a - b), `character ${character.id} lists its victims out of order`);
      character.killed.forEach((link: { url: string }) => fromKilled.push(`${characterPath(character)} ${new URL(link.url).pathname}`));
    }
    assert.deepEqual(fromKilled.sort(), fromDeaths.sort());
    // Ben Mears killed Barlow and Susan Norton; Eddie Kaspbrak killed Henry Bowers
    assert.ok(fromKilled.includes("/api/character/202 /api/villain/2"), "no character who isn't a villain is recorded killing one");
  });

  it("describe a death by its cause, a work the character is in, and its killers", async () => {
    const { body } = await get("/api/characters");
    const names = new Map(body.data.map((character: { id: number; villain: boolean; name: string }) => [characterPath(character), character.name]));
    const characterNames = new Set(names.values());
    for (const character of body.data) {
      const keys = Object.keys(character);
      assert.equal(keys[keys.indexOf("status") + 1], "death", `character ${character.id}: death doesn't follow status`);
      if (character.status === "Alive") {
        assert.equal(character.death, null, `character ${character.id} is alive but has a death`);
      }
      if (character.death === null) {
        continue;
      }
      const { death } = character;
      assert.deepEqual(Object.keys(death), ["cause", "work", "killed_by"], `character ${character.id}`);
      assert.ok(
        [...character.books, ...character.shorts].some((work: any) => work.url === death.work.url && work.title === death.work.title),
        `character ${character.id} dies in ${death.work.url}, which isn't one of its works`
      );
      for (const killer of death.killed_by) {
        assert.deepEqual(Object.keys(killer), killer.members ? ["name", "url", "members"] : ["name", "url"]);
        for (const one of [killer, ...(killer.members ?? [])]) {
          if (one.url === null) {
            assert.ok(!characterNames.has(one.name), `character ${character.id}: ${one.name} is a character, but isn't linked`);
          } else {
            assert.equal(one.name, names.get(new URL(one.url).pathname), `character ${character.id} links ${one.url} under the wrong name`);
          }
        }
      }
    }
  });

  it("list a place's residents in every place it's in", async () => {
    const { body } = await get("/api/places");
    const byUrl = new Map(body.data.map((place: { id: number }) => [`/api/place/${place.id}`, place]));
    for (const place of body.data) {
      const parent: any = place.parent && byUrl.get(new URL(place.parent.url).pathname);
      for (const character of parent ? place.characters : []) {
        assert.ok(
          parent.characters.some((c: { url: string }) => c.url === character.url),
          `${character.name} lives in place ${place.id} but isn't listed in ${parent.id}`
        );
      }
    }
  });
});
