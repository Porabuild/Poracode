import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEVICE_HUB_ARTIFACT_VERSION,
  DEVICE_HUB_BOOTSTRAP,
  DEVICE_HUB_CLIENT_ADAPTER_VERSION,
  DEVICE_HUB_CLIENT_INTEGRITY,
  DEVICE_HUB_CLIENT_PATCH_SHA256,
  DEVICE_HUB_CLIENT_VERSION,
  DEVICE_HUB_ENTRY,
  DEVICE_HUB_LOCKFILE,
  DEVICE_HUB_NATIVE_MODULE_PATH,
  DEVICE_HUB_NATIVE_PATCH_RECEIPT,
  DEVICE_HUB_NATIVE_RECEIPT_PATH,
  DEVICE_HUB_PACKAGE_INTEGRITY,
  DEVICE_HUB_QUALIFIED_TARGETS,
  DEVICE_HUB_SCRCPY_PATH,
  DEVICE_HUB_SCRCPY_VERSION,
  DEVICE_HUB_SCRCPY_SHA256,
  DEVICE_HUB_SOURCE_COMMIT,
  DEVICE_HUB_VERSION,
  type DeviceHubArtifactManifest,
} from "@/shared/deviceHubArtifact";
import { readDeviceHubArtifact } from "./deviceHubArtifact";

// Keep the module fixture small; the staging regression verifies the real
// published/patched module pins and exercises its actual startup boundary.
vi.mock("@/shared/deviceHubArtifact", async (original) => ({
  ...(await original<typeof import("@/shared/deviceHubArtifact")>()),
  DEVICE_HUB_NATIVE_MODULE_SHA256: createHash("sha256").update("fixture").digest("hex"),
}));

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "poracode-hub-artifact-test-"));
  roots.push(root);
  const target = {
    platform: "win32" as NodeJS.Platform,
    arch: "x64" as NodeJS.Architecture,
    runtimeAbi: "fixture",
  };
  const files = [
    DEVICE_HUB_ENTRY,
    DEVICE_HUB_BOOTSTRAP,
    DEVICE_HUB_LOCKFILE,
    DEVICE_HUB_SCRCPY_PATH,
    DEVICE_HUB_NATIVE_MODULE_PATH,
    DEVICE_HUB_NATIVE_RECEIPT_PATH,
  ];
  for (const file of files) {
    const path = join(root, "win32-x64", file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      file === DEVICE_HUB_NATIVE_RECEIPT_PATH
        ? `${JSON.stringify(DEVICE_HUB_NATIVE_PATCH_RECEIPT)}\n`
        : "fixture",
    );
  }
  const manifest: DeviceHubArtifactManifest = {
    version: DEVICE_HUB_ARTIFACT_VERSION,
    adapterVersion: DEVICE_HUB_CLIENT_ADAPTER_VERSION,
    hubVersion: DEVICE_HUB_VERSION,
    clientVersion: DEVICE_HUB_CLIENT_VERSION,
    sourceCommit: DEVICE_HUB_SOURCE_COMMIT,
    packageIntegrity: DEVICE_HUB_PACKAGE_INTEGRITY,
    clientIntegrity: DEVICE_HUB_CLIENT_INTEGRITY,
    clientPatchSha256: DEVICE_HUB_CLIENT_PATCH_SHA256,
    scrcpyVersion: DEVICE_HUB_SCRCPY_VERSION,
    scrcpySha256: DEVICE_HUB_SCRCPY_SHA256,
    platform: "win32",
    arch: "x64",
    runtimeAbi: "fixture",
    qualifiedPlatforms: [],
    entry: DEVICE_HUB_ENTRY,
    files: files.map((path) => ({
      path,
      sha256: createHash("sha256")
        .update(
          path === DEVICE_HUB_NATIVE_RECEIPT_PATH
            ? `${JSON.stringify(DEVICE_HUB_NATIVE_PATCH_RECEIPT)}\n`
            : "fixture",
        )
        .digest("hex"),
    })),
  };
  const save = () => writeFile(join(root, "win32-x64", "manifest.json"), JSON.stringify(manifest));
  await save();
  return { root, target, manifest, save, signal: new AbortController().signal };
}

