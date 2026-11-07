import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { setImmediate as nextTurn, setTimeout as delay } from "node:timers/promises";
import type { Writable } from "node:stream";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { terminalText } from "./cliPrompts";
import { redactDiagnosticLine, RECENT_ERRORS_MAX_BYTES } from "./serverDoctorIo";
import { serverLogFilePath } from "./serverLogFile";

export const CLI_LOGS_FORMAT_VERSION = 1;
export const CLI_LOGS_HELP =
  "  logs [--follow] [--lines 1..1000] [--log-file PATH] [--json]\n" +
  "    Read the selected profile's local server.log without starting or contacting an owner. Default: last 100 lines within 64 KiB.\n" +
  "    --follow waits for new complete lines and follows replacement/truncation; Ctrl+C/SIGTERM exits cleanly.\n" +
  "    --log-file explicitly selects a different local regular file. Symlink files are refused.\n" +
  "    Output uses diagnostic redaction; arbitrary secrets in application prose may remain. Review before sharing.\n" +
  "    --json emits newline-delimited {formatVersion:1,view:'local-log',kind:'line'|'notice',text:string}.\n" +
  "    Reading/output failures exit nonzero and report on stderr, including when --json is selected.\n" +
  "    Partial tail/overlong lines are omitted with a notice; this is a bounded diagnostic view, not a complete log export.\n";

export function parseLogsCliOptions(args: readonly string[]) {
  let follow = false;
  let json = false;
  let lines = 100;
  let logFile: string | undefined;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (seen.has(argument)) throw new Error(CLI_LOGS_HELP);
    seen.add(argument);
    if (argument === "--follow") follow = true;
    else if (argument === "--json") json = true;
    else if (argument === "--lines") {
      const value = args[++index];
      if (!value || !/^[1-9]\d{0,3}$/u.test(value) || Number(value) > 1000)
        throw new Error(CLI_LOGS_HELP);
      lines = Number(value);
    } else if (argument === "--log-file") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(CLI_LOGS_HELP);
      logFile = resolve(value);
    } else throw new Error(CLI_LOGS_HELP);
  }
  return { follow, json, lines, ...(logFile ? { logFile } : {}) };
}

type LogRecord = { kind: "line" | "notice"; text: string };
type LogsOptions = ReturnType<typeof parseLogsCliOptions>;

/** Each file read and unfinished line is bounded; no host/database authority is acquired. */
export async function* readServerLogs(
  path: string,
  options: LogsOptions,
  signal: AbortSignal,
): AsyncGenerator<LogRecord> {
  let identity: string | undefined;
  let position = 0;
  let decoder = new StringDecoder("utf8");
  let pending = "";
  let discarding = false;
  let missing = false;
  let first = true;
  while (!signal.aborted) {
    let file;
    let caughtUp = true;
    const records: LogRecord[] = [];
    try {
      const link = await lstat(path);
      if (!link.isFile())
        throw new Error("Log input must be a regular file, not a symlink or directory.");
      file = await open(
        path,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | constants.O_NONBLOCK,
      );
      const stat = await file.stat();
      if (!stat.isFile() || stat.dev !== link.dev || stat.ino !== link.ino)
        throw new Error("Log input changed during opening. Retry logs with the same profile.");
      const currentIdentity = `${stat.dev}:${stat.ino}`;
      const reset = identity !== currentIdentity || stat.size < position;
      if (reset) {
        if (!first)
          records.push({
            kind: "notice",
            text: "Log replaced or truncated; reading the new file.",
          });
        identity = currentIdentity;
        decoder = new StringDecoder("utf8");
        pending = "";
        discarding = false;
        position = first ? Math.max(0, stat.size - RECENT_ERRORS_MAX_BYTES) : 0;
      }
      missing = false;
      const buffer = Buffer.allocUnsafe(Math.min(RECENT_ERRORS_MAX_BYTES, stat.size - position));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, position);
      const startedMidLine = first && position > 0;
      position += bytesRead;
      caughtUp = position >= stat.size;
      let text = decoder.write(buffer.subarray(0, bytesRead));
      if (startedMidLine) {
        // The bounded tail may start in a credential or UTF-8 sequence. Never print that fragment.
        const end = text.indexOf("\n");
        discarding = end < 0;
        text = end < 0 ? "" : text.slice(end + 1);
        records.push({
          kind: "notice",
          text: "Older log bytes and the leading partial line were omitted (64 KiB limit).",
        });
      }
      if (!options.follow) text += decoder.end();
      const parts = (pending + text).split("\n");
      pending = parts.pop()!;
      const complete = options.follow ? parts : [...parts, ...(pending ? [pending] : [])];
      for (const line of first ? complete.slice(-options.lines) : complete) {
        if (discarding) {
          discarding = false;
          continue;
        }
        if (Buffer.byteLength(line, "utf8") > RECENT_ERRORS_MAX_BYTES) {
          records.push({
            kind: "notice",
            text: "An overlong log line was omitted (64 KiB limit).",
          });
          continue;
        }
        records.push({ kind: "line", text: redactDiagnosticLine(line.replace(/\r$/u, "")) });
      }
      if (Buffer.byteLength(pending, "utf8") > RECENT_ERRORS_MAX_BYTES) {
        discarding = true;
        records.push({ kind: "notice", text: "An overlong log line was omitted (64 KiB limit)." });
      }
      if (discarding) pending = "";
      first = false;
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT")
        throw error;
      if (!options.follow)
        throw new Error(
          "No server log found. Use the same --base-dir as serve, or select --log-file PATH.",
          { cause: error },
        );
      if (!missing)
        records.push({
          kind: "notice",
          text: "Waiting for the local log file. No server was started.",
        });
      missing = true;
    } finally {
      await file?.close();
    }
    for (const record of records) {
      if (signal.aborted) return;
      yield record;
    }
    if (!options.follow) return;
    if (caughtUp) {
      try {
        await delay(250, undefined, { signal });
      } catch (error) {
        if (!signal.aborted) throw error;
      }
    }
  }
}

export async function runServerLogs(
  profileNamespace: string,
  options: LogsOptions,
  output: Writable = process.stdout,
) {
  const path =
    options.logFile ?? serverLogFilePath(resolveHostRootPaths(profileNamespace).dataRoot);
  const controller = new AbortController();
  let streamError: Error | undefined;
  const interrupt = () => controller.abort();
  const fail = (error: Error) => {
    streamError ??= error;
    controller.abort();
  };
  output.on("error", fail);
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    for await (const record of readServerLogs(path, options, controller.signal)) {
      const text = options.json
        ? JSON.stringify({ formatVersion: CLI_LOGS_FORMAT_VERSION, view: "local-log", ...record })
        : `${record.kind === "notice" ? "[logs] " : ""}${terminalText(record.text)}`;
      await new Promise<void>((accept, reject) => {
        output.write(text + "\n", (error) => {
          if (error) {
            fail(error);
            reject(error);
          } else accept();
        });
      });
    }
  } finally {
    // A write callback can run before its stream's error event; keep the listener through that join.
    await nextTurn();
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    output.off("error", fail);
  }
  if (streamError) throw streamError;
}
