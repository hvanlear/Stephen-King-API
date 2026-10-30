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
  collectedIn: string;
  notes: string[];
  year: number;
  created_at: string;
}

export interface Villain {
  id: number;
  name: string;
  gender: string | null;
  status: string;
  types_id: number;
  appears_in: string[];
  notes: string[];
  created_at: string;
}

export interface Place {
  id: number;
  name: string;
  handle: string;
  type: string;
  parentId: number | null;
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
export const villains = load<Villain>("villains.json");
export const places = load<Place>("places.json");

// Links come from each villain's appears_in handles. Building them in
// villain order matches what Postgres returned: a book's villains are in
// villain id order, and a villain's books follow its appears_in order.
// Like the old insert script, a handle links to the first book with it and
// the first short with it, so a handle used by both links to both.
export const villainIdsByBook = new Map<number, number[]>();
export const villainIdsByShort = new Map<number, number[]>();
export const bookIdsByVillain = new Map<number, number[]>();
export const shortIdsByVillain = new Map<number, number[]>();

function link(map: Map<number, number[]>, key: number, value: number): void {
  const ids = map.get(key);
  if (ids) {
    ids.push(value);
  } else {
    map.set(key, [value]);
  }
}

for (const villain of villains) {
  for (const handle of villain.appears_in) {
    const book = books.find((b) => b.handle === handle);
    if (book) {
      link(villainIdsByBook, book.id, villain.id);
      link(bookIdsByVillain, villain.id, book.id);
    }
  }
  for (const handle of villain.appears_in) {
    const short = shorts.find((s) => s.handle === handle);
    if (short) {
      link(villainIdsByShort, short.id, villain.id);
      link(shortIdsByVillain, villain.id, short.id);
    }
  }
}

// The places in each place, in id order
export const placeIdsByParent = new Map<number, number[]>();

for (const place of places) {
  if (place.parentId !== null) {
    link(placeIdsByParent, place.parentId, place.id);
  }
}
