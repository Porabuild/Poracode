/**
 * Focused coverage for the managed-runtime completion marker boundary:
 * shape/generation/pinned-node/target validation, fail-closed handling of a
 * newer marker generation, absent-vs-unreadable distinctions, and the
 * pre-marker binary revalidation path. See `install.test.ts` for the
 * end-to-end install/cancellation custody tests.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const mocks = vi.hoisted(() => ({
  execInWsl:
    vi.fn<(distro: string, cwd: string, command: string, args: string[]) => Promise<string>>(),
  getWslCommand: vi.fn<() => string>(() => "wsl.exe"),
}));

vi.mock("../../agents/base", () => ({
  execInWsl: mocks.execInWsl,
  getWslCommand: mocks.getWslCommand,
}));

import { PORACODE_PINNED_NODE_VERSION } from "../../runtime/pinnedNode";
import type { WslStagingService } from "../staging";
import {
  MANAGED_RUNTIME_MARKER_VERSION,
  managedRuntimeIsComplete,
  managedRuntimeIsUsable,
  parseManagedRuntimeMarker,
  readManagedRuntimeMarker,
  type ManagedRuntimeIdentity,
} from "./completion";

const identity: ManagedRuntimeIdentity = {
  distro: "C4Unit",
  target: "linux-x64",
  linuxNodePath: "/home/u/.poracode/runtime/node-v22.14.0-linux-x64/bin/node",
  linuxMarkerPath:
    "/home/u/.poracode/runtime/node-v22.14.0-linux-x64/.poracode-managed-complete.json",
  uncNodePath:
    "\\\\wsl.localhost\\C4Unit\\home\\u\\.poracode\\runtime\\node-v22.14.0-linux-x64\\bin\\node",
  uncMarkerPath:
    "\\\\wsl.localhost\\C4Unit\\home\\u\\.poracode\\runtime\\node-v22.14.0-linux-x64\\.poracode-managed-complete.json",
};

function markerJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    markerVersion: MANAGED_RUNTIME_MARKER_VERSION,
    nodeVersion: PORACODE_PINNED_NODE_VERSION,
    target: "linux-x64",
    ...overrides,
  });
}

interface StagingStub {
  service: WslStagingService;
  readTextFile: Mock<() => Promise<string | null>>;
  pathExists: Mock<() => Promise<boolean>>;
  stageFile: Mock<(distro: string, input: { src: string; dest: string }) => Promise<void>>;
  /** Content of the last staged host file, captured before its cleanup. */
  staged: string | undefined;
}

function createStaging(options: {
  marker?: string | null;
  readError?: Error;
  nodeExists?: boolean;
}): StagingStub {
  const readTextFile = vi.fn<() => Promise<string | null>>(async () => {
    if (options.readError) throw options.readError;
    return options.marker ?? null;
  });
  const pathExists = vi.fn<() => Promise<boolean>>(async () => options.nodeExists ?? false);
  const stageFile =
    vi.fn<(distro: string, input: { src: string; dest: string }) => Promise<void>>();
  const stub: StagingStub = {
    service: undefined as unknown as WslStagingService,
    readTextFile,
    pathExists,
    stageFile,
    staged: undefined,
  };
  stageFile.mockImplementation(async (_distro, input) => {
    stub.staged = readFileSync(input.src, "utf8");
  });
  stub.service = { readTextFile, pathExists, stageFile } as unknown as WslStagingService;
  return stub;
}

beforeEach(() => {
  mocks.execInWsl.mockReset();
  mocks.getWslCommand.mockReset().mockReturnValue("wsl.exe");
});

