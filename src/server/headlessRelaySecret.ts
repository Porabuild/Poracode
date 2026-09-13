import { randomBytes } from "node:crypto";
import { join } from "node:path";
import type { OwnedHostRuntime } from "@/backend/ownership/HostOwnerController";
import { readPrivateHostFile } from "@/backend/ownership/privateHostFile";
import { writeFileAtomic } from "@/shared/atomicFile";

const RELAY_SECRET_FILE = "relay-secret";
const MAX_RELAY_SECRET_BYTES = 4_096;

/** Resolve relay custody inside the owner; malformed credentials never rotate. */
export function readOwnedHeadlessRelaySecret(
  runtime: Pick<OwnedHostRuntime, "lease" | "credentialCapabilities">,
  environmentSecret?: string,
): string {
  runtime.lease.assertActive();
  const injected = environmentSecret?.trim();
  if (injected !== undefined && (!injected || Buffer.byteLength(injected) > MAX_RELAY_SECRET_BYTES))
    throw new Error("Invalid explicit relay credential.");
  let stored: string | undefined;
  try {
    stored = new TextDecoder("utf-8", { fatal: true })
      .decode(readPrivateHostFile(runtime.lease.paths, RELAY_SECRET_FILE, MAX_RELAY_SECRET_BYTES))
      .trim();
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT")
      throw new Error("Invalid stored relay credential; the existing file was preserved.", {
        cause: error,
      });
  }
  if (stored !== undefined && !stored)
    throw new Error("Invalid stored relay credential; the existing file was preserved.");
  if (injected !== undefined && stored !== undefined && injected !== stored)
    throw new Error("Relay credential change requires explicit activation.");
  if (stored !== undefined) return stored;
  if (injected !== undefined) return injected;
  runtime.credentialCapabilities.assertCanPersistSecrets();
  const secret = randomBytes(32).toString("base64url");
  writeFileAtomic(join(runtime.lease.paths.dataRoot, RELAY_SECRET_FILE), secret, {
    encoding: "utf8",
    mode: 0o600,
  });
  return secret;
}
