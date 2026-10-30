// Checks catalog/*.json before it ships. Run with: npm run validate-data
// With --base <git ref>, it also fails if an id was removed or renumbered
// compared with that ref. CI passes the PR's target branch.
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

type FieldRule =
  | "id"
  | "nullable id"
  | "integer"
  | "text" // non-empty string
  | "string" // may be empty
  | "nullable text"
  | "list" // of non-empty strings
  | "boolean"
  | "timestamp"
  | { oneOf: readonly string[] };

interface FileSpec {
  label: string;
  // Names the record in error messages
  nameField: string;
  // Stays with a record for life, so a different id means it was renumbered
  identity: string;
  // In the order the API returns them, since records are served as they are
  fields: Record<string, FieldRule>;
  unique: string[];
  // Villains and places link to these records through appears_in
  linkable?: boolean;
  // Handed out and then taken back, so never used again. Only a retired id
  // may disappear since the base.
  retiredIds?: number[];
}

// Broadest first. A place's parent is the place it's in.
export const PLACE_TYPES = ["world", "region", "country", "state", "town", "landmark", "building"] as const;

export const SPECS: Record<string, FileSpec> = {
  "books.json": {
    label: "book",
    nameField: "Title",
    identity: "handle",
    linkable: true,
    fields: {
      id: "id",
      Year: "integer",
      Title: "text",
      handle: "text",
      Publisher: "text",
      ISBN: "text",
      Pages: "integer",
      Notes: "list",
      created_at: "timestamp",
    },
    unique: ["id", "handle", "Title", "ISBN"],
    // The old database used up 64–71 on writes that failed or were deleted,
    // and served 72 as a junk book until it was removed
    retiredIds: [64, 65, 66, 67, 68, 69, 70, 71, 72],
  },
  "shorts.json": {
    label: "short",
    nameField: "title",
    identity: "handle",
    linkable: true,
    fields: {
      id: "id",
      title: "text",
      type: "text",
      handle: "text",
      originallyPublishedIn: "string",
      collectedIn: "string",
      // A collection handle, served as a link, or null if it was never collected
      collection: "nullable text",
      notes: "list",
      year: "integer",
      created_at: "timestamp",
    },
    unique: ["id", "handle", "title"],
  },
  "villains.json": {
    label: "villain",
    nameField: "name",
    identity: "name",
    fields: {
      id: "id",
      name: "text",
      gender: "nullable text",
      status: "text",
      // A broad type from types.json, one with no parent
      types_id: "id",
      // Whether the record is a gang, race or other set of villains
      group: "boolean",
      appears_in: "list",
      // Place handles, served as links
      residence: "list",
      // Type handles for the in-universe kinds under types_id, served as links
      kinds: "list",
      notes: "list",
      created_at: "timestamp",
    },
    unique: ["id", "name"],
  },
  "places.json": {
    label: "place",
    nameField: "name",
    identity: "handle",
    fields: {
      id: "id",
      name: "text",
      handle: "text",
      type: { oneOf: PLACE_TYPES },
      parentId: "nullable id",
      appears_in: "list",
      created_at: "timestamp",
    },
    unique: ["id", "handle", "name"],
  },
  "types.json": {
    label: "type",
    nameField: "name",
    identity: "handle",
    fields: {
      id: "id",
      name: "text",
      handle: "text",
      parentId: "nullable id",
      created_at: "timestamp",
    },
    unique: ["id", "handle", "name"],
    // 5 meant "group" in the old database. Groups are now flagged on the
    // villain, so 5 stays unused rather than coming back meaning something else.
    retiredIds: [5],
  },
  "collections.json": {
    label: "collection",
    nameField: "name",
    identity: "handle",
    fields: {
      id: "id",
      name: "text",
      handle: "text",
      year: "integer",
      created_at: "timestamp",
    },
    unique: ["id", "handle", "name"],
    // 16 and 17 were Uncollected and Uncollected (standalone book). Shorts that
    // were never collected now have no collection rather than a record.
    retiredIds: [16, 17],
  },
};

