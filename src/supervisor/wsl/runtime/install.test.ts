/**
 * Regression coverage for managed WSL Node install custody and completion:
 *
 * - a bin/node without the completion marker is never accepted as installed;
 * - a pre-marker (legacy) install is accepted only after the exact binary runs
 *   and is stamped, so an interrupted extraction can never pass for it;
 * - cancellation reaches the real bootstrap extractor and the successor waits
 *   for its actual settlement (real owned POSIX children);
 * - the staged input is unique per attempt and is never freed while an
 *   unconfirmed extraction child could still read it.
 *
 * The WSL seams (UNC filesystem behind the real `WslStagingService`, the
 * bridge exec, the wsl.exe/tar child) are controlled fakes; the orchestration
 * under test is the production source. Native POSIX child semantics are real.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execInWsl:
    vi.fn<(distro: string, cwd: string, command: string, args: string[]) => Promise<string>>(),
  getWslCommand: vi.fn<() => string>(() => "wsl.exe"),
  resolveHomeAsync: vi.fn<(distro: string) => Promise<string | undefined>>(),
  getCachedHome: vi.fn<(distro: string) => string | undefined>(),
  probeUserNode:
    vi.fn<
      (distro: string, options?: unknown) => Promise<{ nodePath: string; version: string } | null>
    >(),
  probeDistroArch:
    vi.fn<
      (distro: string, useBridge: boolean, signal?: AbortSignal) => Promise<"x64" | "arm64" | null>
    >(),
  resolveHomeBootstrap:
    vi.fn<(distro: string, signal?: AbortSignal) => Promise<string | undefined>>(),
  downloadToFile: vi.fn<(url: string, dest: string, options?: unknown) => Promise<void>>(),
  verifySha256: vi.fn<(path: string, checksum: string) => Promise<void>>(),
  spawnOverride: {
    enabled: false,
    fn: vi.fn<(...args: unknown[]) => Promise<void>>(),
  },
}));

vi.mock("../../agents/base", () => ({
  execInWsl: mocks.execInWsl,
  getWslCommand: mocks.getWslCommand,
  resolveWslHomeDirectoryAsync: mocks.resolveHomeAsync,
  getCachedWslHomeDirectory: mocks.getCachedHome,
  resolveWslHomeDirectory: (distro: string) => mocks.getCachedHome(distro),
}));

vi.mock("./probe", () => ({
  probeUserNode: mocks.probeUserNode,
  probeDistroArch: mocks.probeDistroArch,
  resolveWslHomeDirectoryForBootstrap: mocks.resolveHomeBootstrap,
}));

vi.mock("../../runtime/download", () => ({
  downloadToFile: mocks.downloadToFile,
  verifySha256: mocks.verifySha256,
}));

vi.mock("../../runtime/spawn", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../runtime/spawn")>();
  return {
    ...actual,
    spawnAndAwaitExit: (...args: Parameters<typeof actual.spawnAndAwaitExit>) => {
      if (mocks.spawnOverride.enabled) return mocks.spawnOverride.fn(...args);
      return actual.spawnAndAwaitExit(...args);
    },
  };
});

import { parseWslUncPath, toWslUncPath } from "@/shared/wsl";
import { PORACODE_PINNED_NODE_VERSION, nodeArchiveDirName } from "../../runtime/pinnedNode";
import type { WslStagingExecuteOptions, WslStagingExecutor } from "../staging/executor";
import type { WslStagingRequest } from "../staging/protocol";
import { WslStagingService } from "../staging/service";
import { MANAGED_RUNTIME_MARKER_VERSION } from "./completion";
import { resolveNodeForDistro } from "./index";

const VERSIONED = nodeArchiveDirName("linux-x64");
const RUNTIME_DIR = "/home/u/.poracode/runtime";
const NODE_PATH = `${RUNTIME_DIR}/${VERSIONED}/bin/node`;
const MARKER_PATH = `${RUNTIME_DIR}/${VERSIONED}/.poracode-managed-complete.json`;

let roots: string[] = [];
let ownedPids = new Set<number>();

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function track(pid: number): number {
  ownedPids.add(pid);
  return pid;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function mappedPath(root: string, uncPath: string): string {
  const parsed = parseWslUncPath(uncPath);
  if (!parsed) throw new Error(`install test: not a WSL UNC path: ${uncPath}`);
  return join(root, "mapped", parsed.linuxPath.replace(/^\/+/u, ""));
}

function mappedNode(root: string, distro: string): string {
  return mappedPath(root, toWslUncPath(distro, NODE_PATH));
}

function mappedMarker(root: string, distro: string): string {
  return mappedPath(root, toWslUncPath(distro, MARKER_PATH));
}

interface StagingHarness {
  service: WslStagingService;
  requests: WslStagingRequest[];
}

function createMappedStaging(root: string): StagingHarness {
  const requests: WslStagingRequest[] = [];
  const executor: WslStagingExecutor = {
    async execute<T = unknown>(
      request: WslStagingRequest,
      options: WslStagingExecuteOptions,
    ): Promise<T> {
      if (options.signal?.aborted) {
        throw options.signal.reason ?? new Error("WSL staging request aborted");
      }
      requests.push(request);
      switch (request.op) {
        case "exists":
          return existsSync(mappedPath(root, request.path)) as T;
        case "read-file": {
          try {
            return {
              exists: true,
              contentBase64: readFileSync(mappedPath(root, request.path)).toString("base64"),
            } as T;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false } as T;
            throw error;
          }
        }
        case "stage-file": {
          const dest = mappedPath(root, request.dest);
          mkdirSync(dirname(dest), { recursive: true });
          copyFileSync(request.src, dest);
          return undefined as T;
        }
        case "remove":
          rmSync(mappedPath(root, request.path), { recursive: true, force: true });
          return undefined as T;
        case "mkdirp":
          mkdirSync(mappedPath(root, request.path), { recursive: true });
          return undefined as T;
        case "prune-dirs":
          return undefined as T;
        default:
          throw new Error(`install test: unexpected staging op ${(request as { op: string }).op}`);
      }
    },
    async dispose(): Promise<void> {},
  };
  return { service: new WslStagingService({ createExecutor: () => executor }), requests };
}

function writeExtractorScript(root: string): string {
  const scriptPath = join(root, "extractor.sh");
  writeFileSync(
    scriptPath,
    `#!/bin/sh
ROOT="$C4_INSTALL_ROOT"
BIN="$ROOT/mapped/home/u/.poracode/runtime/${VERSIONED}/bin"
echo "$$" > "$ROOT/pid.$$"
trap '' TERM INT
touch "$ROOT/started.$$"
while [ ! -f "$ROOT/go.$$" ]; do sleep 0.05; done
mkdir -p "$BIN"
printf 'complete-%s' "$$" > "$BIN/node"
`,
    { mode: 0o755 },
  );
  return scriptPath;
}

function writeVersionScript(root: string): string {
  const scriptPath = join(root, "node-version.sh");
  writeFileSync(
    scriptPath,
    `#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = "--version" ]; then printf 'v${PORACODE_PINNED_NODE_VERSION}\\n'; exit 0; fi
done
exit 1
`,
    { mode: 0o755 },
  );
  return scriptPath;
}

async function waitForStartedCount(root: string, count: number): Promise<number[]> {
  let pids: number[] = [];
  await vi.waitFor(
    () => {
      pids = readdirSync(root)
        .filter((name) => /^started\.\d+$/u.test(name))
        .map((name) => track(Number(name.slice("started.".length))));
      expect(pids.length).toBeGreaterThanOrEqual(count);
    },
    { timeout: 10_000 },
  );
  return pids;
}

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "poracode-install-test-"));
  roots.push(root);
  process.env.C4_INSTALL_ROOT = root;
  mocks.execInWsl.mockReset();
  mocks.getWslCommand.mockReset().mockReturnValue("wsl.exe");
  mocks.resolveHomeAsync.mockReset().mockResolvedValue("/home/u");
  mocks.getCachedHome.mockReset().mockReturnValue(undefined);
  mocks.probeUserNode.mockReset().mockResolvedValue(null);
  mocks.probeDistroArch.mockReset().mockResolvedValue("x64");
  mocks.resolveHomeBootstrap.mockReset().mockResolvedValue("/home/u");
  mocks.downloadToFile.mockReset().mockImplementation(async (_url, dest) => {
    writeFileSync(dest, "install-test-tarball");
  });
  mocks.verifySha256.mockReset().mockResolvedValue(undefined);
  mocks.spawnOverride.enabled = false;
  mocks.spawnOverride.fn.mockReset();
});

afterEach(() => {
  for (const pid of ownedPids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
  ownedPids = new Set();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
  delete process.env.C4_INSTALL_ROOT;
  mocks.spawnOverride.enabled = false;
});

describe("managed runtime completion proof", () => {
  it("does not accept bin/node without a completion marker", async () => {
    const root = roots.at(-1)!;
    const harness = createMappedStaging(root);
    const node = mappedNode(root, "C4Partial");
    const marker = mappedMarker(root, "C4Partial");
    mkdirSync(dirname(node), { recursive: true });
    writeFileSync(node, "truncated-node");

    mocks.execInWsl.mockImplementation(async (_distro, _cwd, command, args) => {
      if (command === NODE_PATH && args[0] === "--version") {
        throw new Error("cannot execute truncated binary");
      }
      if (command === "tar") {
        writeFileSync(node, "complete-node");
        return "";
      }
      throw new Error(`unexpected command ${command}`);
    });

    await expect(
      resolveNodeForDistro("C4Partial", { staging: harness.service }),
    ).resolves.toMatchObject({ nodePath: NODE_PATH });
    expect(mocks.downloadToFile).toHaveBeenCalledTimes(1);
    expect(existsSync(marker)).toBe(true);
  });

  it("invalidates a stale completion marker before writing the runtime again", async () => {
    const root = roots.at(-1)!;
    const harness = createMappedStaging(root);
    const node = mappedNode(root, "C4StaleMarker");
    const marker = mappedMarker(root, "C4StaleMarker");
    mkdirSync(dirname(marker), { recursive: true });
    writeFileSync(marker, "marker-without-binary");

    mocks.execInWsl.mockImplementation(async (_distro, _cwd, command) => {
      if (command !== "tar") throw new Error(`unexpected command ${command}`);
      // A crash after this point must not leave a marker that certifies a
      // partial tree, so the stale proof is already gone when tar runs.
      expect(existsSync(marker)).toBe(false);
      mkdirSync(dirname(node), { recursive: true });
      writeFileSync(node, "complete-node");
      return "";
    });

    await expect(
      resolveNodeForDistro("C4StaleMarker", { staging: harness.service }),
    ).resolves.toMatchObject({ nodePath: NODE_PATH });
    expect(mocks.downloadToFile).toHaveBeenCalledTimes(1);
    expect(existsSync(marker)).toBe(true);
  });

  it("refuses a marker from a newer build without downloading or touching the runtime", async () => {
    const root = roots.at(-1)!;
    const harness = createMappedStaging(root);
    const node = mappedNode(root, "C4FutureMarker");
    const marker = mappedMarker(root, "C4FutureMarker");
    mkdirSync(dirname(node), { recursive: true });
    writeFileSync(node, "future-node");
    const futureMarker = JSON.stringify({
      markerVersion: MANAGED_RUNTIME_MARKER_VERSION + 1,
      nodeVersion: PORACODE_PINNED_NODE_VERSION,
      target: "linux-x64",
    });
    writeFileSync(marker, futureMarker);

    mocks.execInWsl.mockImplementation(async (_distro, _cwd, command) => {
      throw new Error(`unexpected command ${command}`);
    });

    await expect(
      resolveNodeForDistro("C4FutureMarker", { staging: harness.service }),
    ).rejects.toThrow(new RegExp(`marker .* has version ${MANAGED_RUNTIME_MARKER_VERSION + 1}`));
    expect(mocks.downloadToFile).not.toHaveBeenCalled();
    expect(readFileSync(marker, "utf8")).toBe(futureMarker);
    expect(harness.requests.some((request) => request.op === "remove")).toBe(false);
    expect(harness.requests.some((request) => request.op === "stage-file")).toBe(false);
  });

  it("does not accept an interrupted extraction behind a corrupt marker", async () => {
    const root = roots.at(-1)!;
    const harness = createMappedStaging(root);
    const node = mappedNode(root, "C4CorruptMarker");
    const marker = mappedMarker(root, "C4CorruptMarker");
    mkdirSync(dirname(node), { recursive: true });
    writeFileSync(node, "truncated-node");
    writeFileSync(marker, "{ this is not a marker");

    mocks.execInWsl.mockImplementation(async (_distro, _cwd, command, args) => {
      if (command === NODE_PATH && args[0] === "--version") {
        throw new Error("cannot execute truncated binary");
      }
      if (command === "tar") {
        writeFileSync(node, "complete-node");
        return "";
      }
      throw new Error(`unexpected command ${command}`);
    });

    await expect(
      resolveNodeForDistro("C4CorruptMarker", { staging: harness.service }),
    ).resolves.toMatchObject({ nodePath: NODE_PATH });
    expect(mocks.downloadToFile).toHaveBeenCalledTimes(1);
    const repaired = JSON.parse(readFileSync(marker, "utf8")) as {
      markerVersion?: number;
      nodeVersion?: string;
      target?: string;
    };
    expect(repaired).toEqual({
      markerVersion: MANAGED_RUNTIME_MARKER_VERSION,
      nodeVersion: PORACODE_PINNED_NODE_VERSION,
      target: "linux-x64",
    });
  });

  it("repairs a wrong-target marker only after the exact binary proves itself", async () => {
    const root = roots.at(-1)!;
    const harness = createMappedStaging(root);
    const node = mappedNode(root, "C4WrongTarget");
    const marker = mappedMarker(root, "C4WrongTarget");
    mkdirSync(dirname(node), { recursive: true });
    writeFileSync(node, "legacy-node");
    writeFileSync(
      marker,
      JSON.stringify({
        markerVersion: MANAGED_RUNTIME_MARKER_VERSION,
        nodeVersion: PORACODE_PINNED_NODE_VERSION,
        target: "linux-arm64",
      }),
    );

    mocks.execInWsl.mockImplementation(async (_distro, _cwd, command, args) => {
      if (command === NODE_PATH && args[0] === "--version") {
        return `v${PORACODE_PINNED_NODE_VERSION}\n`;
      }
      throw new Error(`unexpected command ${command}`);
    });

    await expect(
      resolveNodeForDistro("C4WrongTarget", { staging: harness.service }),
    ).resolves.toMatchObject({ nodePath: NODE_PATH });
    expect(mocks.downloadToFile).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(marker, "utf8"))).toMatchObject({
      markerVersion: MANAGED_RUNTIME_MARKER_VERSION,
      target: "linux-x64",
    });
  });

  it("accepts a legacy install only after proving the exact binary runs, then stamps it", async () => {
    const root = roots.at(-1)!;
    const harness = createMappedStaging(root);
    const node = mappedNode(root, "C4Legacy");
    const marker = mappedMarker(root, "C4Legacy");
    mkdirSync(dirname(node), { recursive: true });
    writeFileSync(node, "legacy-node");

    mocks.execInWsl.mockImplementation(async (_distro, _cwd, command, args) => {
      if (command === NODE_PATH && args[0] === "--version") {
        return `v${PORACODE_PINNED_NODE_VERSION}\n`;
      }
      throw new Error(`unexpected command ${command}`);
    });

    await expect(
      resolveNodeForDistro("C4Legacy", { staging: harness.service }),
    ).resolves.toMatchObject({ nodePath: NODE_PATH });
    expect(mocks.downloadToFile).not.toHaveBeenCalled();
    const stamped = JSON.parse(readFileSync(marker, "utf8")) as {
      nodeVersion?: string;
    };
    expect(stamped.nodeVersion).toBe(PORACODE_PINNED_NODE_VERSION);
  });

  it("accepts a legacy bootstrap install after executing the exact binary", async () => {
    const root = roots.at(-1)!;
    writeVersionScript(root);
    mocks.getWslCommand.mockReturnValue(join(root, "node-version.sh"));
    const harness = createMappedStaging(root);
    const node = mappedNode(root, "C4LegacyBootstrap");
    const marker = mappedMarker(root, "C4LegacyBootstrap");
    mkdirSync(dirname(node), { recursive: true });
    writeFileSync(node, "legacy-node");

    await expect(
      resolveNodeForDistro("C4LegacyBootstrap", { useBridge: false, staging: harness.service }),
    ).resolves.toMatchObject({ nodePath: NODE_PATH });
    expect(mocks.downloadToFile).not.toHaveBeenCalled();
    expect(existsSync(marker)).toBe(true);
  });

  it("rejects a legacy install whose binary reports a different version", async () => {
    const root = roots.at(-1)!;
    const harness = createMappedStaging(root);
    const node = mappedNode(root, "C4WrongVersion");
    mkdirSync(dirname(node), { recursive: true });
    writeFileSync(node, "wrong-node");

    mocks.execInWsl.mockImplementation(async (_distro, _cwd, command, args) => {
      if (command === NODE_PATH && args[0] === "--version") return "v18.20.0\n";
      if (command === "tar") {
        writeFileSync(node, "complete-node");
        return "";
      }
      throw new Error(`unexpected command ${command}`);
    });

    await expect(
      resolveNodeForDistro("C4WrongVersion", { staging: harness.service }),
    ).resolves.toMatchObject({ nodePath: NODE_PATH });
    expect(mocks.downloadToFile).toHaveBeenCalledTimes(1);
  });

  it("stages every extraction attempt under a unique path", async () => {
    const root = roots.at(-1)!;
    const harness = createMappedStaging(root);
    const node = mappedNode(root, "C4Unique");
    let extraction = 0;

    mocks.execInWsl.mockImplementation(async (_distro, _cwd, command) => {
      if (command !== "tar") throw new Error(`unexpected command ${command}`);
      extraction += 1;
      if (extraction === 1) {
        throw new Error("tar extraction in C4Unique timed out after 60000ms");
      }
      mkdirSync(dirname(node), { recursive: true });
      writeFileSync(node, "complete-node");
      return "";
    });

    await expect(resolveNodeForDistro("C4Unique", { staging: harness.service })).rejects.toThrow(
      /timed out/,
    );
    await expect(
      resolveNodeForDistro("C4Unique", { staging: harness.service }),
    ).resolves.toMatchObject({ nodePath: NODE_PATH });

    const stagedDests = harness.requests
      .filter(
        (request): request is Extract<WslStagingRequest, { op: "stage-file" }> =>
          request.op === "stage-file" && request.dest.includes(".poracode-stage-"),
      )
      .map((request) => request.dest);
    expect(stagedDests).toHaveLength(2);
    expect(new Set(stagedDests).size).toBe(2);
  });

  it("leaves the staged input in place and publishes nothing when the exit is unconfirmed", async () => {
    const root = roots.at(-1)!;
    const harness = createMappedStaging(root);
    const marker = mappedMarker(root, "C4Unconfirmed");
    mocks.spawnOverride.enabled = true;
    mocks.spawnOverride.fn.mockImplementation(async () => {
      throw new Error(
        "tar extraction in C4Unconfirmed timed out after 60000ms and could not be confirmed exited after SIGKILL; process 4242 may still be running",
      );
    });

    await expect(
      resolveNodeForDistro("C4Unconfirmed", { useBridge: false, staging: harness.service }),
    ).rejects.toThrow(/could not be confirmed exited/);

    const staged = harness.requests.find(
      (request): request is Extract<WslStagingRequest, { op: "stage-file" }> =>
        request.op === "stage-file" && request.dest.includes(".poracode-stage-"),
    );
    expect(staged).toBeDefined();
    expect(existsSync(mappedPath(root, staged!.dest))).toBe(true);
    expect(existsSync(marker)).toBe(false);

    const removes = harness.requests
      .filter(
        (request): request is Extract<WslStagingRequest, { op: "remove" }> =>
          request.op === "remove",
      )
      .map((request) => request.path);
    expect(removes).toContain(toWslUncPath("C4Unconfirmed", MARKER_PATH));
    expect(removes).not.toContain(toWslUncPath("C4Unconfirmed", staged!.dest));
  });
});

describe("install cancellation and successor custody", () => {
  it("waits out an aborted predecessor and reuses its completed install", async () => {
    const root = roots.at(-1)!;
    const harness = createMappedStaging(root);
    const node = mappedNode(root, "C4Wait");
    const extractionGate = deferred();
    let extractionCalls = 0;

    mocks.execInWsl.mockImplementation(async (_distro, _cwd, command) => {
      if (command !== "tar") throw new Error(`unexpected command ${command}`);
      extractionCalls += 1;
      await extractionGate.promise;
      mkdirSync(dirname(node), { recursive: true });
      writeFileSync(node, "complete-node");
      return "";
    });

    const controller = new AbortController();
    const first = resolveNodeForDistro("C4Wait", {
      signal: controller.signal,
      staging: harness.service,
    });
    const firstOutcome = first.then(
      () => "resolved" as const,
      () => "rejected" as const,
    );
    await vi.waitFor(() => expect(extractionCalls).toBe(1));

    controller.abort(new Error("first caller cancelled"));
    await expect(firstOutcome).resolves.toBe("rejected");

    let successorSettled = false;
    const second = resolveNodeForDistro("C4Wait", { staging: harness.service }).then((value) => {
      successorSettled = true;
      return value;
    });
    await sleep(30);
    expect(successorSettled).toBe(false);

    extractionGate.resolve();
    await expect(second).resolves.toMatchObject({ nodePath: NODE_PATH });
    expect(extractionCalls).toBe(1);
    expect(mocks.downloadToFile).toHaveBeenCalledTimes(1);
  });

  it("joins the aborted bootstrap extractor before a successor extraction starts", async () => {
    const root = roots.at(-1)!;
    writeExtractorScript(root);
    mocks.getWslCommand.mockReturnValue(join(root, "extractor.sh"));
    const harness = createMappedStaging(root);
    const controller = new AbortController();

    const first = resolveNodeForDistro("C4Join", {
      useBridge: false,
      signal: controller.signal,
      staging: harness.service,
    });
    const firstOutcome = first.then(
      () => "resolved" as const,
      () => "rejected" as const,
    );
    const [firstPid] = await waitForStartedCount(root, 1);

    controller.abort(new Error("first caller cancelled"));
    await expect(firstOutcome).resolves.toBe("rejected");
    // SIGTERM is trapped; the extractor is only gone after the SIGKILL join.
    expect(isAlive(firstPid!)).toBe(true);

    const second = resolveNodeForDistro("C4Join", {
      useBridge: false,
      staging: harness.service,
    });
    const secondOutcome = second.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    const pids = await waitForStartedCount(root, 2);
    expect(isAlive(firstPid!)).toBe(false);
    const secondPid = pids.find((pid) => pid !== firstPid)!;
    writeFileSync(join(root, `go.${secondPid}`), "go");

    await expect(secondOutcome).resolves.toMatchObject({
      ok: true,
      value: { nodePath: NODE_PATH },
    });
    expect(existsSync(mappedMarker(root, "C4Join"))).toBe(true);
  });
});