describe("versioned device Hub artifact admission", () => {
  it("refuses pre-patch v1, tampered and future native receipts without rewriting", async () => {
    const f = await fixture();
    for (const value of [
      null,
      { ...DEVICE_HUB_NATIVE_PATCH_RECEIPT, version: 2 },
      { ...DEVICE_HUB_NATIVE_PATCH_RECEIPT, patchSha256: "a".repeat(64) },
    ]) {
      const files = f.manifest.files.filter((file) => file.path !== DEVICE_HUB_NATIVE_RECEIPT_PATH);
      if (value) {
        const bytes = `${JSON.stringify(value)}\n`;
        await writeFile(join(f.root, "win32-x64", DEVICE_HUB_NATIVE_RECEIPT_PATH), bytes);
        files.push({
          path: DEVICE_HUB_NATIVE_RECEIPT_PATH,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      }
      const bytes = JSON.stringify({ ...f.manifest, files });
      await writeFile(join(f.root, "win32-x64", "manifest.json"), bytes);
      expect(await readDeviceHubArtifact(f.root, f.signal, f.target)).toBeNull();
      expect(await readFile(join(f.root, "win32-x64", "manifest.json"), "utf8")).toBe(bytes);
    }
  });

  it("qualifies only the captured Windows x64 Electron ABI and no Mac or iOS target", () => {
    expect(DEVICE_HUB_QUALIFIED_TARGETS).toEqual([
      { platform: "win32", arch: "x64", runtimeAbi: "149", platforms: ["android"] },
    ]);
    for (const target of [
      { platform: "win32", arch: "arm64", runtimeAbi: "149" },
      { platform: "win32", arch: "x64", runtimeAbi: "148" },
      { platform: "win32", arch: "x64", runtimeAbi: "150" },
      { platform: "darwin", arch: "arm64", runtimeAbi: "149" },
      { platform: "darwin", arch: "x64", runtimeAbi: "149" },
      { platform: "linux", arch: "x64", runtimeAbi: "149" },
    ]) {
      expect(
        DEVICE_HUB_QUALIFIED_TARGETS.filter(
          (entry) =>
            entry.platform === target.platform &&
            entry.arch === target.arch &&
            entry.runtimeAbi === target.runtimeAbi,
        ),
      ).toEqual([]);
    }
  });

  it("admits only the pinned complete runtime target without inventing qualification", async () => {
    const f = await fixture();
    const artifact = await readDeviceHubArtifact(f.root, f.signal, f.target);
    expect(artifact?.entry).toBe(join(f.root, "win32-x64", DEVICE_HUB_ENTRY));
    expect(artifact?.manifest.qualifiedPlatforms).toEqual([]);
    expect(
      await readDeviceHubArtifact(f.root, f.signal, { ...f.target, runtimeAbi: "another" }),
    ).toBeNull();
  });

  it("refuses pre-adapter and unknown future manifests without rewriting them", async () => {
    const f = await fixture();
    for (const version of [0, 2]) {
      const path = join(f.root, "win32-x64", "manifest.json");
      await writeFile(path, JSON.stringify({ ...f.manifest, version }));
      expect(await readDeviceHubArtifact(f.root, f.signal, f.target)).toBeNull();
    }
  });

  it("rejects changed package/client adaptation pins without accepting an old helper layout", async () => {
    const f = await fixture();
    const path = join(f.root, "win32-x64", "manifest.json");
    for (const delta of [
      { adapterVersion: 0 },
      { adapterVersion: 2 },
      { hubVersion: "0.15.2" },
      { clientVersion: "1.4.0" },
      { clientPatchSha256: "a".repeat(64) },
      { scrcpySha256: "b".repeat(64) },
    ]) {
      const bytes = JSON.stringify({ ...f.manifest, ...delta });
      await writeFile(path, bytes);
      expect(await readDeviceHubArtifact(f.root, f.signal, f.target)).toBeNull();
      expect(await readFile(path, "utf8")).toBe(bytes);
    }
  });

  it("requires the frozen dependency lock in the admitted file closure", async () => {
    const f = await fixture();
    f.manifest.files = f.manifest.files.filter((file) => file.path !== DEVICE_HUB_LOCKFILE);
    await f.save();
    expect(await readDeviceHubArtifact(f.root, f.signal, f.target)).toBeNull();
  });

  it("refuses modified files, omitted scrcpy and path traversal before any launch", async () => {
    const f = await fixture();
    await writeFile(join(f.root, "win32-x64", DEVICE_HUB_ENTRY), "changed");
    expect(await readDeviceHubArtifact(f.root, f.signal, f.target)).toBeNull();
    await writeFile(join(f.root, "win32-x64", DEVICE_HUB_ENTRY), "fixture");
    f.manifest.qualifiedPlatforms = ["android"];
    f.manifest.files = f.manifest.files.filter((file) => file.path !== DEVICE_HUB_SCRCPY_PATH);
    await f.save();
    expect(await readDeviceHubArtifact(f.root, f.signal, f.target)).toBeNull();
    f.manifest.files.push({ path: "../outside", sha256: "a".repeat(64) });
    await f.save();
    expect(await readDeviceHubArtifact(f.root, f.signal, f.target)).toBeNull();
  });

  it("refuses an Android artifact whose locally hashed scrcpy differs from the published pin", async () => {
    const f = await fixture();
    f.manifest.qualifiedPlatforms = ["android"];
    await f.save();
    expect(await readDeviceHubArtifact(f.root, f.signal, f.target)).toBeNull();
  });

  it("does not accept iOS qualification on a Windows artifact or duplicate file records", async () => {
    const f = await fixture();
    f.manifest.qualifiedPlatforms = ["ios"];
    await f.save();
    expect(await readDeviceHubArtifact(f.root, f.signal, f.target)).toBeNull();
    f.manifest.qualifiedPlatforms = ["android"];
    f.manifest.files.push(f.manifest.files[0]!);
    await f.save();
    expect(await readDeviceHubArtifact(f.root, f.signal, f.target)).toBeNull();
  });

  it("honors cancellation rather than treating it as an unavailable package", async () => {
    const f = await fixture();
    const abort = new AbortController();
    abort.abort();
    await expect(readDeviceHubArtifact(f.root, abort.signal, f.target)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("refuses unlisted files that could change Node module resolution", async () => {
    const f = await fixture();
    await writeFile(join(f.root, "win32-x64", "extra.cjs"), "unlisted");
    expect(await readDeviceHubArtifact(f.root, f.signal, f.target)).toBeNull();
  });
});
