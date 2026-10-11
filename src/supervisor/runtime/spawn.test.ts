import { describe, expect, it } from "vitest";
import { spawnAndAwaitExit } from "./spawn";

const sleeper = "setTimeout(() => process.exit(0), 30_000);";

describe("spawnAndAwaitExit", () => {
  it("resolves when the child exits 0", async () => {
    await expect(
      spawnAndAwaitExit(process.execPath, ["-e", "process.exit(0)"], { timeoutMs: 5_000 }),
    ).resolves.toBeUndefined();
  });

  it("kills and joins the child on timeout instead of leaving it running", async () => {
    const pidFile = `${process.env.TMPDIR ?? "/tmp"}/poracode-spawn-timeout-${process.pid}.txt`;
    const script = `require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); ${sleeper}`;
    const started = Date.now();
    const pending = spawnAndAwaitExit(process.execPath, ["-e", script], {
      timeoutMs: 300,
      label: "test sleeper",
    });

    await expect(pending).rejects.toThrow(/test sleeper timed out after 300ms/);
    expect(Date.now() - started).toBeLessThan(5_000);

    const { readFileSync, rmSync } = await import("node:fs");
    const pid = Number(readFileSync(pidFile, "utf8"));
    rmSync(pidFile, { force: true });
    expect(() => process.kill(pid, 0)).toThrow(/ESRCH|no such process/u);
  });

  it("kills and joins the child when the caller aborts", async () => {
    const controller = new AbortController();
    const pending = spawnAndAwaitExit(process.execPath, ["-e", sleeper], {
      signal: controller.signal,
      label: "abortable sleeper",
    });
    controller.abort(new Error("caller cancelled"));
    await expect(pending).rejects.toThrow("caller cancelled");
  });

  it("escalates to SIGKILL and joins when the child ignores SIGTERM", async () => {
    const pidFile = `${process.env.TMPDIR ?? "/tmp"}/poracode-spawn-stubborn-${process.pid}.txt`;
    const script = [
      `require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid))`,
      'process.on("SIGTERM", () => {})',
      "setInterval(() => {}, 1000)",
    ].join("; ");
    const started = Date.now();
    const pending = spawnAndAwaitExit(process.execPath, ["-e", script], {
      timeoutMs: 200,
      label: "stubborn extraction",
      terminateGraceMs: 150,
      reapTimeoutMs: 3_000,
    });

    await expect(pending).rejects.toThrow(/stubborn extraction timed out after 200ms/);
    expect(Date.now() - started).toBeLessThan(5_000);

    const { readFileSync, rmSync } = await import("node:fs");
    const pid = Number(readFileSync(pidFile, "utf8"));
    rmSync(pidFile, { force: true });
    expect(() => process.kill(pid, 0)).toThrow(/ESRCH|no such process/u);
  });

  it("escalates to SIGKILL when an aborted child ignores SIGTERM", async () => {
    const controller = new AbortController();
    const script = 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);';
    const pending = spawnAndAwaitExit(process.execPath, ["-e", script], {
      signal: controller.signal,
      label: "stubborn abort",
      terminateGraceMs: 150,
      reapTimeoutMs: 3_000,
    });
    controller.abort(new Error("caller cancelled"));
    await expect(pending).rejects.toThrow("caller cancelled");
  });
});

describe("runtime probe output bounds", () => {
  it("retains the diagnostic tail without retaining an unbounded stderr transcript", async () => {
    const pending = spawnAndAwaitExit(process.execPath, [
      "-e",
      'process.stderr.write("x".repeat(200000)+"final diagnostic",()=>process.exit(1));',
    ]);
    const error = await pending.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message.endsWith("final diagnostic")).toBe(true);
    expect((error as Error).message.length).toBeLessThan(66000);
  });
});

it.skipIf(process.platform === "win32")(
  "cancels the owned POSIX group including an inheriting probe child",
  async () => {
    let ready!: () => void;
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const controller = new AbortController();
    let pids: number[] = [];
    const script =
      'const c=require("node:child_process").spawn(process.execPath,["-e","setTimeout(()=>process.exit(0),5000);setInterval(()=>{},1000)"],{stdio:"ignore"});console.log(JSON.stringify([process.pid,c.pid]));setInterval(()=>{},1000);';
    const pending = spawnAndAwaitExit(process.execPath, ["-e", script], {
      signal: controller.signal,
      timeoutMs: 5000,
      onStdout: (chunk) => {
        pids = JSON.parse(chunk.toString());
        ready();
      },
    });
    const handled = pending.catch((error: unknown) => error);
    await started;
    controller.abort();
    expect(await handled).toMatchObject({ name: "AbortError" });
    expect(pids).toHaveLength(2);
    for (let read = 0; read < 8; read++) {
      if (
        pids.every((pid) => {
          try {
            process.kill(pid, 0);
            return false;
          } catch {
            return true;
          }
        })
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    for (const pid of pids) expect(() => process.kill(pid, 0)).toThrow(/ESRCH|no such process/u);
  },
);
