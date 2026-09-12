import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const terminate = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock("@/shared/awaitProcessTermination", () => ({ awaitProcessTermination: terminate }));

import {
  CursorSdkWorkerClient,
  CursorSdkWorkerStartupError,
  spawnCursorSdkWorker,
} from "./sdkWorkerClient";
import { CURSOR_SDK_WORKER_PROTOCOL_VERSION } from "./sdkWorkerProtocol";

function createClient(acknowledgeDispose = true) {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null,
    signalCode: null,
  });
  const requests: string[] = [];
  child.stdin.on("data", (chunk: Buffer) => {
    const request = JSON.parse(chunk.toString()) as { id: string; method: string };
    requests.push(request.method);
    if (acknowledgeDispose) {
      child.stdout.write(JSON.stringify({ type: "response", id: request.id, ok: true }) + "\n");
    }
  });
  const client = new CursorSdkWorkerClient(
    child as unknown as ChildProcess,
    {},
    "/fixture",
    60_000,
    true,
  );
  child.stdout.write(
    JSON.stringify({ type: "ready", protocolVersion: CURSOR_SDK_WORKER_PROTOCOL_VERSION }) + "\n",
  );
  return { child, client, requests };
}

beforeEach(() => {
  vi.clearAllMocks();
  terminate.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe("Cursor SDK worker shutdown", () => {
  it("preserves a boot failure and exposes its worker when startup cleanup fails", async () => {
    vi.useFakeTimers();
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      exitCode: null,
      signalCode: null,
    }) as unknown as ChildProcess;
    const cleanupError = new Error("Worker still alive");
    terminate.mockRejectedValueOnce(cleanupError);
    const spawned = spawnCursorSdkWorker(
      {
        projectLocation: { kind: "posix", path: "/fixture" },
        workerPath: fileURLToPath(import.meta.url),
        bootTimeoutMs: 10,
      },
      { spawnProcess: () => child },
    );
    const failed = spawned.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10);
    const error = await failed;
    expect(error).toBeInstanceOf(CursorSdkWorkerStartupError);
    if (!(error instanceof CursorSdkWorkerStartupError)) throw new Error("Missing startup error");
    expect(error.message).toBe("Cursor SDK worker boot timed out.");
    expect((error.cause as AggregateError).errors).toEqual([
      expect.objectContaining({ message: "Cursor SDK worker boot timed out." }),
      cleanupError,
    ]);
    await error.worker.dispose();
    expect(terminate).toHaveBeenCalledTimes(2);
  });

  it("shares disposal and waits for exit after the RPC acknowledgement", async () => {
    let finish!: () => void;
    terminate.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { child, client, requests } = createClient();
    const first = client.dispose();
    expect(client.dispose()).toBe(first);
    await Promise.resolve();
    expect(requests).toEqual(["dispose"]);
    expect(terminate).toHaveBeenCalledExactlyOnceWith(child, { ownedProcessGroup: true });
    let complete = false;
    void first.then(() => {
      complete = true;
    });
    await Promise.resolve();
    expect(complete).toBe(false);
    finish();
    await first;
  });

  it("bounds a stalled graceful RPC before waiting for forced termination", async () => {
    vi.useFakeTimers();
    const { client } = createClient(false);
    const disposed = client.dispose();
    await vi.advanceTimersByTimeAsync(2_999);
    expect(terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await disposed;
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("retries termination failure even after the transport is marked terminated", async () => {
    const { client, requests } = createClient();
    terminate.mockRejectedValueOnce(new Error("Worker still alive"));
    await expect(client.dispose()).rejects.toThrow("Worker still alive");
    await client.dispose();
    expect(terminate).toHaveBeenCalledTimes(2);
    expect(requests).toEqual(["dispose"]);
  });
});
