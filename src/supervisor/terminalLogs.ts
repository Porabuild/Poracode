import { mkdirSync, rmSync, writeFileSync } from "node:fs";

export function resetTerminalLogsDir(logsDir: string): void {
  rmSync(logsDir, { recursive: true, force: true });
  mkdirSync(logsDir, { recursive: true });
}

export function resetTerminalLogFile(logPath: string): void {
  writeFileSync(logPath, "");
}
