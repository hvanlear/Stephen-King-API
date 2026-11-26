// npm run dev: the server under nodemon, and the graph explorer rebuilt on
// every change to src/client, side by side. Stopping either stops both.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const run = (args) => spawn(process.execPath, args, { stdio: "inherit" });

const children = [
  run(["scripts/build-client.mjs", "--watch"]),
  // nodemon reads its ignore list (src/client, public, test) from package.json
  run([require.resolve("nodemon/bin/nodemon.js"), "src/index.ts"]),
];

let stopping = false;
const stop = (code) => {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exitCode = code ?? 0;
};
for (const child of children) child.on("exit", (code) => stop(code));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(0));
