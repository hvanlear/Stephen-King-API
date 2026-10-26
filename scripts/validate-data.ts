// Checks catalog/*.json before it ships. Run with: npm run validate-data
// With --base <git ref>, it also fails if an id was removed or renumbered
// compared with that ref. CI passes the PR's target branch.
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

type FieldRule =
  | "id"
  | "integer"
  | "text" // non-empty string
  | "string" // may be empty
  | "nullable text"
  | "list" // of non-empty strings
  | "timestamp";

interface FileSpec {
  label: string;
  // Names the record in error messages
  nameField: string;
  // Stays with a record for life, so a different id means it was renumbered
  identity: string;
  // In the order the API returns them, since records are served as they are
  fields: Record<string, FieldRule>;
  unique: string[];
}

export const SPECS: Record<string, FileSpec> = {
  "books.json": {
    label: "book",
    nameField: "Title",
    identity: "handle",
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
  },
  "shorts.json": {
    label: "short",
    nameField: "title",
    identity: "handle",
    fields: {
      id: "id",
      title: "text",
      type: "text",
      handle: "text",
      originallyPublishedIn: "string",
      collectedIn: "string",
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
      types_id: "integer",
      appears_in: "list",
      notes: "list",
      created_at: "timestamp",
    },
    unique: ["id", "name"],
  },
};

// File name → parsed contents
export type Catalog = Record<string, unknown>;

type CatalogRecord = Record<string, unknown>;

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

const isText = (value: unknown) =>
  typeof value === "string" && value !== "" && value === value.trim();

function checkField(rule: FieldRule, value: unknown): string | null {
  switch (rule) {
    case "id":
      return Number.isSafeInteger(value) && (value as number) > 0
        ? null
        : "must be a positive whole number";
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
  const linkable = new Set<string>(); // book and short handles

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
      }

      if (spec.identity === "handle" && typeof record.handle === "string") {
        linkable.add(record.handle);
      }
    });
  }

  // Villain links are built from appears_in, so every handle has to resolve
  const villains = catalog["villains.json"];
  if (Array.isArray(villains)) {
    villains.forEach((villain: CatalogRecord, index) => {
      if (!Array.isArray(villain?.appears_in)) {
        return;
      }
      const where = `catalog/villains.json: villain ${villain.id ?? `at position ${index}`} (${JSON.stringify(villain.name)})`;
      const listed = new Set<unknown>();
      for (const handle of villain.appears_in) {
        if (listed.has(handle)) {
          errors.push(`${where}: appears_in lists ${JSON.stringify(handle)} twice`);
        } else if (typeof handle === "string" && !linkable.has(handle)) {
          errors.push(`${where}: appears_in ${JSON.stringify(handle)} doesn't match any book or short handle`);
        }
        listed.add(handle);
      }
    });
  }

  if (base) {
    errors.push(...compareIds(catalog, base));
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
