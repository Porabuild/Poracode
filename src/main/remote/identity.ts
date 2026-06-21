import { existsSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { writeFileAtomic } from "@/shared/atomicFile";

const remoteIdentitySchema = z.object({
  desktopId: z.string().min(1),
  label: z.string().min(1),
});

export interface RemoteAccessIdentity {
  readonly desktopId: string;
  readonly label: string;
}

function defaultLabel(): string {
  const host = hostname().trim();
  return host ? `Lightcode on ${host}` : "Lightcode Desktop";
}

export function readOrCreateRemoteAccessIdentity(baseDir: string): RemoteAccessIdentity {
  const path = join(baseDir, "remote-access-identity.json");
  if (existsSync(path)) {
    try {
      const parsed = remoteIdentitySchema.parse(JSON.parse(readFileSync(path, "utf8")));
      return parsed;
    } catch {
      // Fall through and rewrite corrupt identity data.
    }
  }

  const identity: RemoteAccessIdentity = {
    desktopId: randomUUID(),
    label: defaultLabel(),
  };
  writeFileAtomic(path, `${JSON.stringify(identity, null, 2)}\n`, { encoding: "utf8" });
  return identity;
}
