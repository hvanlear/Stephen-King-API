import fs from "fs";
import path from "path";

export interface Book {
  id: number;
  Year: number;
  Title: string;
  handle: string;
  Publisher: string;
  ISBN: string;
  Pages: number;
  Notes: string[];
  created_at: string;
}

export interface Short {
  id: number;
  title: string;
  type: string;
  handle: string;
  originallyPublishedIn: string;
  publication: string | null;
  collectedIn: string;
  collection: string | null;
  notes: string[];
  year: number;
  created_at: string;
}

// Who killed a character: a villain, another character, or a name for
// someone the catalog has no record of yet. A name becomes an id once the
// record exists, without changing the shape the API serves.
export type Killer = { villain: number } | { character: number } | { name: string };

// A group of killers, such as the Losers' Club, can list the members who
// took part, in the same forms
export type KillerEntry = Killer & { members?: Killer[] };

// How a character died, and in which book or short. A handle can name both a
// book and a short, so it says which.
export interface Death {
  cause: string;
  in: { book: string } | { short: string };
  killed_by: KillerEntry[];
}

// A character's part in one book or short. Jack Torrance is the antagonist
// of The Shining and a minor character in Doctor Sleep.
export const ROLES = ["protagonist", "antagonist", "supporting", "minor"] as const;
export type Role = (typeof ROLES)[number];

// Every villain is a character. Whether a character is a protagonist comes
// from its roles.
export interface Character {
  id: number;
  name: string;
  // Served by /api/villain/:id as well, as before characters existed
  villain: boolean;
  gender: string | null;
  status: "Alive" | "Deceased";
  // null until it's recorded, and always for a character who's alive
  death: Death | null;
  types_id: number;
  group: boolean;
  // The books and shorts it's in, by handle, with its role in each: null
  // until the roles are recorded, which happens for all of a character's
  // works at once
  appears_in: Record<string, Role | null>;
  residence: string[];
  kinds: string[];
  notes: string[];
  created_at: string;
}

export interface Place {
  id: number;
  name: string;
  handle: string;
  type: string;
  parentId: number | null;
  appears_in: string[];
  created_at: string;
}

export interface Type {
  id: number;
  name: string;
  handle: string;
  parentId: number | null;
  created_at: string;
}

export interface Collection {
  id: number;
  name: string;
  handle: string;
  year: number;
  created_at: string;
}

export interface Publication {
  id: number;
  name: string;
  handle: string;
  type: "magazine" | "anthology" | "newspaper" | "other";
  created_at: string;
}

// catalog/ sits next to both src/ and dist/
const CATALOG_DIR = path.join(__dirname, "..", "catalog");

// Read once at startup. Bad ids stop the server from starting rather than
// serving a broken catalog.
function load<T extends { id: number }>(file: string): T[] {
  const records: T[] = JSON.parse(
    fs.readFileSync(path.join(CATALOG_DIR, file), "utf8")
  );
  const seen = new Set<number>();
  for (const record of records) {
    if (!Number.isSafeInteger(record.id) || record.id < 1) {
      throw new Error(`catalog/${file}: invalid id ${JSON.stringify(record.id)}`);
    }
    if (seen.has(record.id)) {
      throw new Error(`catalog/${file}: duplicate id ${record.id}`);
    }
    seen.add(record.id);
  }
  // Sorted by id so lists and pages are stable
  return records.sort((a, b) => a.id - b.id);
}

export const books = load<Book>("books.json");
export const shorts = load<Short>("shorts.json");
export const characters = load<Character>("characters.json");
// The villains keep their own routes, as a view of the characters
export const villains = characters.filter((character) => character.villain);
export const places = load<Place>("places.json");
export const types = load<Type>("types.json");
export const collections = load<Collection>("collections.json");
export const publications = load<Publication>("publications.json");

// Links come from each character's appears_in handles. Building them in
// character order matches what Postgres returned for villains: a book's
// characters are in id order, and a character's books follow its appears_in
// order. Like the old insert script, a handle links to the first book with
// it and the first short with it, so a handle used by both links to both,
// with the same role.
export const characterIdsByBook = new Map<number, number[]>();
export const characterIdsByShort = new Map<number, number[]>();
export const bookIdsByCharacter = new Map<number, number[]>();
export const shortIdsByCharacter = new Map<number, number[]>();

function link(map: Map<number, number[]>, key: number, value: number): void {
  const ids = map.get(key);
  if (ids) {
    ids.push(value);
  } else {
    map.set(key, [value]);
  }
}

const bookWithHandle = (handle: string) => books.find((b) => b.handle === handle);
const shortWithHandle = (handle: string) => shorts.find((s) => s.handle === handle);

// A character's role in a book or short, by the work's handle: null until
// recorded, and undefined if it isn't in that work
export const roleIn = (character: Character, handle: string): Role | null | undefined =>
  Object.hasOwn(character.appears_in, handle) ? character.appears_in[handle] : undefined;

// Leads at least one book or short
export const isProtagonist = (character: Character) => Object.values(character.appears_in).includes("protagonist");

for (const character of characters) {
  for (const handle of Object.keys(character.appears_in)) {
    const book = bookWithHandle(handle);
    if (book) {
      link(characterIdsByBook, book.id, character.id);
      link(bookIdsByCharacter, character.id, book.id);
    }
  }
  for (const handle of Object.keys(character.appears_in)) {
    const short = shortWithHandle(handle);
    if (short) {
      link(characterIdsByShort, short.id, character.id);
      link(shortIdsByCharacter, character.id, short.id);
    }
  }
}

// The record id a killer links to, or undefined for a name with no record
export const killerId = (killer: Killer): number | undefined =>
  "villain" in killer ? killer.villain : "character" in killer ? killer.character : undefined;