// File name → parsed contents
export type Catalog = Record<string, unknown>;

type CatalogRecord = Record<string, unknown>;

// Novellas that were also published as standalone books, so each is in both
// files. A villain listing one of these handles links to both records. Any
// other handle shared between books and shorts is a mistake.
const SHARED_HANDLES = new Set(["cycle-of-the-werewolf", "gwendy-s-button-box", "elevation"]);

// What collectedIn says for a short with no collection
const UNCOLLECTED = ["Uncollected", "Uncollected (standalone book)"];

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

const isText = (value: unknown) =>
  typeof value === "string" && value !== "" && value === value.trim();

function checkField(rule: FieldRule, value: unknown): string | null {
  if (typeof rule === "object") {
    return rule.oneOf.includes(value as string) ? null : `must be one of ${rule.oneOf.join(", ")}`;
  }
  switch (rule) {
    case "id":
      return Number.isSafeInteger(value) && (value as number) > 0
        ? null
        : "must be a positive whole number";
    case "nullable id":
      return value === null || (Number.isSafeInteger(value) && (value as number) > 0)
        ? null
        : "must be null or a positive whole number";
    case "integer":
      return Number.isSafeInteger(value) ? null : "must be a whole number";
    case "text":
      return isText(value)
        ? null
        : "must be non-empty text without surrounding spaces";
    case "string":
      return typeof value === "string" && value === value.trim()
        ? null
        : "must be text without surrounding spaces";
    case "nullable text":
      return value === null || isText(value)
        ? null
        : "must be null or non-empty text without surrounding spaces";
    case "list": {
      if (!Array.isArray(value)) {
        return "must be a list";
      }
      const bad = value.findIndex((item) => !isText(item));
      return bad === -1
        ? null
        : `item ${bad} must be non-empty text without surrounding spaces, got ${JSON.stringify(value[bad])}`;
    }
    case "boolean":
      return typeof value === "boolean" ? null : "must be true or false";
    case "timestamp":
      return typeof value === "string" &&
        TIMESTAMP.test(value) &&
        !Number.isNaN(Date.parse(value))
        ? null
        : "must be a UTC timestamp like 2023-11-13T23:48:47.848Z";
  }
}

