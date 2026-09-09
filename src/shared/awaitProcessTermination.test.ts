import { spawn } from "node:child_process";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { awaitProcessTermination } from "./awaitProcessTermination";

describe("awaitProcessTermination", () => {
  it("waits for a SIGTERM-resistant worker to exit after escalation", async () => {
    const child = spawn(
      process.execPath,
      [
        "-e",
        "process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000)",
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    try {
      await once(child.stdout!, "data");
      await awaitProcessTermination(child, { graceMs: 100 });
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
      await expect(awaitProcessTermination(child)).resolves.toBeUndefined();
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  });

  it("does not wait a grace period when the process exits promptly", async () => {
    const child = spawn(
      process.execPath,
      ["-e", "process.stdout.write('ready'); setInterval(() => {}, 1000)"],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    try {
      await once(child.stdout!, "data");
      await awaitProcessTermination(child);
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  });
  it.runIf(process.platform !== "win32")(
    "terminates lingering descendants after their owned group leader exits",
    async () => {
      const script =
        "const {spawn}=require('node:child_process'); const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); c.unref(); console.log(c.pid);";
      const child = spawn(process.execPath, ["-e", script], {
        detached: true,
        stdio: ["ignore", "pipe", "ignore"],
      });
      let descendant = 0;
      try {
        const [data] = await once(child.stdout!, "data");
        descendant = Number(String(data).trim());
        await once(child, "exit");
        await awaitProcessTermination(child, { ownedProcessGroup: true, graceMs: 500 });
        expect(() => process.kill(-child.pid!, 0)).toThrow(/ESRCH/);
      } finally {
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {}
        try {
          if (descendant) process.kill(descendant, "SIGKILL");
        } catch {}
      }
    },
  );
});
