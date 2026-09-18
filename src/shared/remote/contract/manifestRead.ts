import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function protocolManifestPath(): string {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../protocol/remote/v3/manifest.json",
  );
}

export function readProtocolManifest(): unknown {
  return JSON.parse(readFileSync(protocolManifestPath(), "utf8")) as unknown;
}