export function validate(catalog: Catalog, base?: Catalog): string[] {
  const errors: string[] = [];
  const linkable = new Map<string, string>(); // book and short handles → first record using it

  for (const [file, spec] of Object.entries(SPECS)) {
    const records = catalog[file];
    if (!Array.isArray(records)) {
      errors.push(`catalog/${file}: must be a list of records`);
      continue;
    }

    const describe = (record: CatalogRecord, index: number) =>
      Number.isSafeInteger(record.id)
        ? `${spec.label} ${record.id} (${JSON.stringify(record[spec.nameField])})`
        : `${spec.label} at position ${index}`;
    const fail = (record: CatalogRecord, index: number, message: string) =>
      errors.push(`catalog/${file}: ${describe(record, index)}: ${message}`);

    const expectedFields = Object.keys(spec.fields);
    const seen: Record<string, Map<unknown, number>> = {};
    spec.unique.forEach((field) => (seen[field] = new Map()));
    let previousId = 0;

    records.forEach((value, index) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        errors.push(`catalog/${file}: record at position ${index} must be an object`);
        return;
      }
      const record = value as CatalogRecord;
      const fields = Object.keys(record);

      const missing = expectedFields.filter((field) => !(field in record));
      const unknown = fields.filter((field) => !(field in spec.fields));
      missing.forEach((field) => fail(record, index, `${field} is missing`));
      unknown.forEach((field) =>
        fail(record, index, `${field} isn't a known field, and would show up in API responses`)
      );
      if (!missing.length && !unknown.length && fields.join() !== expectedFields.join()) {
        fail(record, index, `fields must be in this order: ${expectedFields.join(", ")}`);
      }

      for (const field of expectedFields) {
        if (field in record) {
          const problem = checkField(spec.fields[field], record[field]);
          if (problem) {
            fail(record, index, `${field} ${problem}`);
          }
        }
      }

      for (const field of spec.unique) {
        if (record[field] === undefined) {
          continue;
        }
        const other = seen[field].get(record[field]);
        if (other !== undefined) {
          fail(record, index, `${field} ${JSON.stringify(record[field])} is also used by ${spec.label} ${other}`);
        } else {
          seen[field].set(record[field], record.id as number);
        }
      }

      if (Number.isSafeInteger(record.id)) {
        if ((record.id as number) < previousId) {
          fail(record, index, `ids must be in ascending order, but this comes after ${previousId}`);
        }
        previousId = Math.max(previousId, record.id as number);
        if (spec.retiredIds?.includes(record.id as number)) {
          fail(record, index, `id ${record.id} is retired and can't be reused`);
        }
      }

      if (spec.linkable && typeof record.handle === "string") {
        const owner = linkable.get(record.handle);
        if (owner === undefined) {
          linkable.set(record.handle, `${spec.label} ${record.id}`);
        } else if (!owner.startsWith(`${spec.label} `) && !SHARED_HANDLES.has(record.handle)) {
          fail(record, index, `handle ${JSON.stringify(record.handle)} is also used by ${owner}, so villains and places would link to both`);
        }
      }
    });
  }

  // Links are built from these lists of handles, so every handle has to resolve
  const places = catalog["places.json"];
  const placeHandles = new Set(Array.isArray(places) ? places.map((place: CatalogRecord) => place?.handle) : []);
  errors.push(...checkHandles(catalog, "villains.json", "appears_in", linkable, "book or short"));
  errors.push(...checkHandles(catalog, "villains.json", "residence", placeHandles, "place"));
  errors.push(...checkHandles(catalog, "places.json", "appears_in", linkable, "book or short"));
  const types = catalog["types.json"];
  const typeHandles = new Set(Array.isArray(types) ? types.map((type: CatalogRecord) => type?.handle) : []);
  errors.push(...checkHandles(catalog, "villains.json", "kinds", typeHandles, "type"));
  errors.push(...checkVillainTypes(catalog["villains.json"], types));
  errors.push(...checkCollections(catalog["shorts.json"], catalog["collections.json"], catalog["books.json"]));

  errors.push(...checkParents("places.json", places));
  errors.push(...checkParents("types.json", types));

  if (base) {
    errors.push(...compareIds(catalog, base));
  }

  return errors;
}

function checkHandles(
  catalog: Catalog,
  file: string,
  field: string,
  known: { has(handle: string): boolean },
  kind: string
): string[] {
  const records = catalog[file];
  if (!Array.isArray(records)) {
    return [];
  }
  const { label, nameField } = SPECS[file];
  const errors: string[] = [];
  records.forEach((record: CatalogRecord, index) => {
    const handles = record?.[field];
    if (!Array.isArray(handles)) {
      return;
    }
    const where = `catalog/${file}: ${label} ${record.id ?? `at position ${index}`} (${JSON.stringify(record[nameField])})`;
    const listed = new Set<unknown>();
    for (const handle of handles) {
      if (listed.has(handle)) {
        errors.push(`${where}: ${field} lists ${JSON.stringify(handle)} twice`);
      } else if (typeof handle === "string" && !known.has(handle)) {
        errors.push(`${where}: ${field} ${JSON.stringify(handle)} doesn't match any ${kind} handle`);
      }
      listed.add(handle);
    }
  });
  return errors;
}

