import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
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
import * as hubStaging from "../../../scripts/prepare-device-hub.mjs";

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

async function packagingFixture(abi = "149") {
  const root = await mkdtemp(join(tmpdir(), "poracode-hub-package-test-"));
  roots.push(root);
  await mkdir(join(root, "node_modules", "electron"), { recursive: true });
  await writeFile(join(root, "package.json"), "{}");
  await writeFile(
    join(root, "node_modules", "electron", "package.json"),
    JSON.stringify({ name: "electron", main: "index.cjs" }),
  );
  await writeFile(
    join(root, "node_modules", "electron", "index.cjs"),
    `module.exports = ${JSON.stringify(process.execPath)};`,
  );
  let installed = "";
  const run = vi.fn<(command: string, args: string[], options: { cwd: string }) => string>(
    (_command, args, options) => {
      if (args[0] === "-p") return JSON.stringify({ platform: "win32", arch: "x64", abi });
      installed = options.cwd;
      return "";
    },
  );
  const fetch = vi.fn<() => Promise<Response>>(async () => new Response("fixture"));
  const stage = vi.fn<
    (options: {
      source: string;
      output: string;
      scrcpyServer: string;
      runtimeAbi: string;
      scratch: string;
    }) => Promise<{ qualifiedPlatforms: string[] }>
  >(async (options) => {
    expect(options.scratch).toBe(join(options.source, ".tmp"));
    expect(
      JSON.parse(await readFile(join(options.source, "package-lock.json"), "utf8")),
    ).toMatchObject({
      lockfileVersion: 3,
      packages: { "node_modules/expo-device-hub": { version: DEVICE_HUB_VERSION } },
    });
    expect(await readFile(options.scrcpyServer, "utf8")).toBe("fixture");
    await mkdir(join(options.output, "win32-x64"), { recursive: true });
    await writeFile(join(options.output, "win32-x64", "manifest.json"), "prepared");
    return { qualifiedPlatforms: ["android"] };
  });
  return {
    root,
    run,
    fetch,
    stage,
    installed: () => installed,
    deps: { platform: "win32", arch: "x64", run, fetch, stage },
  };
}

describe("clean desktop device Hub packaging", () => {
  it("prepares a qualified helper from the committed lock without local generated resources", async () => {
    const f = await packagingFixture();
    await mkdir(join(f.root, "resources", "device-hub"), { recursive: true });
    await writeFile(join(f.root, "resources", "device-hub", "stale-cache"), "old");
    await expect(
      hubStaging.preparePackagedDeviceHub(
        f.root,
        { platform: "win", arches: ["x64", "arm64"] },
        f.deps,
      ),
    ).resolves.toMatchObject({ qualifiedPlatforms: ["android"] });
    expect(f.run.mock.calls[0]?.[2]).toMatchObject({
      env: { ELECTRON_RUN_AS_NODE: "1" },
      timeout: 10000,
    });
    expect(f.run.mock.calls[1]?.[1]).toEqual(
      expect.arrayContaining(["ci", "--ignore-scripts", "--omit=dev"]),
    );
    expect(f.stage).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeAbi: "149",
        output: join(f.root, "resources", "device-hub"),
      }),
    );
    expect(
      await readFile(join(f.root, "resources", "device-hub", "win32-x64", "manifest.json"), "utf8"),
    ).toBe("prepared");
    await expect(
      readFile(join(f.root, "resources", "device-hub", "stale-cache")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(f.installed(), "package.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.each([
    { platform: "mac", arches: ["x64"] },
    { platform: "linux", arches: ["x64"] },
    { platform: "win", arches: ["arm64"] },
  ])("does not install or advertise an unqualified target $platform/$arches", async (target) => {
    const f = await packagingFixture();
    await expect(
      hubStaging.preparePackagedDeviceHub(f.root, target, f.deps),
    ).resolves.toMatchObject({ qualifiedPlatforms: [] });
    expect(f.run).not.toHaveBeenCalled();
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.stage).not.toHaveBeenCalled();
  });

  it("checks the installed Electron ABI before installing or qualifying a helper", async () => {
    const f = await packagingFixture("150");
    await expect(
      hubStaging.preparePackagedDeviceHub(f.root, { platform: "win", arches: ["x64"] }, f.deps),
    ).resolves.toMatchObject({ qualifiedPlatforms: [] });
    expect(f.run).toHaveBeenCalledOnce();
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.stage).not.toHaveBeenCalled();
  });

  it("lets the existing stager reject a wrong pinned server hash before promotion", async () => {
    const f = await packagingFixture();
    f.run.mockImplementation((_command, args, options) => {
      if (args[0] === "-p") return JSON.stringify({ platform: "win32", arch: "x64", abi: "149" });
      const hub = join(options.cwd, "node_modules", "expo-device-hub");
      mkdirSync(hub, { recursive: true });
      writeFileSync(
        join(hub, "package.json"),
        JSON.stringify({ name: "expo-device-hub", version: DEVICE_HUB_VERSION }),
      );
      return "";
    });
    await expect(
      hubStaging.preparePackagedDeviceHub(
        f.root,
        { platform: "win", arches: ["x64"] },
        { platform: "win32", arch: "x64", run: f.run, fetch: f.fetch },
      ),
    ).rejects.toThrow("differs from its published SHA-256");
    const install = f.run.mock.calls[1]?.[2].cwd;
    expect(install).toBeTruthy();
    await expect(readFile(join(install!, "package.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.each(["http", "overflow", "cancel", "stage"] as const)(
    "refuses %s failure and joins the temporary installation cleanup",
    async (failure) => {
      const f = await packagingFixture();
      let cancelled = false;
      if (failure === "http")
        f.fetch.mockImplementation(
          async () =>
            new Response(
              new ReadableStream({
                cancel() {
                  cancelled = true;
                },
              }),
              { status: 503 },
            ),
        );
      if (failure === "cancel")
        f.fetch.mockRejectedValue(new DOMException("Cancelled", "AbortError"));
      if (failure === "overflow")
        f.fetch.mockImplementation(
          async () =>
            new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(new Uint8Array(1024 * 1024 + 1));
                },
                cancel() {
                  cancelled = true;
                },
              }),
            ),
        );
      if (failure === "stage") f.stage.mockRejectedValue(new Error("fixture staging refused"));
      await expect(
        hubStaging.preparePackagedDeviceHub(f.root, { platform: "win", arches: ["x64"] }, f.deps),
      ).rejects.toThrow(
        {
          http: "Unable to fetch the pinned scrcpy server.",
          overflow: "The pinned scrcpy server exceeds its size limit.",
          cancel: "Cancelled",
          stage: "fixture staging refused",
        }[failure],
      );
      expect(cancelled).toBe(failure === "overflow" || failure === "http");
      expect(f.stage).toHaveBeenCalledTimes(failure === "stage" ? 1 : 0);
      await expect(readFile(join(f.installed(), "package.json"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    },
  );
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

  it("refuses old untrimmed and unknown future artifacts without rewriting them", async () => {
    const f = await fixture();
    for (const version of [0, 1, DEVICE_HUB_ARTIFACT_VERSION + 1]) {
      const path = join(f.root, "win32-x64", "manifest.json");
      const bytes = JSON.stringify({ ...f.manifest, version });
      await writeFile(path, bytes);
      expect(await readDeviceHubArtifact(f.root, f.signal, f.target)).toBeNull();
      expect(await readFile(path, "utf8")).toBe(bytes);
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
