import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import { PORACODE_CLIENT_RUNTIME_VERSION } from "@/shared/clientRuntime";
import type { IpcProcedurePayload, IpcProcedureResult } from "@/shared/ipc";
import { resetClientRuntimeForTest, installElectronClientRuntime } from "./clientRuntime";
import { readBridge } from "./bridge";

/**
 * Unified-path large-reply transfer (V5 plan 2.5 acceptance): the renderer
 * stream's chunked large-reply framing is deleted; a large reply must reach
 * the caller INTACT across the unified desktop-IPC procedure path (renderer
 * procedure invoke → main → backend-host `call-*`). This file pins the
 * 32 MiB acceptance on that unified path, including the byte-exact integrity
 * of a reply that large and the concurrent-delivery behavior the framing used
 * to provide (an unbounded reply no longer has a stream admission budget to
 * refuse it — the transport imposes no renderer-side size cap).
 */

const LARGE_BYTES = 32 * 1024 * 1024;

/** Deterministic 32 MiB payload of repeated `filler` characters. */
function largeString(totalChars: number, filler = "x"): string {
  const chunk = filler.repeat(1024);
  const pieces: string[] = [];
  let remaining = totalChars;
  while (remaining > 0) {
    const take = Math.min(1024, remaining);
    pieces.push(take === 1024 ? chunk : chunk.slice(0, take));
    remaining -= take;
  }
  return pieces.join("");
}

const FIXTURE_LOCATION = { kind: "posix", path: "/fixture" } as const;

type Invoke = (name: string, args: unknown[]) => Promise<unknown>;

function electronHostWithInvoke(invoke: Invoke): ElectronHostBridge {
  return {
    clientRuntimeVersion: PORACODE_CLIENT_RUNTIME_VERSION,
    arch: "x64",
    platform: "darwin",
    onSupervisorEvent: () => () => {},
    onSupervisorEventGap: () => () => {},
    onBackendSupervisorReset: () => () => {},
    ipcProcedureMapVersion: 1,
    invokeProcedure: (name: string, args: unknown[]) => invoke(name, args),
  } as unknown as ElectronHostBridge;
}

beforeEach(() => {
  resetClientRuntimeForTest();
  Reflect.deleteProperty(window, "poracode");
  Reflect.deleteProperty(window, "poracodeHost");
});

afterEach(() => {
  resetClientRuntimeForTest();
  vi.restoreAllMocks();
});

function install(invoke: (name: string, args: unknown[]) => Promise<unknown>) {
  const host = electronHostWithInvoke(invoke);
  window.poracodeHost = host;
  installElectronClientRuntime(host);
  return readBridge();
}

type ReadProjectFilePayload = IpcProcedurePayload<"readProjectFile">;
type ReadProjectFileResult = IpcProcedureResult<"readProjectFile">;

describe("unified-path large-reply transfer", () => {
  it("delivers a 32 MiB file reply byte-exactly across the procedure invoke path", async () => {
    const blob = largeString(LARGE_BYTES);
    expect(blob.length).toBe(LARGE_BYTES);

    const bridge = install(async (name) => {
      expect(name).toBe("readProjectFile");
      return {
        path: "/fixture/large.txt",
        status: "ready",
        modifiedAtMs: 1,
        content: blob,
      } as ReadProjectFileResult;
    });

    const result = (await bridge.readProjectFile({
      projectLocation: FIXTURE_LOCATION,
      path: "/fixture/large.txt",
    })) as { content: string };
    // Byte-exact integrity: the whole 32 MiB payload survived the boundary.
    expect(result.content.length).toBe(LARGE_BYTES);
    expect(result.content).toBe(blob);
  }, 60_000);

  it("delivers concurrent large replies without interleaving or loss", async () => {
    const first = largeString(LARGE_BYTES, "x");
    const second = largeString(LARGE_BYTES, "y");
    // Two distinct 32 MiB payloads in flight at once (the stream used to cap
    // concurrent large deliveries; the unified path does not).
    expect(first).not.toBe(second);

    const bridge = install(async (name, args) => {
      expect(name).toBe("readProjectFile");
      const marker = (args[0] as ReadProjectFilePayload).path;
      return {
        path: marker,
        status: "ready",
        modifiedAtMs: 1,
        content: marker.endsWith("one") ? first : second,
      } as ReadProjectFileResult;
    });

    const payload = (path: string) =>
      ({ projectLocation: FIXTURE_LOCATION, path }) as ReadProjectFilePayload;
    const [a, b] = (await Promise.all([
      bridge.readProjectFile(payload("/fixture/one")) as Promise<{ content: string }>,
      bridge.readProjectFile(payload("/fixture/two")) as Promise<{ content: string }>,
    ])) as [{ content: string }, { content: string }];
    expect(a.content).toBe(first);
    expect(b.content).toBe(second);
  }, 60_000);
});