// A villain's types_id has to be a broad type, and each of its kinds has to
// sit under that type, so a type lists the same villains the villains list
function checkVillainTypes(villains: unknown, types: unknown): string[] {
  if (!Array.isArray(villains) || !Array.isArray(types)) {
    return [];
  }
  const errors: string[] = [];
  const byId = new Map<unknown, CatalogRecord>(types.map((type: CatalogRecord) => [type?.id, type]));
  const byHandle = new Map<unknown, CatalogRecord>(types.map((type: CatalogRecord) => [type?.handle, type]));
  villains.forEach((villain: CatalogRecord, index) => {
    if (!Number.isSafeInteger(villain?.types_id)) {
      return;
    }
    const where = `catalog/villains.json: villain ${villain.id ?? `at position ${index}`} (${JSON.stringify(villain.name)})`;
    const type = byId.get(villain.types_id);
    if (!type) {
      errors.push(`${where}: types_id ${villain.types_id} doesn't match any type`);
      return;
    }
    if (type.parentId !== null) {
      errors.push(`${where}: types_id ${villain.types_id} is a kind, so it goes in kinds, and types_id is the type above it`);
      return;
    }
    for (const handle of Array.isArray(villain.kinds) ? villain.kinds : []) {
      const kind = byHandle.get(handle);
      const ancestors = new Set<unknown>();
      for (let parent = byId.get(kind?.parentId); parent && !ancestors.has(parent.id); parent = byId.get(parent.parentId)) {
        ancestors.add(parent.id);
      }
      if (kind && !ancestors.has(villain.types_id)) {
        errors.push(`${where}: kinds ${JSON.stringify(handle)} isn't a kind of ${JSON.stringify(type.name)}, the villain's type`);
      }
    }
  });
  return errors;
}

// A short's collection has to exist and say the same as its collectedIn
// text, such as "Night Shift (1978)", so the two can't drift apart. Only an
// uncollected short has none. A collection that shares a handle with a book
// links to it, so it has to be that book.
function checkCollections(shorts: unknown, collections: unknown, books: unknown): string[] {
  if (!Array.isArray(shorts) || !Array.isArray(collections)) {
    return [];
  }
  const errors: string[] = [];
  const byHandle = new Map<unknown, CatalogRecord>(
    collections.map((collection: CatalogRecord) => [collection?.handle, collection])
  );
  const label = (collection: CatalogRecord) => `${collection.name} (${collection.year})`;
  shorts.forEach((short: CatalogRecord, index) => {
    const where = `catalog/shorts.json: short ${short?.id ?? `at position ${index}`} (${JSON.stringify(short?.title)})`;
    if (short?.collection === null) {
      if (typeof short.collectedIn === "string" && !UNCOLLECTED.includes(short.collectedIn)) {
        errors.push(`${where}: collectedIn ${JSON.stringify(short.collectedIn)} names a collection, so collection needs its handle`);
      }
      return;
    }
    if (typeof short?.collection !== "string") {
      return;
    }
    const collection = byHandle.get(short.collection);
    if (!collection) {
      errors.push(`${where}: collection ${JSON.stringify(short.collection)} doesn't match any collection handle`);
    } else if (short.collectedIn !== label(collection)) {
      errors.push(`${where}: collectedIn ${JSON.stringify(short.collectedIn)} should be ${JSON.stringify(label(collection))}, to match its collection`);
    }
  });
  const booksByHandle = new Map<unknown, CatalogRecord>(
    Array.isArray(books) ? books.map((book: CatalogRecord) => [book?.handle, book]) : []
  );
  for (const collection of collections as CatalogRecord[]) {
    const book = booksByHandle.get(collection?.handle);
    if (book && (book.Title !== collection.name || book.Year !== collection.year)) {
      errors.push(
        `catalog/collections.json: collection ${collection.id} (${JSON.stringify(collection.name)}): handle ${JSON.stringify(collection.handle)} is also used by book ${book.id} (${JSON.stringify(book.Title)}, ${book.Year}), so it would link to that book`
      );
    }
  }
  return errors;
}

