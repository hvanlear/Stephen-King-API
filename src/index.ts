import app from "./server";
import config from "./config";
import {
  startPersistence,
  flushStats,
  stopPersistence,
} from "./analytics/store";

const intervalId = startPersistence();

// creates and starts a server for our API on a defined port
const server = app.listen(config.port, () => {
  console.log(` listening at http://localhost:${config.port}`);
});

let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  stopPersistence(intervalId);
  await flushStats();

  // Keep-alive connections can hold close() open; don't outlast Render's grace period
  setTimeout(() => process.exit(0), 10 * 1000).unref();
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
