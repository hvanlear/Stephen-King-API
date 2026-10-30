// Saves API responses as fixtures, one file per request. They're the baseline
// the contract tests hold the app to, so only re-run this on purpose.
//   npx ts-node test/contract/capture.ts          from production
//   npx ts-node test/contract/capture.ts --local  from this checkout, after a
//                                                 catalog edit; the fixture diff
//                                                 shows what the edit changes
import fs from "fs";
import path from "path";
import type { TestServer } from "../server";

const PRODUCTION_URL = "https://stephen-king-api.onrender.com";
const FIXTURE_DIR = path.join(__dirname, "fixtures");

const PATHS = [
  // Full lists
  "/api/books",
  "/api/shorts",
  "/api/villains",
  // Pagination, including a short last page
  "/api/books?page=1&limit=10",
  "/api/shorts?page=5&limit=50",
  "/api/villains?page=2&limit=100",
  // Details: first, middle and last of each
  "/api/book/1",
  "/api/book/30",
  "/api/book/63",
  "/api/short/1",
  "/api/short/100",
  "/api/short/212",
  "/api/villain/1",
  "/api/villain/60",
  "/api/villain/115",
  // Places: the list, a page, then a world, a town and a building
  "/api/places",
  "/api/places?page=2&limit=50",
  "/api/place/1",
  "/api/place/76",
  "/api/place/170",
  // Types: the list, a broad type and a kind
  "/api/types",
  "/api/type/2",
  "/api/type/16",
  // Collections: the list, a short last page, the first, and one that's also
  // a book
  "/api/collections",
  "/api/collections?page=2&limit=10",
  "/api/collection/1",
  "/api/collection/2",
  "/api/book/12",
  // Not found (72 was the deleted junk book, type 5 the old "group", and
  // collection 16 the old Uncollected)
  "/api/book/72",
  "/api/short/9999",
  "/api/villain/9999",
  "/api/place/9999",
  "/api/type/5",
  "/api/collection/16",
  "/api/collection/9999",
];

function fixtureName(requestPath: string): string {
  return requestPath.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-") + ".json";
}

async function main() {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });

  let baseUrl = PRODUCTION_URL;
  let server: TestServer | undefined;
  if (process.argv.includes("--local")) {
    // Loaded only here: it sets URL, so links match production's
    const { startServer } = await import("../server");
    server = await startServer();
    baseUrl = server.url;
  }

  for (const requestPath of PATHS) {
    const res = await fetch(baseUrl + requestPath);
    const fixture = {
      path: requestPath,
      status: res.status,
      body: await res.json(),
    };
    fs.writeFileSync(
      path.join(FIXTURE_DIR, fixtureName(requestPath)),
      JSON.stringify(fixture, null, 2) + "\n"
    );
    console.log(`${res.status} ${requestPath}`);
  }
  await server?.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
