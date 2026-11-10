import {
  constants,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { sha256OfFile } from "./cliArtifactDigest";
import { SelfUpdateError } from "./installerPrefix";

/** Recheck the exact cache generation verified by the npm launcher's manifest. */
export async function verifiedLauncherCache(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly releaseRoot?: string;
  readonly version: string;
  readonly target: string;
}): Promise<{ readonly root: string; readonly entrySha256: string } | null> {
  const root = input.env.PORACODE_LAUNCHER_RUNTIME_ROOT?.trim();
  const sha = input.env.PORACODE_LAUNCHER_RUNTIME_SHA256?.trim();
  const target = input.env.PORACODE_LAUNCHER_RUNTIME_TARGET?.trim();
  if (!root && !sha && !target) return null;
  if (
    !root ||
    !sha ||
    !target ||
    !/^[a-f0-9]{64}$/u.test(sha) ||
    !input.releaseRoot ||
    realpathSync(root) !== realpathSync(input.releaseRoot) ||
    target !== input.target
  ) {
    throw new SelfUpdateError(
      "The npm launcher's verified runtime identity does not match this release.",
    );
  }
  const path = join(root, ".poracode-runtime.json");
  let marker: {
    formatVersion?: unknown;
    version?: unknown;
    target?: unknown;
    tarballSha256?: unknown;
    entrySha256?: unknown;
  };
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > 16_384) throw new Error("invalid marker");
    marker = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new SelfUpdateError(`The npm runtime cache record cannot be read: ${String(error)}.`);
  }
  if (
    marker.formatVersion !== 1 ||
    marker.version !== input.version ||
    marker.target !== target ||
    marker.tarballSha256 !== sha ||
    typeof marker.entrySha256 !== "string" ||
    marker.entrySha256 !== (await sha256OfFile(join(root, "lib", "server.cjs")))
  ) {
    throw new SelfUpdateError(
      "The npm runtime cache no longer matches its verified release; it was not installed as a service.",
    );
  }
  return { root, entrySha256: marker.entrySha256 };
}

/** Copy-on-write where supported; the service must not share mutable inodes with the cache. */
export function copyVerifiedRuntime(source: string, destination: string): void {
  for (const name of readdirSync(source)) {
    const from = join(source, name);
    const to = join(destination, name);
    const stat = lstatSync(from);
    if (stat.isDirectory()) {
      mkdirSync(to, { mode: stat.mode & 0o777 });
      copyVerifiedRuntime(from, to);
    } else if (stat.isFile()) {
      copyFileSync(from, to, constants.COPYFILE_FICLONE);
    } else {
      throw new SelfUpdateError(
        `The verified runtime cache contains an unsupported entry: ${from}.`,
      );
    }
  }
}