describe("parseManagedRuntimeMarker", () => {
  it("accepts a v1 marker that pins the expected target and node", () => {
    expect(parseManagedRuntimeMarker(markerJson(), "linux-x64")).toEqual({ kind: "valid" });
  });

  it("tolerates additive fields on a v1 marker", () => {
    expect(
      parseManagedRuntimeMarker(markerJson({ installedAt: "2026-01-01", extra: [1] }), "linux-x64"),
    ).toEqual({ kind: "valid" });
  });

  it("rejects unparsable JSON as corrupt", () => {
    expect(parseManagedRuntimeMarker("{ nope", "linux-x64")).toEqual({
      kind: "invalid",
      reason: "corrupt",
    });
  });

  it("rejects non-object payloads as wrong-shape", () => {
    for (const raw of ["null", "[]", '"complete"', "7", "true"]) {
      expect(parseManagedRuntimeMarker(raw, "linux-x64")).toEqual({
        kind: "invalid",
        reason: "wrong-shape",
      });
    }
  });

  it("rejects a missing or non-integer markerVersion as wrong-shape", () => {
    for (const markerVersion of [undefined, "1", 1.5, null, true]) {
      const raw = JSON.stringify({
        markerVersion,
        nodeVersion: PORACODE_PINNED_NODE_VERSION,
        target: "linux-x64",
      });
      expect(parseManagedRuntimeMarker(raw, "linux-x64")).toEqual({
        kind: "invalid",
        reason: "wrong-shape",
      });
    }
  });

  it("rejects a marker generation below v1 as wrong-shape", () => {
    expect(parseManagedRuntimeMarker(markerJson({ markerVersion: 0 }), "linux-x64")).toEqual({
      kind: "invalid",
      reason: "wrong-shape",
    });
  });

  it("reports a future marker generation without trusting it", () => {
    expect(parseManagedRuntimeMarker(markerJson({ markerVersion: 2 }), "linux-x64")).toEqual({
      kind: "unsupported-version",
      markerVersion: 2,
    });
  });

  it("rejects a target mismatch", () => {
    expect(parseManagedRuntimeMarker(markerJson({ target: "linux-arm64" }), "linux-x64")).toEqual({
      kind: "invalid",
      reason: "wrong-target",
    });
  });

  it("rejects a wrong-typed or mismatched pinned node", () => {
    expect(parseManagedRuntimeMarker(markerJson({ nodeVersion: 22 }), "linux-x64")).toEqual({
      kind: "invalid",
      reason: "wrong-shape",
    });
    expect(parseManagedRuntimeMarker(markerJson({ nodeVersion: "18.20.0" }), "linux-x64")).toEqual({
      kind: "invalid",
      reason: "wrong-node-version",
    });
  });
});

describe("readManagedRuntimeMarker", () => {
  it("reports absence only for a missing path", async () => {
    const stub = createStaging({ nodeExists: true });
    await expect(readManagedRuntimeMarker(stub.service, identity, undefined)).resolves.toEqual({
      kind: "absent",
    });
  });

  it("propagates a read failure instead of reporting absence", async () => {
    const stub = createStaging({ readError: new Error("staging worker transport failed") });
    await expect(readManagedRuntimeMarker(stub.service, identity, undefined)).rejects.toThrow(
      "staging worker transport failed",
    );
  });
});

describe("managedRuntimeIsComplete", () => {
  it("is true only for a validated marker over a present binary", async () => {
    const stub = createStaging({ marker: markerJson(), nodeExists: true });
    await expect(managedRuntimeIsComplete(stub.service, identity, undefined)).resolves.toBe(true);
  });

  it("is false for a future marker", async () => {
    const stub = createStaging({ marker: markerJson({ markerVersion: 2 }), nodeExists: true });
    await expect(managedRuntimeIsComplete(stub.service, identity, undefined)).resolves.toBe(false);
  });

  it("does not read the marker when the binary is missing", async () => {
    const stub = createStaging({ marker: markerJson() });
    await expect(managedRuntimeIsComplete(stub.service, identity, undefined)).resolves.toBe(false);
    expect(stub.readTextFile).not.toHaveBeenCalled();
  });

  it("propagates a marker read failure", async () => {
    const stub = createStaging({
      readError: new Error("staging worker transport failed"),
      nodeExists: true,
    });
    await expect(managedRuntimeIsComplete(stub.service, identity, undefined)).rejects.toThrow(
      "staging worker transport failed",
    );
  });
});

