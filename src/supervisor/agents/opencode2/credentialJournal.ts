import { readFile } from "node:fs/promises";
import { isAbsolute, join, posix } from "node:path";
import { lock } from "proper-lockfile";
import type { ProjectLocation } from "@/shared/contracts";
import { writeFileAtomicAsync } from "@/shared/atomicFileAsync";
import { wslLinuxToHostFsPath } from "@/shared/wsl";
import { msg } from "@/shared/messages";
import { readAgentCommandOutput } from "../base";
import { readWslTextFile, writeWslTextFile } from "../plugin/wslStaging";
import { resolveOpenCode2Binary } from "./binary";

/** Versioned migration/revocation custody; never contains credential values. */
export interface OpenCode2CredentialJournal {
  version: 1;
  credentials: Record<string, "pending-import" | "imported" | "pending-revoke" | "revoked">;
}

export function parseOpenCode2CredentialJournal(text: string | null): OpenCode2CredentialJournal {
  if (text === null)
    return {
      version: 1,
      credentials: Object.create(null) as OpenCode2CredentialJournal["credentials"],
    };
  const value: unknown = JSON.parse(text);
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("credentials" in value) ||
    !value.credentials ||
    typeof value.credentials !== "object" ||
    Array.isArray(value.credentials) ||
    Object.values(value.credentials).some(
      (status) =>
        status !== "pending-import" &&
        status !== "imported" &&
        status !== "pending-revoke" &&
        status !== "revoked",
    )
  )
    throw new Error(msg("provider.signInDataUnavailable"));
  return {
    version: 1,
    credentials: Object.assign(
      Object.create(null) as OpenCode2CredentialJournal["credentials"],
      value.credentials,
    ),
  };
}

export async function openOpenCode2CredentialJournal(location: ProjectLocation) {
  const binary = await resolveOpenCode2Binary(location);
  if (!binary) throw new Error(msg("provider.unavailable"));
  const result = await readAgentCommandOutput(location, binary, ["debug", "paths", "data"], {
    timeoutMs: 10_000,
  });
  const directory = result.stdout.trim();
  const paths = location.kind === "wsl" ? posix : { isAbsolute, join };
  if (!result.ok || !paths.isAbsolute(directory))
    throw new Error(msg("provider.signInDataUnavailable"));
  const path = paths.join(directory, "poracode-credential-compatibility-v1.json");
  const hostPath = location.kind === "wsl" ? wslLinuxToHostFsPath(location.distro, path) : path;
  return {
    // All Poracode profiles share upstream credentials. Use a filesystem lock
    // alongside the process queue so another profile cannot lose a revocation.
    lock: () =>
      lock(hostPath, {
        realpath: false,
        stale: 120_000,
        update: 10_000,
        retries: { retries: 10, factor: 1.5, minTimeout: 100, maxTimeout: 1000 },
      }).catch((error: unknown) => {
        if (error && typeof error === "object" && "code" in error && error.code === "ELOCKED")
          throw new Error(msg("provider.credentialsBusy"), { cause: error });
        throw error;
      }),
    read: async () => {
      const text =
        location.kind === "wsl"
          ? await readWslTextFile(location.distro, path)
          : await readFile(path, "utf8").catch((error: unknown) => {
              if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
                return null;
              throw error;
            });
      return parseOpenCode2CredentialJournal(text);
    },
    write: async (journal: OpenCode2CredentialJournal) => {
      const text = `${JSON.stringify(journal)}\n`;
      if (location.kind === "wsl")
        await writeWslTextFile(location.distro, path, text, { mode: 0o600 });
      else await writeFileAtomicAsync(path, text, { mode: 0o600 });
    },
  };
}
