import "./env";
import { AddressInfo } from "net";
import app from "../src/server";

export interface TestServer {
  url: string;
  close: () => Promise<void>;
}

// Starts the app on a free port
export function startServer(): Promise<TestServer> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://localhost:${port}`,
        close: () =>
          new Promise((done) => {
            // fetch keeps connections open, which would hold close() up
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}
