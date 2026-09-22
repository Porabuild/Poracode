import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  sshRuntimeManifestFileName,
  SSH_RUNTIME_MANIFEST_VERSION,
  type SshRuntimeEntryName,
} from "@/shared/sshRuntimeManifest";
import { RUNTIME_BUILD_SOURCE_HASH } from "@/shared/runtimeBuildIdentity";
import { ensureSshRuntimeBundle } from "./runtimeBundle";
import { ensureSshRuntimeBundleAsync, resetSshRuntimeBundleAsyncCache } from "./runtimeBundleAsync";
import {
  SSH_RUNTIME_ARCHIVE_MANIFEST_FILE,
  SSH_RUNTIME_ARCHIVE_MANIFEST_VERSION,
} from "./runtimeArchive";

vi.mock("@/shared/runtimeBuildIdentity", () => ({ RUNTIME_BUILD_SOURCE_HASH: "d".repeat(64) }));

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  resetSshRuntimeBundleAsyncCache();
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const runtimeDependencies = ["better-sqlite3", "node-pty", "ws", "yaml"] as const;

function writeRuntimeManifest(
  mainBundleDir: string,
  entry: SshRuntimeEntryName,
  files: readonly string[],
): void {
  writeFileSync(
    join(mainBundleDir, sshRuntimeManifestFileName(entry)),
    `${JSON.stringify({
      version: SSH_RUNTIME_MANIFEST_VERSION,
      entry,
      sourceHash: RUNTIME_BUILD_SOURCE_HASH,
      captureProtocolVersion: 1,
      settingsServiceVersion: 0,
      resources: [],
      files: files.map((path) => {
        const bytes = readFileSync(join(mainBundleDir, path));
        return {
          path,
          format: path.endsWith(".mjs") ? "module" : "commonjs",
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        };
      }),
      dependencies: runtimeDependencies,
    })}\n`,
    "utf8",
  );
}

