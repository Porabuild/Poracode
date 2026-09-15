import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const spawn = vi.hoisted(() => vi.fn<() => EventEmitter>());
const terminate = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock("node:child_process", () => ({ spawn }));
vi.mock("@/shared/awaitProcessTermination", () => ({ awaitProcessTermination: terminate }));

import { PiRpcClient } from "./rpcClient";

function createClient() {
  const child = Object.assign(new EventEmitter(), {
    pid: 12345,
    exitCode: null,
    signalCode: null,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  });
  spawn.mockReturnValue(child);
  const client = PiRpcClient.spawn({ command: "fixture", args: [] });
  child.emit("spawn");
  return { client, child };
}

beforeEach(() => {
  vi.clearAllMocks();
  terminate.mockResolvedValue(undefined);
});

describe("PiRpcClient shutdown", () => {
  it("shares close completion and waits for confirmed exit", async () => {
    let finish!: () => void;
    terminate.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { client, child } = createClient();
    const first = client.close();
    expect(client.close()).toBe(first);
    const onExit = vi.fn<() => void>();
    client.onExit(onExit);
    expect(onExit).not.toHaveBeenCalled();
    expect(terminate).toHaveBeenCalledExactlyOnceWith(child, {
      ownedProcessGroup: process.platform !== "win32",
    });
    child.emit("exit", 0, null);
    finish();
    await first;
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("retries failed shutdown while continuing to reject new requests", async () => {
    const { client } = createClient();
    terminate.mockRejectedValueOnce(new Error("Process still alive"));
    await expect(client.close()).rejects.toThrow("Process still alive");
    await expect(client.request("prompt")).rejects.toThrow("closed");
    await client.close();
    expect(terminate).toHaveBeenCalledTimes(2);
  });
});