// Every parent has to exist, and following parents has to end at the top
function checkParents(file: string, records: unknown): string[] {
  if (!Array.isArray(records)) {
    return [];
  }
  const { label, nameField } = SPECS[file];
  const errors: string[] = [];
  const byId = new Map<unknown, CatalogRecord>(records.map((record: CatalogRecord) => [record?.id, record]));
  for (const record of records as CatalogRecord[]) {
    if (!Number.isSafeInteger(record?.parentId)) {
      continue;
    }
    const where = `catalog/${file}: ${label} ${record.id} (${JSON.stringify(record[nameField])})`;
    if (!byId.has(record.parentId)) {
      errors.push(`${where}: parentId ${record.parentId} doesn't match any ${label}`);
      continue;
    }
    const visited = new Set<unknown>([record.id]);
    for (let parent = byId.get(record.parentId); parent; parent = byId.get(parent.parentId)) {
      if (visited.has(parent.id)) {
        errors.push(`${where}: its parents loop back to ${label} ${parent.id}`);
        break;
      }
      visited.add(parent.id);
    }
  }
  return errors;
}

// Consumers bookmark ids, so they can never disappear or move to another record
function compareIds(catalog: Catalog, base: Catalog): string[] {
  const errors: string[] = [];
  for (const [file, spec] of Object.entries(SPECS)) {
    const before = base[file];
    const now = catalog[file];
    if (!Array.isArray(before) || !Array.isArray(now)) {
      continue;
    }
    const nowById = new Map(now.map((record: CatalogRecord) => [record.id, record]));
    const nowByIdentity = new Map(
      now.map((record: CatalogRecord) => [record[spec.identity], record.id])
    );
    for (const old of before as CatalogRecord[]) {
      const identity = old[spec.identity];
      const label = `${spec.label} ${old.id} (${JSON.stringify(old[spec.nameField])})`;
      const current = nowById.get(old.id);
      const movedTo = nowByIdentity.get(identity);
      if (!current && spec.retiredIds?.includes(old.id as number)) {
        continue;
      }
      if (!current) {
        errors.push(
          movedTo !== undefined
            ? `catalog/${file}: ${label} was renumbered to ${movedTo}; ids must never change`
            : `catalog/${file}: ${label} was removed; ids must never disappear`
        );
      } else if (current[spec.identity] !== identity && movedTo !== undefined && movedTo !== old.id) {
        errors.push(`catalog/${file}: ${label} was renumbered to ${movedTo}; ids must never change`);
      }
    }
  }
  return errors;
}

function readCatalog(read: (file: string) => string): { catalog: Catalog; errors: string[] } {
  const catalog: Catalog = {};
  const errors: string[] = [];
  for (const file of Object.keys(SPECS)) {
    try {
      catalog[file] = JSON.parse(read(file));
    } catch (error) {
      errors.push(`catalog/${file}: couldn't be read: ${(error as Error).message}`);
    }
  }
  return { catalog, errors };
}

function main(): void {
  const args = process.argv.slice(2);
  const baseRef = args[0] === "--base" ? args[1] : undefined;

  const catalogDir = path.join(__dirname, "..", "catalog");
  const current = readCatalog((file) => fs.readFileSync(path.join(catalogDir, file), "utf8"));
  const errors = [...current.errors];

  let base: Catalog | undefined;
  if (baseRef) {
    // Fail loudly rather than skip the comparison if the ref wasn't fetched
    try {
      execFileSync("git", ["rev-parse", "--verify", "--quiet", `${baseRef}^{commit}`]);
    } catch {
      console.error(`Can't find ${baseRef} to compare ids with. Fetch it first.`);
      process.exit(1);
    }
    base = readCatalog((file) =>
      execFileSync("git", ["show", `${baseRef}:catalog/${file}`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
    ).catalog; // a file missing on the base branch just has nothing to compare
  }

  errors.push(...validate(current.catalog, base));

  if (errors.length) {
    errors.forEach((error) => console.error(error));
    console.error(`\n${errors.length} problem${errors.length === 1 ? "" : "s"} found`);
    process.exit(1);
  }
  const counts = Object.entries(current.catalog)
    .map(([file, records]) => `${(records as unknown[]).length} ${file.replace(".json", "")}`)
    .join(", ");
  console.log(`Catalog OK: ${counts}${baseRef ? `; no ids removed or renumbered since ${baseRef}` : ""}`);
}

if (require.main === module) {
  main();
}
