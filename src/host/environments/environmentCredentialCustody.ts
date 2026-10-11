import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { EnvironmentRuntimeError } from "./environmentRuntimeErrors";

/**
 * Host-local credential custody (ADR §3).
 *
 * v1 delegates SSH authentication to the host user's OpenSSH agent/config. A
 * client may only name an opaque reference the host resolves locally:
 * - absent or `system` → the host's OpenSSH agent/config decides (no `-i`);
 * - `file:<slot>` → `<home>/.ssh/<slot>`, validated as an existing, regular,
 *   readable file.
 *
 * No key bytes, passwords, or device-local `identityFile` paths are accepted,
 * stored, or uploaded: an unresolvable reference fails closed with a typed
 * `credential-missing` and never echoes the reference or path. A composition
 * may supply its own resolver (for example an OS keychain reference scheme)
 * through the same interface.
 */

export type EnvironmentCredentialResolution =
  | { readonly kind: "system" }
  | { readonly kind: "identity-file"; readonly identityFile: string };

export interface EnvironmentCredentialResolver {
  resolve(reference: string | undefined): Promise<EnvironmentCredentialResolution>;
}

const SLOT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export interface OpenSshCredentialResolverOptions {
  /** Overridable for tests; defaults to the host user's home directory. */
  readonly homeDir?: string;
}

export function createOpenSshCredentialResolver(
  options: OpenSshCredentialResolverOptions = {},
): EnvironmentCredentialResolver {
  const homeDir = options.homeDir ?? homedir();
  return {
    async resolve(reference) {
      if (reference === undefined || reference === "system") return { kind: "system" };
      const separator = reference.indexOf(":");
      const scheme = separator < 0 ? reference : reference.slice(0, separator);
      const slot = separator < 0 ? "" : reference.slice(separator + 1);
      if (scheme !== "file" || !SLOT_PATTERN.test(slot) || slot.includes("..")) {
        throw new EnvironmentRuntimeError("environment/credential-missing");
      }
      const identityFile = join(homeDir, ".ssh", slot);
      try {
        const info = await stat(identityFile);
        if (!info.isFile()) throw new Error("not a regular file");
        await access(identityFile, constants.R_OK);
      } catch {
        throw new EnvironmentRuntimeError("environment/credential-missing");
      }
      return { kind: "identity-file", identityFile };
    },
  };
}