function createRuntimeFixture(): {
  readonly root: string;
  readonly mainBundleDir: string;
  readonly agentPluginsDir: string;
  readonly wslHelpersDir: string;
  readonly cacheDir: string;
} {
  const root = mkdtempSync(join(tmpdir(), "poracode-ssh-async-bundle-"));
  tempDirs.push(root);
  const mainBundleDir = join(root, "main");
  const agentPluginsDir = join(root, "agent-plugins");
  const wslHelpersDir = join(root, "wsl-helpers");
  const cacheDir = join(root, "cache");
  mkdirSync(mainBundleDir, { recursive: true });
  mkdirSync(agentPluginsDir, { recursive: true });
  mkdirSync(wslHelpersDir, { recursive: true });
  writeFileSync(join(mainBundleDir, "server.cjs"), "server", "utf8");
  writeFileSync(join(mainBundleDir, "supervisor.cjs"), "supervisor", "utf8");
  writeFileSync(join(mainBundleDir, "claudeSdkProbeWorker.mjs"), "worker", "utf8");
  writeFileSync(join(mainBundleDir, "cursorSdkWorker.mjs"), "worker", "utf8");
  writeRuntimeManifest(mainBundleDir, "server", ["server.cjs"]);
  writeRuntimeManifest(mainBundleDir, "supervisor", ["supervisor.cjs"]);
  writeRuntimeManifest(mainBundleDir, "claudeSdkProbeWorker", ["claudeSdkProbeWorker.mjs"]);
  writeRuntimeManifest(mainBundleDir, "cursorSdkWorker", ["cursorSdkWorker.mjs"]);
  writeFileSync(join(agentPluginsDir, "plugin.json"), "{}", "utf8");
  writeFileSync(join(wslHelpersDir, "bridge.mjs"), "", "utf8");
  return { root, mainBundleDir, agentPluginsDir, wslHelpersDir, cacheDir };
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function stageDirectories(cacheDir: string): string[] {
  try {
    return readdirSync(cacheDir).filter((name) => name.startsWith("stage-"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function tarEntries(archivePath: string): string[] {
  const tar = process.platform === "win32" ? "tar.exe" : "tar";
  return execFileSync(tar, ["-tzf", archivePath], { encoding: "utf8" })
    .split(/\r?\n/g)
    .filter(Boolean)
    .sort();
}

describe("asynchronous SSH runtime bundle", () => {
  it("stages the same content-addressed archive as the synchronous builder", async () => {
    const fixture = createRuntimeFixture();
    const syncBundle = ensureSshRuntimeBundle(fixture);
    const asyncBundle = await ensureSshRuntimeBundleAsync({
      ...fixture,
      cacheDir: join(fixture.root, "async-cache"),
    });

    expect(asyncBundle.source).toBe("staged");
    expect(asyncBundle.hash).toBe(syncBundle.hash);
    // gzip bytes carry timestamps; the content-addressed directory hash and
    // the captured entry set are the parity contract.
    expect(tarEntries(asyncBundle.archivePath)).toEqual(tarEntries(syncBundle.archivePath));
  });

  it("rejects an Electron-bound standalone helper bundle", async () => {
    const fixture = createRuntimeFixture();
    writeFileSync(join(fixture.mainBundleDir, "server.cjs"), 'require("electron");', "utf8");
    await expect(ensureSshRuntimeBundleAsync(fixture)).rejects.toThrow(
      "Poracode Helper cannot include Electron",
    );
  });

  it("cancels staging and removes the temporary stage", async () => {
    const fixture = createRuntimeFixture();
    const controller = new AbortController();
    const pending = ensureSshRuntimeBundleAsync({ ...fixture, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toSatisfy(
      (error: unknown) => error instanceof Error && error.name === "AbortError",
    );
    expect(stageDirectories(fixture.cacheDir)).toEqual([]);
  });

  it("refuses a pre-aborted build before any work", async () => {
    const fixture = createRuntimeFixture();
    const controller = new AbortController();
    controller.abort();
    await expect(
      ensureSshRuntimeBundleAsync({ ...fixture, signal: controller.signal }),
    ).rejects.toSatisfy((error: unknown) => error instanceof Error && error.name === "AbortError");
  });
});

describe("preassembled SSH runtime archive", () => {
  function writePreassembledArchive(fixture: ReturnType<typeof createRuntimeFixture>) {
    const bundle = ensureSshRuntimeBundle(fixture);
    const archiveDir = join(fixture.root, "ssh-runtime-archive");
    mkdirSync(archiveDir, { recursive: true });
    const archiveName = "runtime.tar.gz";
    copyFileSync(bundle.archivePath, join(archiveDir, archiveName));
    const manifest = {
      formatVersion: SSH_RUNTIME_ARCHIVE_MANIFEST_VERSION,
      archive: archiveName,
      hash: bundle.hash,
      archiveSha256: sha256(join(archiveDir, archiveName)),
      sourceHash: RUNTIME_BUILD_SOURCE_HASH,
    };
    writeFileSync(
      join(archiveDir, SSH_RUNTIME_ARCHIVE_MANIFEST_FILE),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    return { archiveDir, archivePath: join(archiveDir, archiveName), bundle };
  }

  it("prefers the immutable release archive without staging anything", async () => {
    const fixture = createRuntimeFixture();
    const preassembled = writePreassembledArchive(fixture);
    const cacheDir = join(fixture.root, "unused-cache");

    const result = await ensureSshRuntimeBundleAsync({
      ...fixture,
      cacheDir,
      preassembledArchiveDir: preassembled.archiveDir,
    });

    expect(result).toMatchObject({
      source: "preassembled",
      hash: preassembled.bundle.hash,
      archivePath: preassembled.archivePath,
    });
    expect(stageDirectories(cacheDir)).toEqual([]);
  });

  it("falls back to worker staging for an archive built from other sources", async () => {
    const fixture = createRuntimeFixture();
    const preassembled = writePreassembledArchive(fixture);
    const manifestPath = join(preassembled.archiveDir, SSH_RUNTIME_ARCHIVE_MANIFEST_FILE);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    writeFileSync(
      manifestPath,
      `${JSON.stringify({ ...manifest, sourceHash: "e".repeat(64) })}\n`,
      "utf8",
    );

    const result = await ensureSshRuntimeBundleAsync({
      ...fixture,
      preassembledArchiveDir: preassembled.archiveDir,
    });

    expect(result.source).toBe("staged");
    expect(result.hash).toBe(preassembled.bundle.hash);
  });

  it("refuses a byte-mismatched archive instead of falling back silently", async () => {
    const fixture = createRuntimeFixture();
    const preassembled = writePreassembledArchive(fixture);
    const archive = readFileSync(preassembled.archivePath);
    archive[archive.length - 1] = (archive[archive.length - 1] ?? 0) ^ 0xff;
    writeFileSync(preassembled.archivePath, archive);

    await expect(
      ensureSshRuntimeBundleAsync({
        ...fixture,
        preassembledArchiveDir: preassembled.archiveDir,
      }),
    ).rejects.toThrow("does not match its manifest");
  });

  it("refuses a missing archive file", async () => {
    const fixture = createRuntimeFixture();
    const preassembled = writePreassembledArchive(fixture);
    rmSync(preassembled.archivePath);

    await expect(
      ensureSshRuntimeBundleAsync({
        ...fixture,
        preassembledArchiveDir: preassembled.archiveDir,
      }),
    ).rejects.toThrow("missing its archive file");
  });

  it("refuses an unknown archive manifest generation", async () => {
    const fixture = createRuntimeFixture();
    const preassembled = writePreassembledArchive(fixture);
    const manifestPath = join(preassembled.archiveDir, SSH_RUNTIME_ARCHIVE_MANIFEST_FILE);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, formatVersion: 99 })}\n`, "utf8");

    await expect(
      ensureSshRuntimeBundleAsync({
        ...fixture,
        preassembledArchiveDir: preassembled.archiveDir,
      }),
    ).rejects.toThrow(/invalid input/i);
  });

  it("treats an absent archive directory as a development checkout", async () => {
    const fixture = createRuntimeFixture();
    const result = await ensureSshRuntimeBundleAsync({
      ...fixture,
      preassembledArchiveDir: join(fixture.root, "not-shipped"),
    });
    expect(result.source).toBe("staged");
  });

  it("keeps the tar archive readable with the declared staged hash", async () => {
    const fixture = createRuntimeFixture();
    const result = await ensureSshRuntimeBundleAsync(fixture);
    expect(
      tarEntries(result.archivePath).some((name) =>
        name.endsWith("supervisor.ssh-runtime-manifest.json"),
      ),
    ).toBe(true);
  });
});
