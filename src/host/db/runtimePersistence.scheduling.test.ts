import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execute = promisify(execFile);
let directory: string;
let fixture: string;

beforeAll(async () => {
  mkdirSync(resolve("tmp"), { recursive: true });
  directory = mkdtempSync(resolve("tmp/runtime-persistence-scheduling-"));
  fixture = join(directory, "fixture.cjs");
  await build({
    entryPoints: [
      fileURLToPath(new URL("./runtimePersistence.scheduling.fixture.ts", import.meta.url)),
    ],
    outfile: fixture,
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
    alias: { "@": resolve("src") },
  });
});
afterAll(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});

async function run(mode: "poll" | "exit") {
  const { stdout, stderr } = await execute(process.execPath, [fixture, mode], {
    timeout: 5_000,
    maxBuffer: 8_192,
  });
  expect(stderr).toBe("");
  return JSON.parse(stdout) as { writtenThreads: number; pendingEvents: number };
}

describe("runtime persistence continuation scheduling", () => {
  it("drains all accepted threads without periodic poll wake-ups", async () => {
    expect(await run("poll")).toEqual({ writtenThreads: 33, pendingEvents: 0 });
  });

  it("finishes accepted continuations and then permits an idle process to exit", async () => {
    expect(await run("exit")).toEqual({ writtenThreads: 33, pendingEvents: 0 });
  });
});
