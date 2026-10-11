import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { PersistentJsonLineHost } from "./jsonLineHost";

const hosts: PersistentJsonLineHost[] = [];

function fixture() {
  const children: ChildProcessWithoutNullStreams[] = [];
  const host = new PersistentJsonLineHost({
    label: "synthetic retiring helper",
    maxStdoutBufferBytes: 4_096,
    stopOptions: { graceMs: 300 },
    spawn: () => {
      const child = spawn(process.execPath, [
        "-e",
        String.raw`
        process.on('SIGTERM', () => setTimeout(() => process.exit(0), 80));
        require('node:readline').createInterface({input:process.stdin}).on('line', line => {
          const r=JSON.parse(line);
          setTimeout(() => process.stdout.write(JSON.stringify({id:r.id,ok:true,result:r.input.value})+'\n'), r.input.delay ?? 0);
        });
      `,
      ]);
      children.push(child);
      return child;
    },
  });
  hosts.push(host);
  return { host, children };
}

afterEach(async () => {
  for (const host of hosts.splice(0)) await host.close();
});

describe("permanent JSON-line host close", () => {
  it("joins every retired generation and permanently refuses another spawn", async () => {
    const { host, children } = fixture();
    await host.request("echo", { value: "first" });
    host.dispose();
    await expect(host.request("echo", { value: "second" })).resolves.toBe("second");
    const closing = host.close();
    expect(host.close()).toBe(closing);
    await expect(host.request("echo")).rejects.toThrow("closed");
    await closing;
    expect(children).toHaveLength(2);
    for (const child of children) {
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
      expect(child.stdout.destroyed).toBe(true);
      expect(child.stderr.destroyed).toBe(true);
    }
    host.dispose();
    await expect(host.request("echo")).rejects.toThrow("closed");
    expect(children).toHaveLength(2);
  });

  it("rejects active work on close and ignores a retiring generation's late events", async () => {
    const { host, children } = fixture();
    await host.request("echo", { value: "first" });
    host.dispose();
    const current = host.request("echo", { value: "current", delay: 30 });
    children[0]!.stdin.emit("error", new Error("synthetic retiring EPIPE"));
    children[0]!.emit("error", new Error("synthetic retiring child error"));
    await expect(current).resolves.toBe("current");
    const pending = host.request("echo", { delay: 500 }).catch((error: unknown) => error);
    await host.close();
    expect(await pending).toMatchObject({ code: "exited" });
  });
});