describe("managedRuntimeIsUsable", () => {
  it("trusts a valid marker without running the binary", async () => {
    const stub = createStaging({ marker: markerJson(), nodeExists: true });
    await expect(
      managedRuntimeIsUsable(stub.service, identity, { useBridge: true, signal: undefined }),
    ).resolves.toBe(true);
    expect(mocks.execInWsl).not.toHaveBeenCalled();
    expect(stub.stageFile).not.toHaveBeenCalled();
  });

  it("does not trust a valid marker when the binary is missing", async () => {
    const stub = createStaging({ marker: markerJson(), nodeExists: false });
    await expect(
      managedRuntimeIsUsable(stub.service, identity, { useBridge: true, signal: undefined }),
    ).resolves.toBe(false);
    expect(mocks.execInWsl).not.toHaveBeenCalled();
  });

  it("revalidates and stamps a pre-marker install", async () => {
    const stub = createStaging({ nodeExists: true });
    mocks.execInWsl.mockResolvedValue(`v${PORACODE_PINNED_NODE_VERSION}\n`);
    await expect(
      managedRuntimeIsUsable(stub.service, identity, { useBridge: true, signal: undefined }),
    ).resolves.toBe(true);
    expect(mocks.execInWsl).toHaveBeenCalledTimes(1);
    expect(stub.staged).toBe(markerJson());
  });

  it("repairs a corrupt marker only after the binary proves itself", async () => {
    const stub = createStaging({ marker: "{ nope", nodeExists: true });
    mocks.execInWsl.mockResolvedValue(`v${PORACODE_PINNED_NODE_VERSION}\n`);
    await expect(
      managedRuntimeIsUsable(stub.service, identity, { useBridge: true, signal: undefined }),
    ).resolves.toBe(true);
    expect(stub.staged).toBe(markerJson());
  });

  it("does not stamp when the binary reports another version", async () => {
    const stub = createStaging({ nodeExists: true });
    mocks.execInWsl.mockResolvedValue("v18.20.0\n");
    await expect(
      managedRuntimeIsUsable(stub.service, identity, { useBridge: true, signal: undefined }),
    ).resolves.toBe(false);
    expect(stub.stageFile).not.toHaveBeenCalled();
  });

  it("does not trust a wrong-shape marker or a wrong-target/wrong-node marker", async () => {
    for (const marker of [
      JSON.stringify({ target: "linux-x64" }),
      markerJson({ target: "linux-arm64" }),
      markerJson({ nodeVersion: "18.20.0" }),
    ]) {
      const stub = createStaging({ marker, nodeExists: true });
      mocks.execInWsl.mockResolvedValue("v18.20.0\n");
      await expect(
        managedRuntimeIsUsable(stub.service, identity, { useBridge: true, signal: undefined }),
      ).resolves.toBe(false);
      expect(stub.stageFile).not.toHaveBeenCalled();
    }
  });

  it("returns false without executing a binary when the runtime is absent", async () => {
    const stub = createStaging({ nodeExists: false });
    await expect(
      managedRuntimeIsUsable(stub.service, identity, { useBridge: true, signal: undefined }),
    ).resolves.toBe(false);
    expect(mocks.execInWsl).not.toHaveBeenCalled();
  });

  it("fails closed on a future marker without executing or staging a replacement", async () => {
    for (const nodeExists of [true, false]) {
      const stub = createStaging({ marker: markerJson({ markerVersion: 2 }), nodeExists });
      await expect(
        managedRuntimeIsUsable(stub.service, identity, { useBridge: true, signal: undefined }),
      ).rejects.toThrow(/has version 2/);
      expect(stub.stageFile).not.toHaveBeenCalled();
      expect(mocks.execInWsl).not.toHaveBeenCalled();
    }
  });

  it("propagates a marker read failure without staging or reinstalling", async () => {
    const stub = createStaging({ readError: new Error("staging worker transport failed") });
    await expect(
      managedRuntimeIsUsable(stub.service, identity, { useBridge: true, signal: undefined }),
    ).rejects.toThrow("staging worker transport failed");
    expect(stub.stageFile).not.toHaveBeenCalled();
    expect(mocks.execInWsl).not.toHaveBeenCalled();
  });

  it("treats an abort after a successful proof as cancellation, not failure", async () => {
    const stub = createStaging({ nodeExists: true });
    const controller = new AbortController();
    mocks.execInWsl.mockImplementation(async () => {
      controller.abort(new Error("legacy validation cancelled"));
      return `v${PORACODE_PINNED_NODE_VERSION}\n`;
    });
    await expect(
      managedRuntimeIsUsable(stub.service, identity, {
        useBridge: true,
        signal: controller.signal,
      }),
    ).rejects.toThrow("legacy validation cancelled");
    expect(stub.stageFile).not.toHaveBeenCalled();
  });
});
