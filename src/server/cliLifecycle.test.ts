import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeadlessCompositionShutdownError } from "./headlessRemoteComposition";
import { runCli } from "./cli";
import { ensureDeclaredAssetsDir } from "./testDeclaredAssets";
import type { HeadlessRemoteHost, HeadlessRemoteHostOptions } from "./createHeadlessRemoteHost";

const fixture = vi.hoisted(() => ({
  createHost:
    vi.fn<
      (options: HeadlessRemoteHostOptions) => Promise<Pick<HeadlessRemoteHost, "start" | "dispose">>
    >(),
  stopDiagnostics: vi.fn<() => Promise<void>>(async () => undefined),
}));

vi.mock("./createHeadlessRemoteHost", () => ({
  createHeadlessRemoteHost: fixture.createHost,
}));
vi.mock("@/shared/diagnostics/nodePerformanceDiagnostics", () => ({
  startNodePerformanceDiagnostics: () => ({ stop: fixture.stopDiagnostics }),
}));

const priorArguments = process.argv;
const priorExitCode = process.exitCode;
const signals = new Map<string, () => void>();
// The synthetic host must expose the owned data root contract: serve() starts
// the leveled log file under it as soon as the lease is held (plan 4.9).
let dataRoot: string | undefined;
beforeEach(() => {
  process.argv = ["synthetic-node", "synthetic-server"];
  process.exitCode = undefined;
  vi.stubEnv("PORACODE_HEADLESS_SERVER", "0");
  // The test process runs cli.ts from src/server, outside both published
  // install shapes; serve() resolves the layout contract first, so the
  // required asset is declared explicitly (the documented escape hatch). The
  // declaration only requires an existing directory and the synthetic host
  // never consumes its contents — a test-owned temp dir keeps the harness
  // independent of prepared checkout resources (CI test shards stage none).
  vi.stubEnv("PORACODE_WSL_HELPERS_DIR", ensureDeclaredAssetsDir());
  fixture.createHost.mockReset();
  fixture.stopDiagnostics.mockClear();
  dataRoot = mkdtempSync(join(tmpdir(), "poracode-cli-lifecycle-"));
  signals.clear();
  vi.spyOn(process, "on").mockImplementation(((event: string, listener: () => void) => {
    signals.set(event, listener);
    return process;
  }) as typeof process.on);
  vi.spyOn(process, "off").mockImplementation(((event: string) => {
    signals.delete(event);
    return process;
  }) as typeof process.off);
  vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  process.argv = priorArguments;
  process.exitCode = priorExitCode;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  if (dataRoot !== undefined) rmSync(dataRoot, { recursive: true, force: true });
  dataRoot = undefined;
});

describe("headless CLI startup lifetime", () => {
  it.each(["factory", "listener"])(
    "owns signals during held %s startup and joins cancellation before exit",
    async (stage) => {
      const opening = Promise.withResolvers<void>();
      const drained = Promise.withResolvers<void>();
      let options: HeadlessRemoteHostOptions | undefined;
      const start = vi.fn<HeadlessRemoteHost["start"]>(async () => {
        if (stage === "listener") await opening.promise;
        return { httpBaseUrl: "http://127.0.0.1:1", wsBaseUrl: "ws://127.0.0.1:1" } as Awaited<
          ReturnType<HeadlessRemoteHost["start"]>
        >;
      });
      const dispose = vi.fn<() => Promise<void>>(() => drained.promise);
      fixture.createHost.mockImplementation(async (input) => {
        options = input;
        if (stage === "factory") await opening.promise;
        return { start, dispose, dataRoot: dataRoot! };
      });
      try {
        runCli();
        await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(stage === "listener" ? 1 : 0));
        expect(signals.has("SIGINT")).toBe(true);
        expect(signals.has("SIGTERM")).toBe(true);
        signals.get("SIGTERM")!();
        signals.get("SIGINT")!();
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(options).toMatchObject({ signal: { aborted: true } });
        expect(dispose).toHaveBeenCalledTimes(stage === "listener" ? 1 : 0);
        expect(process.exit).not.toHaveBeenCalled();
        opening.resolve();
        await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
        expect(process.exit).not.toHaveBeenCalled();
        drained.resolve();
        await vi.waitFor(() => expect(process.exit).toHaveBeenCalledExactlyOnceWith(0));
        expect(fixture.stopDiagnostics).toHaveBeenCalledOnce();
        expect(start).toHaveBeenCalledTimes(stage === "factory" ? 0 : 1);
      } finally {
        opening.resolve();
        drained.resolve();
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    },
  );

  it("does not force exit when partial construction cannot confirm shutdown", async () => {
    fixture.createHost.mockRejectedValue(
      new HeadlessCompositionShutdownError([new Error("synthetic construction cleanup failure")]),
    );
    runCli();
    await vi.waitFor(() => expect(fixture.stopDiagnostics).toHaveBeenCalledOnce());
    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("does not force exit when listener startup fails and runtime cleanup rejects", async () => {
    const dispose = vi.fn<() => Promise<void>>(async () => {
      throw new Error("synthetic unconfirmed supervisor drain");
    });
    fixture.createHost.mockResolvedValue({
      start: async () => {
        throw new Error("synthetic listener startup failure");
      },
      dispose,
    });
    runCli();
    await vi.waitFor(() => expect(fixture.stopDiagnostics).toHaveBeenCalledOnce());
    expect(dispose).toHaveBeenCalledOnce();
    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("waits for confirmed startup cleanup before reporting a fatal failure", async () => {
    const held = Promise.withResolvers<void>();
    const dispose = vi.fn<() => Promise<void>>(() => held.promise);
    fixture.createHost.mockResolvedValue({
      start: async () => {
        throw new Error("synthetic listener startup failure");
      },
      dispose,
    });
    try {
      runCli();
      await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
      expect(process.exit).not.toHaveBeenCalled();
      expect(fixture.stopDiagnostics).not.toHaveBeenCalled();
      held.resolve();
      await vi.waitFor(() => expect(process.exit).toHaveBeenCalledExactlyOnceWith(1));
      expect(fixture.stopDiagnostics).toHaveBeenCalledOnce();
    } finally {
      held.resolve();
    }
  });
});
