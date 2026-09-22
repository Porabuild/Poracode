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
