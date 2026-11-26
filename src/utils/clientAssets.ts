import fs from "fs";
import path from "path";
import config from "../config";

// The hashed script and stylesheet that scripts/build-client.mjs wrote. Read
// once in production; re-read on each request elsewhere, so a rebuild in
// watch mode shows up on reload.

export interface ClientAssets {
  js: string;
  css: string;
}

const MANIFEST = path.join(__dirname, "..", "..", "public", "assets", "manifest.json");
let cached: ClientAssets | null | undefined;

export function clientAssets(): ClientAssets | null {
  if (cached !== undefined && config.stage === "production") return cached;
  try {
    cached = JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as ClientAssets;
  } catch {
    // Not built yet: the page still renders, without the graph
    cached = null;
  }
  return cached;
}
