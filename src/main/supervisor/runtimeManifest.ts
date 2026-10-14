import { createHash } from "node:crypto";
import { join } from "node:path";
import { RUNTIME_MANIFEST_MAX_BYTES } from "@/shared/runtimeCodeManifest";
import { readBoundedRuntimeFile } from "@/shared/readBoundedRuntimeFile";
import {
  sshRuntimeBuildManifestSchema,
  sshRuntimeManifestFileName,
  type RuntimeResourceIdentity,
  type SshRuntimeBuildManifest,
  type SshRuntimeEntryName,
} from "@/shared/sshRuntimeManifest";

export interface RuntimeManifestExpectation {
  readonly root: string;
  readonly entry: SshRuntimeEntryName;
  readonly sourceHash: string;
  readonly settingsServiceVersion: 0 | 1;
  readonly signal?: AbortSignal;
  /** The composition must supply the actual deployed resource roots. */
  readonly verifyResources?: (resources: readonly RuntimeResourceIdentity[]) => Promise<void>;
}

/** Metadata only is retained in the parent; the child captures and rechecks
 * source bytes independently before loading any first-party module. */
export async function readVerifiedRuntimeManifest(
  expected: RuntimeManifestExpectation,
): Promise<SshRuntimeBuildManifest> {
  const bytes = await readBoundedRuntimeFile(
    join(expected.root, sshRuntimeManifestFileName(expected.entry)),
    RUNTIME_MANIFEST_MAX_BYTES,
    expected.signal,
  );
  const manifest = sshRuntimeBuildManifestSchema.parse(
    JSON.parse(bytes.toString("utf8")) as unknown,
  );
  if (
    manifest.entry !== expected.entry ||
    manifest.sourceHash !== expected.sourceHash ||
    manifest.settingsServiceVersion !== expected.settingsServiceVersion
  )
    throw new Error("Runtime build declaration does not match this host.");
  for (const file of manifest.files) {
    const source = await readBoundedRuntimeFile(
      join(expected.root, file.path),
      file.bytes,
      expected.signal,
    );
    if (
      source.byteLength !== file.bytes ||
      createHash("sha256").update(source).digest("hex") !== file.sha256
    )
      throw new Error(`Runtime code digest differs: ${file.path}`);
  }
  if (manifest.resources.length > 0) {
    if (!expected.verifyResources) throw new Error("Runtime resource verification is required.");
    await expected.verifyResources(manifest.resources);
  }
  expected.signal?.throwIfAborted();
  return manifest;
}
