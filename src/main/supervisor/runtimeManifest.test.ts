import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  SSH_RUNTIME_MANIFEST_VERSION,
  sshRuntimeManifestFileName,
} from "@/shared/sshRuntimeManifest";
import { RUNTIME_CODE_MAX_TOTAL_BYTES } from "@/shared/runtimeCodeManifest";
import { readVerifiedRuntimeManifest } from "./runtimeManifest";

const sourceHash = "a".repeat(64);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "poracode-runtime-manifest-"));
  roots.push(root);
  const code = "module.exports = 'synthetic runtime';\n";
  const manifest = {
    version: SSH_RUNTIME_MANIFEST_VERSION,
    entry: "supervisor",
    sourceHash,
    captureProtocolVersion: 1,
    // The fixture declares the future service. Current production does not.
    settingsServiceVersion: 1,
    files: [
      {
        path: "supervisor.cjs",
        format: "commonjs",
        bytes: Buffer.byteLength(code),
        sha256: createHash("sha256").update(code).digest("hex"),
      },
    ],
    dependencies: [],
    resources: [],
  };
  const path = join(root, sshRuntimeManifestFileName("supervisor"));
  await writeFile(join(root, "supervisor.cjs"), code);
  await writeFile(path, JSON.stringify(manifest));
  return { root, manifest, path, code };
}

it("checks the declared source, entry and complete code before returning metadata", async () => {
  const { root, manifest } = await fixture();
  const verified = await readVerifiedRuntimeManifest({
    root,
    entry: "supervisor",
    sourceHash,
    settingsServiceVersion: 1,
  });
  expect(verified).toEqual(manifest);
});

it.each([
  {
    label: "released v2",
    mutate: (manifest: Record<string, unknown>) => {
      manifest.version = 2;
    },
  },
  {
    label: "mixed source",
    mutate: (manifest: Record<string, unknown>) => {
      manifest.sourceHash = "b".repeat(64);
    },
  },
  {
    label: "old service",
    mutate: (manifest: Record<string, unknown>) => {
      manifest.settingsServiceVersion = 0;
    },
  },
  {
    label: "missing capture",
    mutate: (manifest: Record<string, unknown>) => {
      delete manifest.captureProtocolVersion;
    },
  },
  {
    label: "unknown property",
    mutate: (manifest: Record<string, unknown>) => {
      manifest.unrecognized = true;
    },
  },
])("refuses $label without treating it as a compatible predecessor", async ({ mutate }) => {
  const { root, path, manifest } = await fixture();
  mutate(manifest);
  await writeFile(path, JSON.stringify(manifest));
  await expect(
    readVerifiedRuntimeManifest({
      root,
      entry: "supervisor",
      sourceHash,
      settingsServiceVersion: 1,
    }),
  ).rejects.toThrow(/Invalid|Unrecognized|declaration/i);
});

it("refuses a changed chunk even when its path and byte length are unchanged", async () => {
  const { root, code } = await fixture();
  await writeFile(join(root, "supervisor.cjs"), code.replace("synthetic", "different"));
  await expect(
    readVerifiedRuntimeManifest({
      root,
      entry: "supervisor",
      sourceHash,
      settingsServiceVersion: 1,
    }),
  ).rejects.toThrow(/digest/i);
});

it("refuses missing, duplicate, traversing and oversized closures", async () => {
  const { root, path, manifest } = await fixture();
  const file = manifest.files[0]!;
  for (const files of [
    [],
    [file, file],
    [file, { ...file, path: "Supervisor.cjs" }],
    [{ ...file, path: "../supervisor.cjs" }],
    [file, { ...file, path: "chunks/NODE_MODULES/escape.js" }],
    [{ ...file, path: "supervisor.cjs:stream.js" }],
    [{ ...file, bytes: RUNTIME_CODE_MAX_TOTAL_BYTES + 1 }],
  ]) {
    await writeFile(path, JSON.stringify({ ...manifest, files }));
    await expect(
      readVerifiedRuntimeManifest({
        root,
        entry: "supervisor",
        sourceHash,
        settingsServiceVersion: 1,
      }),
    ).rejects.toThrow(/runtime|too small|too big|duplicate|canonical/i);
  }
  await writeFile(path, JSON.stringify(manifest));
  await rm(join(root, "supervisor.cjs"));
  await expect(
    readVerifiedRuntimeManifest({
      root,
      entry: "supervisor",
      sourceHash,
      settingsServiceVersion: 1,
    }),
  ).rejects.toThrow(/ENOENT/);
});

it("refuses canceled admission and leaves manifest/source bytes untouched", async () => {
  const { root, path } = await fixture();
  const before = await readFile(path);
  await expect(
    readVerifiedRuntimeManifest({
      root,
      entry: "supervisor",
      sourceHash,
      settingsServiceVersion: 1,
      signal: AbortSignal.abort(),
    }),
  ).rejects.toThrow(/aborted/i);
  expect(await readFile(path)).toEqual(before);
});
