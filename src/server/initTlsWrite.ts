import { closeSync, mkdirSync, openSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { restrictToOwner } from "@/shared/restrictToOwner";

export interface InitTlsWriteDeps {
  readonly mkdir: (path: string) => void;
  readonly restrict: (path: string) => void;
  /** Exclusively create an empty file with owner-only mode bits. */
  readonly createPrivateFile: (path: string) => void;
  readonly writeFile: (path: string, text: string, mode: number) => void;
  readonly remove: (path: string) => void;
}

const defaultDeps: InitTlsWriteDeps = {
  mkdir: (path) => void mkdirSync(path, { recursive: true }),
  restrict: (path) => restrictToOwner(path),
  createPrivateFile: (path) => closeSync(openSync(path, "wx", 0o600)),
  writeFile: (path, text, mode) => writeFileSync(path, text, { encoding: "utf8", mode }),
  remove: (path) => rmSync(path, { force: true }),
};

export interface InitTlsWriteInput {
  readonly certPath: string;
  readonly keyPath: string;
  readonly cert: string;
  readonly key: string;
  /** True when the key lives in the profile's own tls directory (safe to restrict). */
  readonly restrictKeyDirectory: boolean;
}

/**
 * Write TLS material so the private key is never on disk under an inherited
 * ACL: the (owned) key directory is restricted first, then the key file is
 * created empty, restricted, and only then given its content. On failure the
 * files this call created are removed.
 */
export function writeInitTlsMaterial(
  input: InitTlsWriteInput,
  deps: InitTlsWriteDeps = defaultDeps,
): void {
  const keyDirectory = dirname(input.keyPath);
  deps.mkdir(dirname(input.certPath));
  if (keyDirectory !== dirname(input.certPath)) deps.mkdir(keyDirectory);
  if (input.restrictKeyDirectory) deps.restrict(keyDirectory);
  const created: string[] = [];
  try {
    deps.createPrivateFile(input.keyPath);
    created.push(input.keyPath);
    deps.restrict(input.keyPath);
    deps.writeFile(input.keyPath, input.key, 0o600);
    created.push(input.certPath);
    deps.writeFile(input.certPath, input.cert, 0o644);
  } catch (error) {
    for (const path of created) {
      try {
        deps.remove(path);
      } catch {
        // Best effort; the original failure is what matters.
      }
    }
    throw error;
  }
}
