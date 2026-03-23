import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { resetTerminalLogFile, resetTerminalLogsDir } from "./terminalLogs";

describe("resetTerminalLogsDir", () => {
  it("removes existing terminal history files and recreates the directory", () => {
    const logsDir = join(mkdtempSync(join(tmpdir(), "lightcode-terminal-logs-")), "logs");
    mkdirSync(logsDir, { recursive: true });
    writeFileSync(join(logsDir, "thread-a.log"), "old output");

    resetTerminalLogsDir(logsDir);

    expect(existsSync(logsDir)).toBe(true);
    expect(existsSync(join(logsDir, "thread-a.log"))).toBe(false);
  });
});

describe("resetTerminalLogFile", () => {
  it("truncates a thread log before a fresh PTY launch", () => {
    const logsDir = mkdtempSync(join(tmpdir(), "lightcode-terminal-log-file-"));
    const logPath = join(logsDir, "thread-a.log");
    writeFileSync(logPath, "old output");

    resetTerminalLogFile(logPath);

    expect(readFileSync(logPath, "utf8")).toBe("");
  });
});
