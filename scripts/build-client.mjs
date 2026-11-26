// Bundles the graph explorer (src/client) into public/assets with hashed
// names, and writes public/assets/manifest.json for the server to read.
// Fails if the brotli size goes over the SK-045 budgets.
//
//   node scripts/build-client.mjs          one build, minified
//   node scripts/build-client.mjs --watch  rebuild on change, for npm run dev

import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const outdir = path.join(root, "public", "assets");
const watch = process.argv.includes("--watch");
const BUDGET = { js: 20 * 1024, css: 10 * 1024 };

const brotli = (file) => zlib.brotliCompressSync(fs.readFileSync(file)).length;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

// Writes the manifest and removes files from earlier builds. Returns false if
// a budget was exceeded.
function finish(result) {
  const outputs = Object.keys(result.metafile.outputs).map((p) => path.resolve(root, p));
  const js = outputs.find((p) => p.endsWith(".js"));
  const css = outputs.find((p) => p.endsWith(".css"));
  if (!js || !css) throw new Error("The build didn't write both a script and a stylesheet");

  const manifest = { js: `/assets/${path.basename(js)}`, css: `/assets/${path.basename(css)}` };
  fs.writeFileSync(path.join(outdir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  const keep = new Set([...outputs.map((p) => path.basename(p)), "manifest.json"]);
  for (const name of fs.readdirSync(outdir)) {
    if (!keep.has(name)) fs.rmSync(path.join(outdir, name));
  }

  let ok = true;
  for (const [kind, file] of [["js", js], ["css", css]]) {
    const size = brotli(file);
    const over = size > BUDGET[kind];
    if (over) ok = false;
    console.log(`${over ? "✗" : "✓"} ${path.basename(file)} ${kb(size)} brotli (budget ${kb(BUDGET[kind])})`);
  }
  return ok;
}

const options = {
  entryPoints: [path.join(root, "src", "client", "main.ts")],
  bundle: true,
  format: "esm",
  target: ["es2020"],
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  entryNames: "graph-[hash]",
  outdir,
  metafile: true,
  logLevel: "warning",
  legalComments: "none",
};

fs.mkdirSync(outdir, { recursive: true });

if (watch) {
  const ctx = await esbuild.context({
    ...options,
    plugins: [
      {
        name: "manifest",
        setup(build) {
          build.onEnd((result) => {
            if (result.errors.length === 0) finish(result);
          });
        },
      },
    ],
  });
  await ctx.watch();
  console.log("Watching src/client for changes");
} else {
  const result = await esbuild.build(options);
  if (!finish(result)) {
    console.error("The graph explorer is over its size budget (SK-045)");
    process.exit(1);
  }
}
