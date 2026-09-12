import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveDevServerPort } from "./dev-server-port.mjs";

const webPort = resolveDevServerPort();

process.env.PORACODE_IS_DEV = "1";
process.env.PORACODE_BASE_DIR ||= resolve(process.cwd(), ".tmp", "poracode-web-dev");
process.env.PORACODE_REMOTE_ACCESS_PAIRING_APP_URL ||= `http://127.0.0.1:${webPort}/`;

const serverModule = await import(
  pathToFileURL(resolve(process.cwd(), "dist", "main", "server.cjs")).href
);
serverModule.runCli();
