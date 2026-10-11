import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseLogLevel, serverLogFilePath, startServerLogFile } from "./serverLogFile";

describe("server log file", () => {
  let directory: string;

  afterEach(() => {
    vi.restoreAllMocks();
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
    directory = undefined as unknown as string;
  });

  function freshDirectory(): string {
    directory = mkdtempSync(join(tmpdir(), "poracode-server-log-"));
    return directory;
  }

  function readLines(name = "server.log"): Array<Record<string, unknown>> {
    return readFileSync(join(directory, name), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }

  it("mirrors console output as leveled JSONL while stdout keeps working", () => {
    const dir = freshDirectory();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const sink = startServerLogFile({ path: join(dir, "logs", "server.log"), env: {} });
    console.log("[poracode-server] plain info");
    console.warn("[poracode-server] careful", 42);
    console.error("[poracode-server] broken", new Error("boom"));
    sink.stop();

    const entries = readLines(join("logs", "server.log"));
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ level: "info", msg: "[poracode-server] plain info" });
    expect(entries[1]).toMatchObject({
      level: "warn",
      msg: "[poracode-server] careful",
      args: [42],
    });
    expect(entries[2]).toMatchObject({ level: "error", msg: "[poracode-server] broken" });
    const errorArg = entries[2]!.args as Array<{ name: string; message: string }>;
    expect(errorArg[0]).toMatchObject({ name: "Error", message: "boom" });
    for (const entry of entries) expect(typeof entry.ts).toBe("string");
  });

  it("honors the level filter and the PORACODE_LOG_LEVEL environment variable", () => {
    const dir = freshDirectory();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const sink = startServerLogFile({
      path: join(dir, "server.log"),
      env: { PORACODE_LOG_LEVEL: "warn" },
    });
    expect(sink.level).toBe("warn");
    console.log("not captured");
    console.error("captured");
    sink.stop();

    expect(readLines()).toHaveLength(1);
    expect(readLines()[0]).toMatchObject({ level: "error", msg: "captured" });
  });

  it("rotates by size and keeps at most maxFiles rotated generations", () => {
    const dir = freshDirectory();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    // 64 KiB floor per config schema; each entry is ~575 bytes, so ~115 fill
    // one generation. 600 entries produce 5 rotations; maxFiles=3 keeps the
    // three newest generations and drops the rest.
    const sink = startServerLogFile({
      path: join(dir, "server.log"),
      env: {},
      maxBytes: 64 * 1024,
      maxFiles: 3,
    });
    const filler = "x".repeat(512);
    for (let index = 0; index < 600; index += 1) console.log(`entry-${index} ${filler}`);
    sink.stop();

    // Five rotations happened; with maxFiles=3 the three newest generations
    // remain and older ones are dropped.
    expect(existsSync(join(dir, "server.log.3"))).toBe(true);
    expect(existsSync(join(dir, "server.log.4"))).toBe(false);
    const live = readLines();
    const kept = [
      ...readLines("server.log.3"),
      ...readLines("server.log.2"),
      ...readLines("server.log.1"),
      ...live,
    ];
    expect(kept.length).toBeLessThanOrEqual(600);
    // The newest entry survives in the live file.
    expect(live.some((entry) => String(entry.msg).startsWith("entry-599 "))).toBe(true);
  });

  it("restores the previous console hooks on stop", () => {
    const dir = freshDirectory();
    const log = console.log;
    const sink = startServerLogFile({ path: join(dir, "server.log"), env: {} });
    expect(console.log).not.toBe(log);
    sink.stop();
    expect(console.log).toBe(log);
  });

  it("builds the default path under the owned data root", () => {
    expect(serverLogFilePath("/data/root")).toBe(join("/data/root", "logs", "server.log"));
  });

  it("parses documented level names and nothing else", () => {
    expect(parseLogLevel("DEBUG")).toBe("debug");
    expect(parseLogLevel(" error ")).toBe("error");
    expect(parseLogLevel("loud")).toBeUndefined();
    expect(parseLogLevel(undefined)).toBeUndefined();
  });
});
