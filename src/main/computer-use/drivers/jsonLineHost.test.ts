import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { HostUnavailableError, JsonLineActionError, PersistentJsonLineHost } from "./jsonLineHost";

const fixturePath = fileURLToPath(new URL("./__fixtures__/fakeHelper.cjs", import.meta.url));
const hosts: PersistentJsonLineHost[] = [];

function createHost(options: { maxBytes?: number; timeoutMs?: number } = {}) {
  const host = new PersistentJsonLineHost({
    label: "fixture host",
    maxStdoutBufferBytes: options.maxBytes ?? 1024 * 1024,
    requestTimeoutMs: options.timeoutMs ?? 1_000,
    spawn: () => spawn(process.execPath, [fixturePath]),
  });
  hosts.push(host);
  return host;
}

afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose();
});

describe("PersistentJsonLineHost", () => {
  it("matches out-of-order responses by request id and ignores stdout noise", async () => {
    const host = createHost();
    const slow = host.request("echo", { value: "slow", delay: 40 });
    const fast = host.request("echo", { value: "fast", delay: 1 });

    await expect(fast).resolves.toBe("fast");
    await expect(slow).resolves.toBe("slow");
    await expect(host.request("noise")).resolves.toBe("after noise");
  });

  it("preserves action error codes", async () => {
    const host = createHost();
    const error = await host.request("fail").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(JsonLineActionError);
    expect(error).toMatchObject({ message: "fixture failure", code: "fixture_code" });
  });

  it("recycles the child after a timeout", async () => {
    const host = createHost({ timeoutMs: 1_000 });
    await expect(host.request("hang")).rejects.toMatchObject({ code: "timeout" });
    await expect(host.request("echo", { value: "restarted" })).resolves.toBe("restarted");
  });

  it("rejects an oversized unterminated response", async () => {
    const host = createHost({ maxBytes: 32 });
    await expect(host.request("oversized", { bytes: 128 })).rejects.toMatchObject({
      code: "buffer_overflow",
    });
  });

  it("handles a helper closing stdin without an uncaught stream error", async () => {
    let child: ChildProcessWithoutNullStreams | undefined;
    const host = new PersistentJsonLineHost({
      label: "fixture host",
      maxStdoutBufferBytes: 1024 * 1024,
      requestTimeoutMs: 1_000,
      spawn: () => {
        child = spawn(process.execPath, [fixturePath]);
        return child;
      },
    });
    hosts.push(host);

    const request = host.request("hang");
    child?.stdin.emit("error", new Error("write EPIPE"));
    await expect(request).rejects.toMatchObject({
      code: "exited",
    });
    await expect(host.request("echo", { value: "restarted" })).resolves.toBe("restarted");
  });

  it("reports spawn failures with a stable code", async () => {
    const host = new PersistentJsonLineHost({
      label: "missing host",
      maxStdoutBufferBytes: 1024,
      spawn: () => spawn("this-executable-does-not-exist-poracode"),
    });
    hosts.push(host);

    await expect(host.request("echo")).rejects.toEqual(
      expect.objectContaining<Partial<HostUnavailableError>>({ code: "spawn_failed" }),
    );
  });
});
