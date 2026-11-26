// Checks catalog/*.json before it ships. Run with: npm run validate-data
// With --base <git ref>, it also fails if an id was removed or renumbered
// compared with that ref, or a villain stopped being one. CI passes the PR's
// target branch.
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
  | "nullable object" // checked in detail elsewhere
  | "roles" // handles, each with a role or null (see checkRoles)
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
  // Characters and places link to these records through appears_in
  linkable?: boolean;
  // Handed out and then taken back, so never used again. Only a retired id
  // may disappear since the base.
  retiredIds?: number[];
}

// Broadest first. A place's parent is the place it's in.
export const PLACE_TYPES = ["world", "region", "country", "state", "town", "landmark", "building"] as const;

// Where a short first appeared. "other" covers King's own small books,
// convention books, websites and ebook stores.
export const PUBLICATION_TYPES = ["magazine", "anthology", "newspaper", "other"] as const;

// A character's status. A death is only recorded for one who's deceased.
export const STATUSES = ["Alive", "Deceased"] as const;

// A character's part in each book or short it's in (src/catalog.ts)
export const ROLES = ["protagonist", "antagonist", "supporting", "minor"] as const;

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
      // A publication handle, served as a link. null when the short first
      // appeared in a collection, on its own, or nowhere recorded.
      publication: "nullable text",
      collectedIn: "string",
      // A collection handle, served as a link, or null if it was never collected
      collection: "nullable text",
      notes: "list",
      year: "integer",
      created_at: "timestamp",
    },
    unique: ["id", "handle", "title"],
  },
  // Villains used to be villains.json, which a base branch may still have
  "characters.json": {
    label: "character",
    nameField: "name",
    identity: "name",
    fields: {
      id: "id",
      name: "text",
      // Also served at /api/villain/:id, so a villain stays one (see compareVillains)
      villain: "boolean",
      gender: "nullable text",
      status: { oneOf: STATUSES },
      // How the character died: null until it's recorded (see checkDeaths)
      death: "nullable object",
      // A broad type from types.json, one with no parent
      types_id: "id",
      // Whether the record is a gang, race or other set of characters
      group: "boolean",
      // Book and short handles, each with the character's role there
      appears_in: "roles",
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
  "publications.json": {
    label: "publication",
    nameField: "name",
    identity: "handle",
    fields: {
      id: "id",
      name: "text",
      handle: "text",
      type: { oneOf: PUBLICATION_TYPES },
      created_at: "timestamp",
    },
    unique: ["id", "handle", "name"],
  },
};

// File name → parsed contents
export type Catalog = Record<string, unknown>;

type CatalogRecord = Record<string, unknown>;

// Novellas that were also published as standalone books, so each is in both
// files. A character listing one of these handles links to both records. Any
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
    case "nullable object":
      return value === null || (typeof value === "object" && !Array.isArray(value))
        ? null
        : "must be null or an object";
    case "roles": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return `must be an object of book or short handles, each with a role (${ROLES.join(", ")}) or null`;
      }
      const bad = Object.entries(value).find(([, role]) => role !== null && !ROLES.includes(role));
      return bad === undefined
        ? null
        : `${JSON.stringify(bad[0])} has the role ${JSON.stringify(bad[1])}, but a role is one of ${ROLES.join(", ")}, or null until it's recorded`;
    }
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
          fail(record, index, `handle ${JSON.stringify(record.handle)} is also used by ${owner}, so characters and places would link to both`);
        }
      }
    });
  }

  // Links are built from these lists of handles, so every handle has to resolve
  const places = catalog["places.json"];
  const placeHandles = new Set(Array.isArray(places) ? places.map((place: CatalogRecord) => place?.handle) : []);
  errors.push(...checkHandles(catalog, "characters.json", "appears_in", linkable, "book or short"));
  errors.push(...checkHandles(catalog, "characters.json", "residence", placeHandles, "place"));
  errors.push(...checkHandles(catalog, "places.json", "appears_in", linkable, "book or short"));
  const types = catalog["types.json"];
  const typeHandles = new Set(Array.isArray(types) ? types.map((type: CatalogRecord) => type?.handle) : []);
  errors.push(...checkHandles(catalog, "characters.json", "kinds", typeHandles, "type"));
  errors.push(...checkCharacterTypes(catalog["characters.json"], types));
  errors.push(...checkRoles(catalog["characters.json"]));
  errors.push(...checkDeaths(catalog["characters.json"], catalog["books.json"], catalog["shorts.json"]));
  errors.push(...checkCollections(catalog["shorts.json"], catalog["collections.json"], catalog["books.json"]));
  errors.push(...checkPublications(catalog["shorts.json"], catalog["publications.json"], catalog["collections.json"]));

  errors.push(...checkParents("places.json", places));
  errors.push(...checkParents("types.json", types));

  if (base) {
    errors.push(...compareIds(catalog, base));
    errors.push(...compareVillains(catalog, base));
    errors.push(...compareDeaths(catalog, base));
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
    const value = record?.[field];
    // A character's appears_in names its works as keys, with a role each
    const handles = Array.isArray(value) ? value : value !== null && typeof value === "object" ? Object.keys(value) : null;
    if (handles === null) {
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

// How the checks below name a character
const characterLabel = (character: CatalogRecord, index: number) =>
  `catalog/characters.json: character ${character?.id ?? `at position ${index}`} (${JSON.stringify(character?.name)})`;

const isRoles = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// Roles are recorded for all of a character's books and shorts at once, so
// a book's protagonists are never half listed. Only a villain can be an
// antagonist: anyone who is one belongs at /api/villains.
function checkRoles(characters: unknown): string[] {
  if (!Array.isArray(characters)) {
    return [];
  }
  const errors: string[] = [];
  characters.forEach((character: CatalogRecord, index) => {
    if (!isRoles(character?.appears_in)) {
      return;
    }
    const fail = (message: string) => errors.push(`${characterLabel(character, index)}: ${message}`);
    const entries = Object.entries(character.appears_in);
    const unset = entries.filter(([, role]) => role === null).map(([handle]) => handle);
    if (unset.length && unset.length < entries.length) {
      fail(`appears_in has roles for some works but not ${unset.map((h) => JSON.stringify(h)).join(", ")}; record them all or none`);
    }
    for (const [handle, role] of entries) {
      if (role === "antagonist" && character.villain !== true) {
        fail(`appears_in ${JSON.stringify(handle)} is "antagonist", but the character isn't a villain`);
      }
    }
  });
  return errors;
}

// A character's types_id has to be a broad type, and each of its kinds has
// to sit under that type, so a type lists the same characters the characters list
function checkCharacterTypes(characters: unknown, types: unknown): string[] {
  if (!Array.isArray(characters) || !Array.isArray(types)) {
    return [];
  }
  const errors: string[] = [];
  const byId = new Map<unknown, CatalogRecord>(types.map((type: CatalogRecord) => [type?.id, type]));
  const byHandle = new Map<unknown, CatalogRecord>(types.map((type: CatalogRecord) => [type?.handle, type]));
  characters.forEach((character: CatalogRecord, index) => {
    if (!Number.isSafeInteger(character?.types_id)) {
      return;
    }
    const where = characterLabel(character, index);
    const type = byId.get(character.types_id);
    if (!type) {
      errors.push(`${where}: types_id ${character.types_id} doesn't match any type`);
      return;
    }
    if (type.parentId !== null) {
      errors.push(`${where}: types_id ${character.types_id} is a kind, so it goes in kinds, and types_id is the type above it`);
      return;
    }
    for (const handle of Array.isArray(character.kinds) ? character.kinds : []) {
      const kind = byHandle.get(handle);
      const ancestors = new Set<unknown>();
      for (let parent = byId.get(kind?.parentId); parent && !ancestors.has(parent.id); parent = byId.get(parent.parentId)) {
        ancestors.add(parent.id);
      }
      if (kind && !ancestors.has(character.types_id)) {
        errors.push(`${where}: kinds ${JSON.stringify(handle)} isn't a kind of ${JSON.stringify(type.name)}, the character's type`);
      }
    }
  });
  return errors;
}

// A cause is a short phrase, such as "Staked through the heart". Who did it
// goes in killed_by.
const CAUSE_LENGTH = 60;
const DEATH_FIELDS = ["cause", "in", "killed_by"];

// A recorded death needs a cause, the book or short it happens in, which has
// to be one the character appears in, and who killed them (an empty list
// when nobody did). Each killer is { "villain": id } for a villain,
// { "character": id } for any other character, or, for someone with no
// record yet, a name; a group of killers can list its members the same way.
// A name can't be a character's name, since that killer has a record to link.
function checkDeaths(characters: unknown, books: unknown, shorts: unknown): string[] {
  if (!Array.isArray(characters)) {
    return [];
  }
  const errors: string[] = [];
  const handlesOf = (records: unknown) =>
    new Set<unknown>(Array.isArray(records) ? records.map((record: CatalogRecord) => record?.handle) : []);
  const handles = { book: handlesOf(books), short: handlesOf(shorts) };
  const byId = new Map<unknown, CatalogRecord>(characters.map((character: CatalogRecord) => [character?.id, character]));
  const byName = new Map<string, CatalogRecord>(
    characters
      .filter((character: CatalogRecord) => typeof character?.name === "string")
      .map((character: CatalogRecord) => [(character.name as string).toLowerCase(), character])
  );
  // The form a killer with a record takes
  const formFor = (character: CatalogRecord) =>
    `{ "${character.villain === true ? "villain" : "character"}": ${character.id} }`;

  characters.forEach((character: CatalogRecord, index) => {
    const death = character?.death;
    // The field rule reports a death that isn't null or an object
    if (death === null || typeof death !== "object" || Array.isArray(death)) {
      return;
    }
    const fail = (message: string) => errors.push(`${characterLabel(character, index)}: ${message}`);
    const record = death as CatalogRecord;

    if (character.status === "Alive") {
      fail("is Alive, so death must be null");
    }
    if (Object.keys(record).join() !== DEATH_FIELDS.join()) {
      fail(`death must have exactly these fields, in this order: ${DEATH_FIELDS.join(", ")}`);
    }
    if (!isText(record.cause) || (record.cause as string).length > CAUSE_LENGTH) {
      fail(`death.cause must be non-empty text of at most ${CAUSE_LENGTH} characters, without surrounding spaces`);
    }

    const work = record.in;
    const kinds = work !== null && typeof work === "object" && !Array.isArray(work) ? Object.keys(work) : [];
    if (kinds.length !== 1 || (kinds[0] !== "book" && kinds[0] !== "short")) {
      fail(`death.in must be { "book": handle } or { "short": handle }`);
    } else {
      const kind = kinds[0] as "book" | "short";
      const handle = (work as CatalogRecord)[kind];
      if (!handles[kind].has(handle)) {
        fail(`death.in ${JSON.stringify(handle)} doesn't match any ${kind} handle`);
      } else if (!isRoles(character.appears_in) || !Object.hasOwn(character.appears_in, handle as string)) {
        fail(`death.in ${JSON.stringify(handle)} isn't in appears_in, so the character isn't in that ${kind}`);
      }
    }

    if (!Array.isArray(record.killed_by)) {
      fail("death.killed_by must be a list, empty if nobody killed them");
      return;
    }
    const listed = new Set<string>();
    const checkKiller = (entry: unknown, label: string, member: boolean) => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        fail(`${label} must be an object`);
        return;
      }
      const killer = entry as CatalogRecord;
      const forms = ["villain", "character", "name"];
      const allowed = member ? forms : [...forms, "members"];
      const unknown = Object.keys(killer).filter((field) => !allowed.includes(field));
      if (unknown.length) {
        fail(`${label} has ${unknown.join(", ")}, but ${member ? "a member has only villain, character or name" : "a killer has only villain, character or name, and members for a group"}`);
      }
      const given = forms.filter((form) => form in killer);
      let key: string | undefined;
      if (given.length !== 1) {
        fail(`${label} needs exactly one of villain (an id), character (an id) or name`);
      } else if (given[0] !== "name") {
        const form = given[0];
        const id = killer[form];
        const target = byId.get(id);
        if (!target) {
          fail(`${label} ${form} ${JSON.stringify(id)} doesn't match any character`);
        } else if (id === character.id) {
          fail(`${label} is the character itself; a suicide has an empty killed_by`);
        } else if ((target.villain === true) !== (form === "villain")) {
          fail(`${label} ${form} ${id} is ${target.villain === true ? "a villain" : "not a villain"}, so it should be ${formFor(target)}`);
        }
        key = `${form} ${JSON.stringify(id)}`;
      } else if (!isText(killer.name)) {
        fail(`${label} name must be non-empty text without surrounding spaces`);
      } else {
        const target = byName.get((killer.name as string).toLowerCase());
        if (target) {
          fail(`${label} ${JSON.stringify(killer.name)} is ${target.villain === true ? "villain" : "character"} ${target.id}, so it should be ${formFor(target)}`);
        }
        key = `name ${JSON.stringify((killer.name as string).toLowerCase())}`;
      }
      if (key !== undefined && listed.has(key)) {
        fail(`${label} lists ${key} again`);
      }
      if (key !== undefined) {
        listed.add(key);
      }
      if (!member && "members" in killer) {
        if (!Array.isArray(killer.members) || !killer.members.length) {
          fail(`${label} members must be a non-empty list, or left out`);
        } else {
          killer.members.forEach((one, k) => checkKiller(one, `${label} member ${k}`, true));
        }
      }
    };
    record.killed_by.forEach((entry, k) => checkKiller(entry, `death.killed_by ${k}`, false));
  });
  return errors;
}