// Where each recorded death happens, and the characters each character
// killed, in victim id order. Killing as a group's member counts.
export const deathWorkByCharacter = new Map<number, { book: number } | { short: number }>();
export const victimIdsByCharacter = new Map<number, number[]>();

for (const character of characters) {
  if (character.death === null) {
    continue;
  }
  const where = character.death.in;
  const work = "book" in where ? bookWithHandle(where.book) : shortWithHandle(where.short);
  if (work) {
    deathWorkByCharacter.set(character.id, "book" in where ? { book: work.id } : { short: work.id });
  }
  const killers = new Set<number>();
  for (const { members = [], ...killer } of character.death.killed_by) {
    for (const one of [killer, ...members]) {
      const id = killerId(one);
      if (id !== undefined) {
        killers.add(id);
      }
    }
  }
  killers.forEach((id) => link(victimIdsByCharacter, id, character.id));
}

// The places in each place, in id order
export const placeIdsByParent = new Map<number, number[]>();

for (const place of places) {
  if (place.parentId !== null) {
    link(placeIdsByParent, place.parentId, place.id);
  }
}

// A place's books and shorts come from its own appears_in, in id order. A
// work's places are in place id order, broadest first.
export const bookIdsByPlace = new Map<number, number[]>();
export const shortIdsByPlace = new Map<number, number[]>();
export const placeIdsByBook = new Map<number, number[]>();
export const placeIdsByShort = new Map<number, number[]>();

for (const place of places) {
  for (const handle of place.appears_in) {
    const book = bookWithHandle(handle);
    if (book) {
      link(bookIdsByPlace, place.id, book.id);
      link(placeIdsByBook, book.id, place.id);
    }
    const short = shortWithHandle(handle);
    if (short) {
      link(shortIdsByPlace, place.id, short.id);
      link(placeIdsByShort, short.id, place.id);
    }
  }
  bookIdsByPlace.get(place.id)?.sort((a, b) => a - b);
  shortIdsByPlace.get(place.id)?.sort((a, b) => a - b);
}

// A character who lives in a place also lives in every place it's in, so a
// town lists the characters in its buildings, in id order. A character
// lists only the places its residence names, in that order.
export const characterIdsByPlace = new Map<number, number[]>();
export const placeIdsByCharacter = new Map<number, number[]>();

const placeIdsByHandle = new Map(places.map((p) => [p.handle, p.id]));
const parentIds = new Map(places.map((p) => [p.id, p.parentId]));

for (const character of characters) {
  const homes = new Set<number>();
  for (const handle of character.residence) {
    let id: number | null | undefined = placeIdsByHandle.get(handle);
    if (id !== undefined) {
      link(placeIdsByCharacter, character.id, id);
    }
    while (id !== undefined && id !== null) {
      homes.add(id);
      id = parentIds.get(id);
    }
  }
  homes.forEach((id) => link(characterIdsByPlace, id, character.id));
}

// Types nest like places: a broad type such as Vampire holds the kinds from
// the stories, such as the True Knot. A type lists every character of that
// type or a kind inside it, in id order; a character lists its own kinds.
export const typeIdsByParent = new Map<number, number[]>();
export const characterIdsByType = new Map<number, number[]>();
export const kindIdsByCharacter = new Map<number, number[]>();

const typeIdsByHandle = new Map(types.map((t) => [t.handle, t.id]));
const typeParentIds = new Map(types.map((t) => [t.id, t.parentId]));

for (const type of types) {
  if (type.parentId !== null) {
    link(typeIdsByParent, type.parentId, type.id);
  }
}

for (const character of characters) {
  const typeIds = new Set<number>([character.types_id]);
  for (const handle of character.kinds) {
    let id: number | null | undefined = typeIdsByHandle.get(handle);
    if (id !== undefined) {
      link(kindIdsByCharacter, character.id, id);
    }
    while (id !== undefined && id !== null) {
      typeIds.add(id);
      id = typeParentIds.get(id);
    }
  }
  typeIds.forEach((id) => link(characterIdsByType, id, character.id));
}

// Each collected short names the collection it was published in, so a
// collection lists its shorts in short id order. A collection that's also a catalog book, such
// as The Gunslinger, shares the book's handle, and the two link to each other.
export const shortIdsByCollection = new Map<number, number[]>();
export const collectionIdByShort = new Map<number, number>();
export const collectionIdByBook = new Map<number, number>();
export const bookIdByCollection = new Map<number, number>();

const collectionIdsByHandle = new Map(collections.map((c) => [c.handle, c.id]));

for (const short of shorts) {
  const id = short.collection === null ? undefined : collectionIdsByHandle.get(short.collection);
  if (id !== undefined) {
    link(shortIdsByCollection, id, short.id);
    collectionIdByShort.set(short.id, id);
  }
}

for (const collection of collections) {
  const book = bookWithHandle(collection.handle);
  if (book) {
    collectionIdByBook.set(book.id, collection.id);
    bookIdByCollection.set(collection.id, book.id);
  }
}

// A short names the magazine, anthology or other publication it first
// appeared in, and a publication lists its shorts in short id order. Shorts
// that first appeared in their own collection, or on their own, have none.
export const shortIdsByPublication = new Map<number, number[]>();
export const publicationIdByShort = new Map<number, number>();

const publicationIdsByHandle = new Map(publications.map((p) => [p.handle, p.id]));

for (const short of shorts) {
  const id = short.publication === null ? undefined : publicationIdsByHandle.get(short.publication);
  if (id !== undefined) {
    link(shortIdsByPublication, id, short.id);
    publicationIdByShort.set(short.id, id);
  }
}
