import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HEX_ENGINE_ASSETS, HexEngineInstaller, type HexEngineAsset } from "./HexEngineInstaller";
import { HexVoiceService } from "./HexVoiceService";

function elfPayload(machine = 62): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]);
  bytes[18] = machine & 0xff;
  bytes[19] = machine >> 8;
  return bytes;
}

const payload = elfPayload();
const testAsset: HexEngineAsset = {
  platform: "linux",
  arch: "x64",
  filename: "hex-3.1.1-linux-x64",
  downloadBytes: payload.length,
  sha256: createHash("sha256").update(payload).digest("hex"),
  archive: false,
};

describe("HexEngineInstaller", () => {
  let directory: string;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  async function createDirectory(): Promise<string> {
    directory = await mkdtemp(join(tmpdir(), "poracode-hex-installer-"));
    return directory;
  }

  function installer(
    managedDirectory: string,
    overrides: Partial<ConstructorParameters<typeof HexEngineInstaller>[0]> = {},
    responsePayload = payload,
  ): HexEngineInstaller {
    return new HexEngineInstaller({
      managedDirectory,
      platform: "linux",
      arch: "x64",
      glibcVersion: "2.40",
      assets: [testAsset],
      fetcher: vi.fn<typeof fetch>(
        async () =>
          new Response(Uint8Array.from(responsePayload).buffer as ArrayBuffer, {
            headers: { "content-length": String(responsePayload.length) },
          }),
      ),
      probe: vi.fn<(executable: string, signal: AbortSignal) => Promise<void>>(async () => {}),
      ...overrides,
    });
  }

  it("pins five valid SHA-256 digests", () => {
    expect(HEX_ENGINE_ASSETS).toHaveLength(5);
    expect(HEX_ENGINE_ASSETS.every((asset) => /^[a-f0-9]{64}$/.test(asset.sha256))).toBe(true);
  });

  it("rejects checksum failures before probing or promoting an engine", async () => {
    const root = await createDirectory();
    const probe = vi.fn<(executable: string, signal: AbortSignal) => Promise<void>>(async () => {});
    const manager = installer(root, {
      assets: [{ ...testAsset, sha256: "0".repeat(64) }],
      probe,
    });

    manager.startInstall();
    await vi.waitFor(() => expect(manager.isInstalling).toBe(false));

    expect(manager.snapshot()).toMatchObject({ state: "error", error: "integrity" });
    expect(probe).not.toHaveBeenCalled();
    expect(await readdir(root)).toEqual([]);
    expect(manager.managedExecutable).toBeUndefined();
  });

  it("rejects unsupported platforms and Linux runtimes below glibc 2.39 without downloading", async () => {
    const root = await createDirectory();
    const fetcher = vi.fn<typeof fetch>();
    const unsupported = installer(root, { arch: "ia32", fetcher });
    expect(unsupported.snapshot()).toMatchObject({ state: "unsupported", error: "unsupported" });
    expect(() => unsupported.startInstall()).toThrow("unsupported");

    const incompatible = installer(root, { glibcVersion: "2.38", fetcher });
    expect(incompatible.snapshot()).toMatchObject({
      state: "unsupported",
      error: "incompatible",
      downloadBytes: payload.length,
    });
    expect(() => incompatible.startInstall()).toThrow("incompatible");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("preserves an unknown manifest without attempting to install over it", async () => {
    const root = await createDirectory();
    const pointerPath = join(root, "active.json");
    const pointer = JSON.stringify({ schemaVersion: 2, futureField: "preserve" });
    await writeFile(pointerPath, pointer);
    const fetcher = vi.fn<typeof fetch>();
    const manager = installer(root, { fetcher });

    expect(manager.snapshot()).toMatchObject({ state: "error", error: "incompatible" });
    expect(manager.managedExecutable).toBeUndefined();
    expect(() => manager.startInstall()).toThrow("incompatible");
    expect(fetcher).not.toHaveBeenCalled();
    expect(await readFile(pointerPath, "utf8")).toBe(pointer);
    expect(await readdir(root)).toEqual(["active.json"]);
  });

  it("rejects invalid ELF architecture before probing", async () => {
    const root = await createDirectory();
    const armPayload = elfPayload(183);
    const probe = vi.fn<(executable: string, signal: AbortSignal) => Promise<void>>(async () => {});
    const manager = installer(
      root,
      {
        assets: [
          {
            ...testAsset,
            downloadBytes: armPayload.length,
            sha256: createHash("sha256").update(armPayload).digest("hex"),
          },
        ],
        probe,
      },
      armPayload,
    );

    manager.startInstall();
    await vi.waitFor(() => expect(manager.isInstalling).toBe(false));

    expect(manager.snapshot()).toMatchObject({ state: "error", error: "integrity" });
    expect(probe).not.toHaveBeenCalled();
    expect(await readdir(root)).toEqual([]);

    const malformedPayload = new Uint8Array(64);
    const malformed = installer(
      root,
      {
        assets: [
          {
            ...testAsset,
            sha256: createHash("sha256").update(malformedPayload).digest("hex"),
          },
        ],
        probe,
      },
      malformedPayload,
    );
    malformed.startInstall();
    await vi.waitFor(() => expect(malformed.isInstalling).toBe(false));
    expect(malformed.snapshot()).toMatchObject({ state: "error", error: "integrity" });
    expect(probe).not.toHaveBeenCalled();
    expect(await readdir(root)).toEqual([]);
  });

  it("keeps an older managed engine selected when an upgrade probe fails", async () => {
    const root = await createDirectory();
    const release = "3.0.0-12345678-1234-1234-1234-123456789abc";
    const releaseDirectory = join(root, "releases", release);
    const oldExecutable = join(releaseDirectory, "hex");
    const pointerPath = join(root, "active.json");
    await mkdir(releaseDirectory, { recursive: true });
    await writeFile(oldExecutable, payload, { mode: 0o700 });
    const pointer = JSON.stringify({
      schemaVersion: 1,
      release,
      version: "3.0.0",
      platform: "linux",
      arch: "x64",
    });
    await writeFile(pointerPath, pointer);
    const probe = vi.fn<(executable: string, signal: AbortSignal) => Promise<void>>(async () => {
      throw new Error("probe failed");
    });
    const manager = installer(root, { probe });

    manager.startInstall();
    await vi.waitFor(() => expect(manager.isInstalling).toBe(false));

    expect(probe).toHaveBeenCalled();
    expect(manager.managedExecutable).toBe(oldExecutable);
    expect(manager.snapshot()).toMatchObject({
      state: "installed",
      source: "managed",
      version: "3.0.0",
      error: "incompatible",
    });
    expect(await readFile(pointerPath, "utf8")).toBe(pointer);
    const service = new HexVoiceService({
      installer: manager,
      executable: () => undefined,
      pathExecutable: () => undefined,
    });
    await expect(service.handle({ action: "setup" })).resolves.toMatchObject({
      kind: "setup",
      setup: { engine: { source: "managed", version: "3.0.0", error: "incompatible" } },
    });
    await service.dispose();
  });

  it("removes private staging after cancellation", async () => {
    const root = await createDirectory();
    let started!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const fetcher = vi.fn<typeof fetch>(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal as AbortSignal;
          started();
          signal.addEventListener(
            "abort",
            () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            { once: true },
          );
        }),
    );
    const manager = installer(root, { fetcher });

    manager.startInstall();
    await fetchStarted;
    await manager.cancelInstall();

    expect(manager.isInstalling).toBe(false);
    expect(await readdir(root)).toEqual([]);
    expect(manager.snapshot()).toMatchObject({ state: "missing" });
  });

  it("waits for an aborted SDK probe to close before removing staging", async () => {
    const root = await createDirectory();
    let started!: () => void;
    let finishCleanup!: () => void;
    const probeStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const cleanup = new Promise<void>((resolve) => {
      finishCleanup = resolve;
    });
    let cleanupFinished = false;
    const probe = vi.fn<(executable: string, signal: AbortSignal) => Promise<void>>(
      async (_executable: string, signal: AbortSignal): Promise<void> =>
        new Promise<void>((_resolve, reject) => {
          started();
          signal.addEventListener(
            "abort",
            () => {
              void cleanup.then(() => {
                cleanupFinished = true;
                reject(new Error("probe aborted"));
              });
            },
            { once: true },
          );
        }),
    );
    const manager = installer(root, { probe });
    manager.startInstall();
    await probeStarted;
    let cancelled = false;
    const cancelling = manager.cancelInstall().then(() => {
      cancelled = true;
    });
    await Promise.resolve();
    expect(cancelled).toBe(false);
    expect(cleanupFinished).toBe(false);
    finishCleanup();
    await cancelling;
    expect(cleanupFinished).toBe(true);
    expect(cancelled).toBe(true);
    expect(await readdir(root)).toEqual([]);
  });

  it("cancels an oversized response stream", async () => {
    const root = await createDirectory();
    let streamCancelled = false;
    const tooLarge = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(testAsset.downloadBytes + 1));
      },
      cancel() {
        streamCancelled = true;
      },
    });
    const manager = installer(root, {
      fetcher: vi.fn<typeof fetch>(async () => new Response(tooLarge)),
    });

    manager.startInstall();
    await vi.waitFor(() => expect(manager.isInstalling).toBe(false));

    expect(streamCancelled).toBe(true);
    expect(manager.snapshot()).toMatchObject({ state: "error", error: "integrity" });
    expect(await readdir(root)).toEqual([]);
  });

  it("removes only the managed engine and leaves an external executable untouched", async () => {
    const root = await createDirectory();
    const managedDirectory = join(root, "managed");
    const externalExecutable = join(root, "external-hex");
    await writeFile(externalExecutable, payload, { mode: 0o700 });
    const probe = vi.fn<(executable: string, signal: AbortSignal) => Promise<void>>(async () => {});
    const manager = installer(managedDirectory, { probe });

    manager.startInstall();
    await vi.waitFor(() => expect(manager.isInstalling).toBe(false));
    expect(manager.snapshot()).toMatchObject({ state: "installed", source: "managed" });
    const license = await readFile(
      join(
        managedDirectory,
        "releases",
        (await readdir(join(managedDirectory, "releases")))[0]!,
        "LICENSE",
      ),
      "utf8",
    );
    expect(license).toContain("Copyright (c) 2026 Christopher Langton");

    const service = new HexVoiceService({
      installer: manager,
      executable: () => externalExecutable,
    });
    await expect(service.handle({ action: "setup" })).resolves.toMatchObject({
      kind: "setup",
      setup: { engine: { state: "installed", source: "external" } },
    });
    await expect(service.handle({ action: "remove_engine" })).resolves.toMatchObject({
      kind: "setup",
      setup: { engine: { state: "installed", source: "external" } },
    });
    await service.dispose();
    await expect(
      readFile(externalExecutable).then((bytes) => new Uint8Array(bytes)),
    ).resolves.toEqual(payload);
    expect(manager.managedExecutable).toBeUndefined();
    expect(HEX_ENGINE_ASSETS).toHaveLength(5);
  });
});