// How the checks below name a short
const shortLabel = (short: CatalogRecord, index: number) =>
  `catalog/shorts.json: short ${short?.id ?? `at position ${index}`} (${JSON.stringify(short?.title)})`;

// handle → record, for the handles a short stores
const byHandle = (records: CatalogRecord[]) =>
  new Map<unknown, CatalogRecord>(records.map((record) => [record?.handle, record]));

// A short's collection has to exist and say the same as its collectedIn
// text, such as "Night Shift (1978)", so the two can't drift apart. Only an
// uncollected short has none. A collection that shares a handle with a book
// links to it, so it has to be that book.
function checkCollections(shorts: unknown, collections: unknown, books: unknown): string[] {
  if (!Array.isArray(shorts) || !Array.isArray(collections)) {
    return [];
  }
  const errors: string[] = [];
  const collectionsByHandle = byHandle(collections);
  const label = (collection: CatalogRecord) => `${collection.name} (${collection.year})`;
  shorts.forEach((short: CatalogRecord, index) => {
    const where = shortLabel(short, index);
    if (short?.collection === null) {
      if (typeof short.collectedIn === "string" && !UNCOLLECTED.includes(short.collectedIn)) {
        errors.push(`${where}: collectedIn ${JSON.stringify(short.collectedIn)} names a collection, so collection needs its handle`);
      }
      return;
    }
    if (typeof short?.collection !== "string") {
      return;
    }
    const collection = collectionsByHandle.get(short.collection);
    if (!collection) {
      errors.push(`${where}: collection ${JSON.stringify(short.collection)} doesn't match any collection handle`);
    } else if (short.collectedIn !== label(collection)) {
      errors.push(`${where}: collectedIn ${JSON.stringify(short.collectedIn)} should be ${JSON.stringify(label(collection))}, to match its collection`);
    }
  });
  const booksByHandle = byHandle(Array.isArray(books) ? books : []);
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

// The venue in an originallyPublishedIn text is what's left once the date in
// parentheses is gone: "Cavalier (October 1970)" gives "Cavalier"
const venueOf = (text: string) => text.replace(/\s*\([^()]*\)$/, "");

// What may follow a publication's name in the venue: an issue or volume, as
// in "Shadows 4", "Antaeus #75/76" and "Satyricon II"
const ISSUE = /^ (#?\d+(\/\d+)?|[IVXLC]+)$/;

// A short's publication has to exist, and the venue in its
// originallyPublishedIn text has to be that publication's name, with an
// issue at most, as "Cavalier (October 1970)" and "Shadows 4 (October 1981)"
// are. A short has none only when the text is empty, or names the short
// itself, a collection or an edition of one, which collection links already
// cover. So a publication can't be named like a collection either.
function checkPublications(shorts: unknown, publications: unknown, collections: unknown): string[] {
  if (!Array.isArray(shorts) || !Array.isArray(publications)) {
    return [];
  }
  const errors: string[] = [];
  const publicationsByHandle = byHandle(publications);
  const collectionNames: unknown[] = Array.isArray(collections)
    ? collections.map((collection: CatalogRecord) => collection?.name).filter(isText)
    : [];
  shorts.forEach((short: CatalogRecord, index) => {
    const text = short?.originallyPublishedIn;
    if (typeof text !== "string") {
      return;
    }
    const where = shortLabel(short, index);
    const venue = venueOf(text);
    if (typeof short.publication === "string") {
      const publication = publicationsByHandle.get(short.publication);
      if (!publication) {
        errors.push(`${where}: publication ${JSON.stringify(short.publication)} doesn't match any publication handle`);
        return;
      }
      const name = String(publication.name);
      const issue = venue.startsWith(name) ? venue.slice(name.length) : null;
      if (issue === null || (issue !== "" && !ISSUE.test(issue))) {
        errors.push(`${where}: originallyPublishedIn ${JSON.stringify(text)} should name ${JSON.stringify(name)}, with an issue at most, to match its publication`);
      }
    } else if (short.publication === null) {
      const covered =
        venue === "" ||
        venue === short.title ||
        collectionNames.some((name) => venue === name || venue.endsWith(` edition of ${name}`));
      if (!covered) {
        errors.push(`${where}: publication is null, but originallyPublishedIn ${JSON.stringify(text)} names where it first appeared`);
      }
    }
  });
  for (const publication of publications as CatalogRecord[]) {
    if (collectionNames.includes(publication?.name)) {
      errors.push(
        `catalog/publications.json: publication ${publication.id} (${JSON.stringify(publication.name)}): that's a collection, so its shorts link to it through collection instead`
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

// A villain is also served at /api/villain/:id, so one can't stop being a
// villain: its villain route would disappear. On a base branch from before
// characters, every record was a villain.
function compareVillains(catalog: Catalog, base: Catalog): string[] {
  const now = catalog["characters.json"];
  const before = base["characters.json"];
  if (!Array.isArray(now) || !Array.isArray(before)) {
    return [];
  }
  const nowById = new Map<unknown, CatalogRecord>(now.map((character: CatalogRecord) => [character?.id, character]));
  const errors: string[] = [];
  for (const old of before as CatalogRecord[]) {
    const current = nowById.get(old?.id);
    if (old?.villain !== false && current && current.villain !== true) {
      errors.push(
        `catalog/characters.json: character ${old.id} (${JSON.stringify(old.name)}): was a villain on the base branch, so it has to stay one, or /api/villain/${old.id} would disappear`
      );
    }
  }
  return errors;
}

// A recorded death can be corrected but not wiped back to null, unless the
// character's status changed too, so a data batch can't undo an earlier one
function compareDeaths(catalog: Catalog, base: Catalog): string[] {
  const now = catalog["characters.json"];
  const before = base["characters.json"];
  if (!Array.isArray(now) || !Array.isArray(before)) {
    return [];
  }
  const nowById = new Map<unknown, CatalogRecord>(now.map((character: CatalogRecord) => [character?.id, character]));
  const errors: string[] = [];
  for (const old of before as CatalogRecord[]) {
    // undefined on a base branch from before deaths were recorded
    if (old?.death === null || old?.death === undefined) {
      continue;
    }
    const current = nowById.get(old.id);
    if (current?.death === null && current.status === old.status) {
      errors.push(
        `catalog/characters.json: character ${old.id} (${JSON.stringify(old.name)}): death was recorded on the base branch but is now null, and status is still ${old.status}`
      );
    }
  }
  return errors;
}

// The names files had before, which a base branch may still use
const FORMER_FILES: Record<string, string> = { "characters.json": "villains.json" };

function readCatalog(read: (file: string) => string): { catalog: Catalog; errors: string[] } {
  const catalog: Catalog = {};
  const errors: string[] = [];
  for (const file of Object.keys(SPECS)) {
    try {
      catalog[file] = JSON.parse(read(file));
    } catch (error) {
      // A base branch from before a rename has the file under its old name
      try {
        if (!(file in FORMER_FILES)) {
          throw error;
        }
        catalog[file] = JSON.parse(read(FORMER_FILES[file]));
      } catch {
        errors.push(`catalog/${file}: couldn't be read: ${(error as Error).message}`);
      }
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
