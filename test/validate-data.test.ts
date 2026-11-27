import fs from "fs";
import path from "path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validate, duplicateKeys, Catalog, SPECS } from "../scripts/validate-data";

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

const character = (catalog: any, id: number) =>
  catalog["characters.json"].find((record: { id: number }) => record.id === id);

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
    assertFlags(errors, /^catalog\/shorts\.json: short 1 \(.*\): handle "carrie" is also used by book 1, so characters and places would link to both$/);
  });

  it("flags an appears_in handle that matches nothing", () => {
    const errors = errorsAfter((c) => (c["characters.json"][0].appears_in["no-such-book"] = null));
    assertFlags(errors, /character 1 \("Bob Anderson"\): appears_in "no-such-book" doesn't match/);
  });

  it("flags an appears_in that isn't handles with roles, or a role it doesn't know", () => {
    const errors = errorsAfter((c) => {
      character(c, 1).appears_in = ["a-good-marriage"];
      character(c, 2).appears_in = { "salem-s-lot": "villain" };
    });
    assertFlags(errors, /character 1 .*: appears_in must be an object of book or short handles, each with a role \(protagonist, antagonist, supporting, minor\) or null$/);
    assertFlags(errors, /character 2 .*: appears_in "salem-s-lot" has the role "villain", but a role is one of protagonist, antagonist, supporting, minor, or null until it's recorded$/);
  });

  it("flags roles recorded for some of a character's works but not all", () => {
    // Christine's role in It is recorded, so her role in Christine has to be too
    const errors = errorsAfter((c) => (character(c, 11).appears_in.christine = null));
    assertFlags(errors, /character 11 \("Christine \(car\)"\): appears_in has roles for some works but not "christine"; record them all or none$/);
  });

  it("flags an antagonist who isn't a villain, but lets a villain be a protagonist", () => {
    const errors = errorsAfter((c) => {
      character(c, 202).appears_in["salem-s-lot"] = "antagonist";
      character(c, 179).appears_in = { rage: "protagonist" };
    });
    assertFlags(errors, /character 202 \("Ben Mears"\): appears_in "salem-s-lot" is "antagonist", but the character isn't a villain$/);
    assert.ok(!errors.some((e) => e.includes("character 179")), errors.join("\n"));
  });

  it("flags a residence that matches no place", () => {
    const errors = errorsAfter((c) => c["characters.json"][0].residence.push("no-such-place"));
    assertFlags(errors, /character 1 \("Bob Anderson"\): residence "no-such-place" doesn't match any place handle$/);
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
      c["characters.json"][0].nickname = "Beadie";
      delete c["shorts.json"][0].year;
    });
    assertFlags(errors, /character 1 .*: nickname isn't a known field/);
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
    const errors = errorsAfter((c) => (c["characters.json"][114].id = 116), loadCatalog());
    assertFlags(errors, /character 115 .* was renumbered to 116/);
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
    const errors = errorsAfter((c) => (c["characters.json"][0].types_id = 5));
    assertFlags(errors, /character 1 \("Bob Anderson"\): types_id 5 doesn't match any type$/);
  });

  it("flags a kind used as a villain's type", () => {
    const errors = errorsAfter((c) => (c["characters.json"][1].types_id = 11));
    assertFlags(errors, /character 2 \("Kurt Barlow"\): types_id 11 is a kind/);
  });

  it("flags a kind that isn't under the villain's type", () => {
    const errors = errorsAfter((c) => c["characters.json"][0].kinds.push("type-one-vampire"));
    assertFlags(errors, /character 1 \("Bob Anderson"\): kinds "type-one-vampire" isn't a kind of "Human", the character's type$/);
  });

  it("flags a kind that matches no type", () => {
    const errors = errorsAfter((c) => c["characters.json"][0].kinds.push("serial-killer"));
    assertFlags(errors, /character 1 \("Bob Anderson"\): kinds "serial-killer" doesn't match any type handle$/);
  });

  it("flags a group or villain flag that isn't true or false", () => {
    const errors = errorsAfter((c) => {
      c["characters.json"][0].group = "no";
      c["characters.json"][1].villain = "yes";
    });
    assertFlags(errors, /character 1 .*: group must be true or false$/);
    assertFlags(errors, /character 2 .*: villain must be true or false$/);
  });

  it("flags a villain that stopped being one since the base", () => {
    const errors = errorsAfter((c) => (character(c, 57).villain = false), loadCatalog());
    assertFlags(errors, /^catalog\/characters\.json: character 57 \("It \(Creature\)"\): was a villain on the base branch, so it has to stay one, or \/api\/villain\/57 would disappear$/);
  });

  it("finds a key written twice in one object, which JSON.parse would drop", () => {
    // A work listed twice in appears_in: only the last role would count
    const text = '[\n  { "id": 1, "appears_in": { "it": "protagonist",\n    "it": "minor" } },\n  { "id": 2, "appears_in": { "it": null } }\n]';
    assert.deepEqual(duplicateKeys(text), [{ key: "it", line: 3 }]);
    // Equal keys in different objects, inside strings, or as values are fine
    assert.deepEqual(duplicateKeys('[{ "a": "b:c", "b": "a" }, { "a": 1, "x": { "a": [{ "a": 2 }] } }]'), []);
    assert.deepEqual(duplicateKeys('{ "a\\"": 1, "a": 2 }'), []);
    // The catalog has none
    for (const file of Object.keys(SPECS)) {
      assert.deepEqual(duplicateKeys(fs.readFileSync(path.join(__dirname, "..", "catalog", file), "utf8")), [], file);
    }
  });

  it("lets a character who isn't a villain become one, once its killer links say so", () => {
    // Nobody's death names Matt Burke, so nothing else has to change
    assert.deepEqual(errorsAfter((c) => (character(c, 205).villain = true), loadCatalog()), []);
    // Ben Mears killed Barlow and Susan Norton, so both links have to become { villain: 202 }
    const errors = errorsAfter((c) => (character(c, 202).villain = true), loadCatalog());
    assertFlags(errors, /character 2 .*: death\.killed_by 0 character 202 is a villain, so it should be \{ "villain": 202 \}$/);
    assertFlags(errors, /character 204 .*: death\.killed_by 0 character 202 is a villain, so it should be \{ "villain": 202 \}$/);
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

  it("flags a status that isn't Alive or Deceased", () => {
    const errors = errorsAfter((c) => (character(c, 1).status = "Dead"));
    assertFlags(errors, /character 1 \("Bob Anderson"\): status must be one of Alive, Deceased$/);
  });

  it("flags a death recorded for a villain who's alive", () => {
    const errors = errorsAfter((c) => {
      const alive = c["characters.json"].find((v: any) => v.status === "Alive");
      alive.death = { cause: "Shot", in: { book: Object.keys(alive.appears_in)[0] }, killed_by: [] };
    });
    assertFlags(errors, /character \d+ .*: is Alive, so death must be null$/);
  });

  it("flags a death that isn't null or an object", () => {
    const errors = errorsAfter((c) => (character(c, 98).death = "Drained of blood"));
    assertFlags(errors, /character 98 \("Richard Straker"\): death must be null or an object$/);
  });

  it("flags death fields missing or out of order", () => {
    const errors = errorsAfter((c) => {
      const { cause, ...rest } = character(c, 98).death;
      character(c, 98).death = { ...rest, cause };
      delete character(c, 2).death.cause;
    });
    assertFlags(errors, /character 98 .*: death must have exactly these fields, in this order: cause, in, killed_by$/);
    assertFlags(errors, /character 2 .*: death\.cause must be non-empty text of at most 60 characters/);
  });

  it("flags a cause that's too long", () => {
    const errors = errorsAfter((c) => (character(c, 98).death.cause = "Drained ".repeat(8).trim()));
    assertFlags(errors, /character 98 .*: death\.cause must be non-empty text of at most 60 characters/);
  });

  it("flags a death in a book the villain isn't in", () => {
    const errors = errorsAfter((c) => (character(c, 98).death.in = { book: "carrie" }));
    assertFlags(errors, /character 98 .*: death\.in "carrie" isn't in appears_in, so the character isn't in that book$/);
  });

  it("flags a death in a work of the wrong kind, or of both kinds", () => {
    const errors = errorsAfter((c) => {
      character(c, 98).death.in = { short: "salem-s-lot" };
      character(c, 2).death.in = { book: "salem-s-lot", short: "one-for-the-road" };
    });
    assertFlags(errors, /character 98 .*: death\.in "salem-s-lot" doesn't match any short handle$/);
    assertFlags(errors, /character 2 .*: death\.in must be \{ "book": handle \} or \{ "short": handle \}$/);
  });

  it("flags a killer who has no record, or is the victim", () => {
    const errors = errorsAfter((c) => {
      character(c, 98).death.killed_by = [{ villain: 9999 }];
      character(c, 2).death.killed_by = [{ villain: 2 }];
      character(c, 7).death.killed_by = [{ character: 9999 }];
    });
    assertFlags(errors, /character 98 .*: death\.killed_by 0 villain 9999 doesn't match any character$/);
    assertFlags(errors, /character 2 .*: death\.killed_by 0 is the character itself; a suicide has an empty killed_by$/);
    assertFlags(errors, /character 7 .*: death\.killed_by 0 character 9999 doesn't match any character$/);
  });

  it("flags a killer linked in the wrong form for a villain or not", () => {
    const errors = errorsAfter((c) => {
      character(c, 98).death.killed_by = [{ character: 2 }];
      character(c, 2).death.killed_by = [{ villain: 202 }];
    });
    assertFlags(errors, /character 98 .*: death\.killed_by 0 character 2 is a villain, so it should be \{ "villain": 2 \}$/);
    assertFlags(errors, /character 2 .*: death\.killed_by 0 villain 202 is not a villain, so it should be \{ "character": 202 \}$/);
  });

  it("flags a killer named like a character who isn't a villain, who should be linked", () => {
    const errors = errorsAfter((c) => (character(c, 2).death.killed_by = [{ name: "Ben Mears" }]));
    assertFlags(errors, /character 2 .*: death\.killed_by 0 "Ben Mears" is character 202, so it should be \{ "character": 202 \}$/);
  });

  it("flags a killer named like a villain, who should be linked", () => {
    const errors = errorsAfter((c) => (character(c, 98).death.killed_by = [{ name: "kurt barlow" }]));
    assertFlags(errors, /character 98 .*: death\.killed_by 0 "kurt barlow" is villain 2, so it should be \{ "villain": 2 \}$/);
  });

  it("flags a killer listed twice, even as a group's member", () => {
    const errors = errorsAfter((c) => character(c, 57).death.killed_by.push({ character: 207 }));
    assertFlags(errors, /character 57 .*: death\.killed_by 1 lists character 207 again$/);
  });

  it("flags a killer with both forms, neither, or a field it can't have", () => {
    const errors = errorsAfter((c) => {
      character(c, 98).death.killed_by = [{ villain: 2, name: "Kurt" }, { weapon: "teeth" }];
      character(c, 57).death.killed_by[0].members[0].members = [{ name: "Silver" }];
    });
    assertFlags(errors, /character 98 .*: death\.killed_by 0 needs exactly one of villain \(an id\), character \(an id\) or name$/);
    assertFlags(errors, /character 98 .*: death\.killed_by 1 has weapon, but a killer has only villain, character or name, and members for a group$/);
    assertFlags(errors, /character 57 .*: death\.killed_by 0 member 0 has members, but a member has only villain, character or name$/);
  });

  it("flags a group with an empty list of members", () => {
    const errors = errorsAfter((c) => (character(c, 57).death.killed_by[0].members = []));
    assertFlags(errors, /character 57 .*: death\.killed_by 0 members must be a non-empty list, or left out$/);
  });

  it("flags a death recorded on the base but wiped since", () => {
    const errors = errorsAfter((c) => (character(c, 57).death = null), loadCatalog());
    assertFlags(errors, /character 57 \("It \(Creature\)"\): death was recorded on the base branch but is now null, and status is still Deceased$/);
  });

  it("lets a death go back to null when the character is alive again", () => {
    const errors = errorsAfter((c) => {
      character(c, 57).death = null;
      character(c, 57).status = "Alive";
    }, loadCatalog());
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
