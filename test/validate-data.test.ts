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
    assertFlags(errors, /book 72 \("New Book"\): id 72 was used by the old database and can't be reused$/);
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

  it("allows new records with new ids", () => {
    const errors = errorsAfter((c) => {
      const books = c["books.json"];
      const last = books[books.length - 1];
      books.push({ ...last, id: Math.max(last.id + 1, 73), Title: "New Book", handle: "new-book", ISBN: "978-0-000-00000-0" });
    }, loadCatalog());
    assert.deepEqual(errors, []);
  });
});
