import { describe, expect, it } from "vitest";
import { terminateProcessTree } from "@/shared/processTree";
import { parsePrimedEnvDump, readCommandOutputAsync } from "./processRuntime";

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("parsePrimedEnvDump", () => {
  it("parses simple NAME=value lines", () => {
    expect(parsePrimedEnvDump(["FOO=bar", "BAZ=qux"])).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("does not append the trailing newline of the env dump to the last variable", () => {
    // `env` output ends with "\n", so splitting produces a trailing "" line.
    // Regression: the last var picked up a trailing "\n" (GH_HOST="github.com\n"
    // broke gh's URL building in every spawned process).
    expect(parsePrimedEnvDump(["GH_CONFIG_DIR=/x", "GH_HOST=github.com", ""])).toEqual({
      GH_CONFIG_DIR: "/x",
      GH_HOST: "github.com",
    });
  });

  it("still joins genuine multiline values, dropping only trailing empties", () => {
    expect(parsePrimedEnvDump(["MULTI=first", "second", "", "third", "SINGLE=x", "", ""])).toEqual({
      MULTI: "first\nsecond\n\nthird",
      SINGLE: "x",
    });
  });

  it("returns an empty record for an all-empty dump", () => {
    expect(parsePrimedEnvDump(["", ""])).toEqual({});
  });
});

describe("readCommandOutputAsync", () => {
  it("kills a successful POSIX command's remaining process group", async () => {
    if (process.platform === "win32") return;

    const script = [
      'const { spawn } = require("node:child_process");',
      'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });',
      "child.unref();",
      "process.stdout.write(String(child.pid));",
    ].join("\n");
    const result = await readCommandOutputAsync(process.execPath, ["-e", script]);
    const descendantPid = Number(result.stdout);

    try {
      expect(result.ok).toBe(true);
      expect(Number.isInteger(descendantPid)).toBe(true);
      await expect.poll(() => isProcessRunning(descendantPid), { timeout: 3_000 }).toBe(false);
    } finally {
      terminateProcessTree(descendantPid);
    }
  }, 10_000);

  it("kills a timed-out Windows command's descendant process", async () => {
    if (process.platform !== "win32") return;

    const script = [
      'const { spawn } = require("node:child_process");',
      'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });',
      "process.stdout.write(String(child.pid));",
      "setInterval(() => {}, 1000);",
    ].join("\n");
    const result = await readCommandOutputAsync(process.execPath, ["-e", script], {
      timeout: 500,
    });
    const descendantPid = Number(result.stdout);

    try {
      expect(result.ok).toBe(false);
      expect(Number.isInteger(descendantPid)).toBe(true);
      await expect.poll(() => isProcessRunning(descendantPid), { timeout: 3_000 }).toBe(false);
    } finally {
      terminateProcessTree(descendantPid);
    }
  }, 10_000);
});
