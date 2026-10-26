// Saves production responses as fixtures, one file per request. They are the
// baseline the JSON-file rewrite has to match, so only re-run this on purpose.
// Run with: npx ts-node test/contract/capture.ts
import fs from "fs";
import path from "path";

const BASE_URL = "https://stephen-king-api.onrender.com";
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
  // Not found (72 was the deleted junk book)
  "/api/book/72",
  "/api/short/9999",
  "/api/villain/9999",
];

function fixtureName(requestPath: string): string {
  return requestPath.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-") + ".json";
}

async function main() {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });

  for (const requestPath of PATHS) {
    const res = await fetch(BASE_URL + requestPath);
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
