import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { assertSecretFree } from "./secrets.ts";
import type { ReadinessDescriptor } from "./types.ts";

export function writeReadinessDescriptor(path: string, descriptor: ReadinessDescriptor): void {
  assertSecretFree(descriptor, "readiness descriptor");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(descriptor, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(path, 0o600);
}
