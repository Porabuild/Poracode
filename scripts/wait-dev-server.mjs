// Env-aware replacement for `wait-on tcp:3100` in the dev pipeline: waits for
// the Vite dev server on the port resolved from PORACODE_DEV_SERVER_PORT.
import net from "node:net";
import { resolveDevServerPort } from "./dev-server-port.mjs";

const port = resolveDevServerPort();

function tryConnect() {
  return new Promise((done) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      done(true);
    });
    socket.once("error", () => {
      socket.destroy();
      done(false);
    });
  });
}

while (!(await tryConnect())) {
  await new Promise((done) => setTimeout(done, 250));
}
