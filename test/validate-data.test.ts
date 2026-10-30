import fs from "fs";
import path from "path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validate, Catalog, SPECS } from "../scripts/validate-data";

const CATALOG_DIR = path.join(__dirname, "..", "catalog");

// A fresh copy of the real catalog, safe to break
function loadCatalog(): any {
  return Object.fromEntries(
    Object.keys(SPECS).map((file) => [
      file,
      JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, file), "utf8")),
    ])
  );
}

function errorsAfter(change: (catalog: any) => void, base?: Catalog): string[] {
  const catalog = loadCatalog();
  change(catalog);
  return validate(catalog, base);
}

const place = (catalog: any, name: string) =>
  catalog["places.json"].find((record: { name: string }) => record.name === name);

function assertFlags(errors: string[], pattern: RegExp): void {
  assert.ok(
    errors.some((error) => pattern.test(error)),
    `expected an error matching ${pattern}, got:\n${errors.join("\n") || "(none)"}`
  );
}

describe("validate-data", () => {
  it("passes the real catalog", () => {
    assert.deepEqual(validate(loadCatalog(), loadCatalog()), []);
  });

  it("flags a handle used twice", () => {
    const errors = errorsAfter((c) => (c["books.json"][1].handle = "carrie"));
    assertFlags(errors, /^catalog\/books\.json: book 2 \("Salem's Lot"\): handle "carrie" is also used by book 1$/);
  });

  it("flags a handle shared by a book and a short", () => {
    const errors = errorsAfter((c) => (c["shorts.json"][0].handle = "carrie"));
    assertFlags(errors, /^catalog\/shorts\.json: short 1 \(.*\): handle "carrie" is also used by book 1, so villains and places would link to both$/);
  });

  it("flags an appears_in handle that matches nothing", () => {
    const errors = errorsAfter((c) => c["villains.json"][0].appears_in.push("no-such-book"));
    assertFlags(errors, /villain 1 \("Bob Anderson"\): appears_in "no-such-book" doesn't match/);
  });

  it("flags a residence that matches no place", () => {
    const errors = errorsAfter((c) => c["villains.json"][0].residence.push("no-such-place"));
    assertFlags(errors, /villain 1 \("Bob Anderson"\): residence "no-such-place" doesn't match any place handle$/);
  });

  it("flags a place appears_in handle that matches nothing", () => {
    const errors = errorsAfter((c) => place(c, "Marsten House").appears_in.push("marsten-house"));
    assertFlags(errors, /place \d+ \("Marsten House"\): appears_in "marsten-house" doesn't match any book or short handle$/);
  });

  it("flags empty strings in lists", () => {
    const errors = errorsAfter((c) => (c["books.json"][1].Notes = [""]));
    assertFlags(errors, /book 2 .*: Notes item 0 must be non-empty text/);
  });

  it("flags unknown and missing fields", () => {
    const errors = errorsAfter((c) => {
      c["villains.json"][0].nickname = "Beadie";
      delete c["shorts.json"][0].year;
    });
    assertFlags(errors, /villain 1 .*: nickname isn't a known field/);
    assertFlags(errors, /short 1 .*: year is missing/);
  });

  it("flags wrong types and bad timestamps", () => {
    const errors = errorsAfter((c) => {
      c["books.json"][0].Pages = "199";
      c["books.json"][0].created_at = "yesterday";
    });
    assertFlags(errors, /book 1 .*: Pages must be a whole number/);
    assertFlags(errors, /book 1 .*: created_at must be a UTC timestamp/);
  });

  it("flags fields out of response order", () => {
    const errors = errorsAfter((c) => {
      const { Year, ...rest } = c["books.json"][0];
      c["books.json"][0] = { ...rest, Year };
    });
    assertFlags(errors, /book 1 .*: fields must be in this order/);
  });

  it("flags ids out of order", () => {
    const errors = errorsAfter((c) => c["shorts.json"].reverse());
    assertFlags(errors, /ids must be in ascending order/);
  });

  it("flags an id removed since the base", () => {
    const errors = errorsAfter((c) => c["books.json"].shift(), loadCatalog());
    assertFlags(errors, /book 1 \("Carrie"\) was removed; ids must never disappear/);
  });

  it("flags a record renumbered since the base", () => {
    const errors = errorsAfter((c) => (c["villains.json"][114].id = 116), loadCatalog());
    assertFlags(errors, /villain 115 .* was renumbered to 116/);
  });

  it("flags a book id the old database used", () => {
    const errors = errorsAfter((c) => {
      const books = c["books.json"];
      books.push({ ...books[books.length - 1], id: 72, Title: "New Book", handle: "new-book", ISBN: "978-0-000-00000-0" });
    });
    assertFlags(errors, /book 72 \("New Book"\): id 72 is retired and can't be reused$/);
  });

  it("flags a place whose parent doesn't exist", () => {
    const errors = errorsAfter((c) => (place(c, "Marsten House").parentId = 9999));
    assertFlags(errors, /^catalog\/places\.json: place \d+ \("Marsten House"\): parentId 9999 doesn't match any place$/);
  });

  it("flags places whose parents loop", () => {
    const errors = errorsAfter((c) => (place(c, "Maine").parentId = place(c, "Marsten House").id));
    assertFlags(errors, /place \d+ \("Marsten House"\): its parents loop back to place \d+$/);
  });

  it("flags an unknown place type", () => {
    const errors = errorsAfter((c) => (place(c, "Derry, Maine").type = "city"));
    assertFlags(errors, /place \d+ \("Derry, Maine"\): type must be one of world, region, country, state, town, landmark, building$/);
  });

  it("lets a place share a handle with a book", () => {
    const errors = errorsAfter((c) => (place(c, "Room 237").handle = "carrie"));
    assert.deepEqual(errors, []);
  });

  it("flags a villain type that doesn't exist", () => {
    const errors = errorsAfter((c) => (c["villains.json"][0].types_id = 5));
    assertFlags(errors, /villain 1 \("Bob Anderson"\): types_id 5 doesn't match any type$/);
  });

  it("flags a kind used as a villain's type", () => {
    const errors = errorsAfter((c) => (c["villains.json"][1].types_id = 11));
    assertFlags(errors, /villain 2 \("Kurt Barlow"\): types_id 11 is a kind/);
  });

  it("flags a kind that isn't under the villain's type", () => {
    const errors = errorsAfter((c) => c["villains.json"][0].kinds.push("type-one-vampire"));
    assertFlags(errors, /villain 1 \("Bob Anderson"\): kinds "type-one-vampire" isn't a kind of "Human", the villain's type$/);
  });

  it("flags a kind that matches no type", () => {
    const errors = errorsAfter((c) => c["villains.json"][0].kinds.push("serial-killer"));
    assertFlags(errors, /villain 1 \("Bob Anderson"\): kinds "serial-killer" doesn't match any type handle$/);
  });

  it("flags a group flag that isn't true or false", () => {
    const errors = errorsAfter((c) => (c["villains.json"][0].group = "no"));
    assertFlags(errors, /villain 1 .*: group must be true or false$/);
  });

  it("flags a type whose parent doesn't exist", () => {
    const errors = errorsAfter((c) => (c["types.json"].find((t: { handle: string }) => t.handle === "werewolf").parentId = 99));
    assertFlags(errors, /^catalog\/types\.json: type \d+ \("Werewolf"\): parentId 99 doesn't match any type$/);
  });

  it("keeps type id 5 retired", () => {
    const errors = errorsAfter((c) => c["types.json"].push({ ...c["types.json"][0], id: 5, name: "Group", handle: "group" }));
    assertFlags(errors, /type 5 \("Group"\): id 5 is retired and can't be reused$/);
  });

  it("flags a short whose collection matches nothing", () => {
    const errors = errorsAfter((c) => (c["shorts.json"][0].collection = "no-such-collection"));
    assertFlags(errors, /^catalog\/shorts\.json: short 1 \(.*\): collection "no-such-collection" doesn't match any collection handle$/);
  });

  it("flags a short whose collectedIn disagrees with its collection", () => {
    const errors = errorsAfter((c) => (c["shorts.json"][0].collection = "night-shift"));
    assertFlags(errors, /short 1 \(.*\): collectedIn "Uncollected" should be "Night Shift \(1978\)", to match its collection$/);
  });

  it("flags a collected short with no collection", () => {
    const errors = errorsAfter((c) => (c["shorts.json"].find((s: { collectedIn: string }) => s.collectedIn === "Night Shift (1978)").collection = null));
    assertFlags(errors, /short \d+ \(.*\): collectedIn "Night Shift \(1978\)" names a collection, so collection needs its handle$/);
  });

  it("flags a collection year that isn't a whole number", () => {
    const errors = errorsAfter((c) => (c["collections.json"][0].year = "1978"));
    assertFlags(errors, /collection 1 \("Night Shift"\): year must be a whole number$/);
  });

  it("flags a collection that shares a handle with a different book", () => {
    const errors = errorsAfter((c) => (c["collections.json"][0].handle = "carrie"));
    assertFlags(errors, /collection 1 \("Night Shift"\): handle "carrie" is also used by book 1 \("Carrie", 1974\), so it would link to that book$/);
  });

  it("lets a retired collection id disappear, but not come back", () => {
    const base = loadCatalog();
    const uncollected = { ...base["collections.json"][0], id: 16, name: "Uncollected", handle: "uncollected" };
    base["collections.json"].push(uncollected);
    assert.deepEqual(errorsAfter(() => {}, base), []);
    const errors = errorsAfter((c) => c["collections.json"].push(uncollected));
    assertFlags(errors, /collection 16 \("Uncollected"\): id 16 is retired and can't be reused$/);
  });

  it("flags a collection removed since the base", () => {
    const errors = errorsAfter((c) => c["collections.json"].pop(), loadCatalog());
    assertFlags(errors, /collection 18 \("People, Places and Things"\) was removed; ids must never disappear/);
  });

  it("flags a short whose publication matches nothing", () => {
    const errors = errorsAfter((c) => (c["shorts.json"][2].publication = "no-such-publication"));
    assertFlags(errors, /^catalog\/shorts\.json: short 3 \("Jumper"\): publication "no-such-publication" doesn't match any publication handle$/);
  });

  it("flags a short whose originallyPublishedIn disagrees with its publication", () => {
    const errors = errorsAfter((c) => (c["shorts.json"][2].publication = "cavalier"));
    assertFlags(errors, /short 3 \("Jumper"\): originallyPublishedIn "Dave's Rag \(1959\)" should name "Cavalier", with an issue at most, to match its publication$/);
  });

  it("flags a publication whose name only starts the venue", () => {
    // McSweeney's Mammoth Treasury of Thrilling Tales is its own publication
    const errors = errorsAfter((c) => (c["shorts.json"][152].publication = "mcsweeney-s"));
    assertFlags(errors, /short 153 \("The Tale of Gray Dick"\): originallyPublishedIn "McSweeney's Mammoth Treasury of Thrilling Tales \(March 25, 2003\)" should name "McSweeney's", with an issue at most/);
  });

  it("allows a publication name with no issue or date", () => {
    const errors = errorsAfter((c) => (c["shorts.json"][2].originallyPublishedIn = "Dave's Rag"));
    assert.deepEqual(errors, []);
  });

  it("flags a missing publication for a short whose text only ends with a collection name", () => {
    const errors = errorsAfter((c) => {
      c["shorts.json"][2].publication = null;
      c["shorts.json"][2].originallyPublishedIn = "Tales of Night Shift (1959)";
    });
    assertFlags(errors, /short 3 \("Jumper"\): publication is null, but originallyPublishedIn "Tales of Night Shift \(1959\)" names where it first appeared$/);
  });

  it("flags a missing publication for a short that names one", () => {
    const errors = errorsAfter((c) => (c["shorts.json"][2].publication = null));
    assertFlags(errors, /short 3 \("Jumper"\): publication is null, but originallyPublishedIn "Dave's Rag \(1959\)" names where it first appeared$/);
  });

  it("flags a publication named like a collection", () => {
    const errors = errorsAfter((c) => (c["publications.json"][0].name = "Night Shift"));
    assertFlags(errors, /publication 1 \("Night Shift"\): that's a collection, so its shorts link to it through collection instead$/);
  });

  it("flags a publication type that isn't on the list", () => {
    const errors = errorsAfter((c) => (c["publications.json"][0].type = "zine"));
    assertFlags(errors, /publication 1 \("Dave's Rag"\): type must be one of magazine, anthology, newspaper, other$/);
  });

  it("flags a publication removed since the base", () => {
    const errors = errorsAfter((c) => c["publications.json"].pop(), loadCatalog());
    assertFlags(errors, /publication 87 \("Scribd"\) was removed; ids must never disappear/);
  });

  it("allows new records with new ids", () => {
    const errors = errorsAfter((c) => {
      const books = c["books.json"];
      const last = books[books.length - 1];
      books.push({ ...last, id: Math.max(last.id + 1, 73), Title: "New Book", handle: "new-book", ISBN: "978-0-000-00000-0" });
    }, loadCatalog());
    assert.deepEqual(errors, []);
  });
});
