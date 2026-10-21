import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseServerCliCommand } from "./cliParse";
import { parseLogsCliOptions, readServerLogs, runServerLogs } from "./cliLogs";

let root: string;
let path: string;
const controllers: AbortController[] = [];
beforeEach(() => {
  root = mkdtempSync(join(process.cwd(), "tmp/cli-logs-test-"));
  path = join(root, "server.log");
});
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.abort();
  rmSync(root, { force: true, recursive: true });
});
function reader(args: string[] = []) {
  const controller = new AbortController();
  controllers.push(controller);
  return {
    controller,
    records: readServerLogs(path, parseLogsCliOptions(args), controller.signal),
  };
}
async function collect<T>(records: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const record of records) result.push(record);
  return result;
}

it.each([
  ["--lines", "0"],
  ["--lines", "1001"],
  ["--lines", "1.5"],
  ["--lines"],
  ["--follow", "--follow"],
  ["--log-file"],
  ["--log-file", "--json"],
  ["--unknown"],
  ["extra"],
])("refuses invalid arguments %j before accessing files", (...args) => {
  expect(() => parseLogsCliOptions(args)).toThrow("logs");
});
it("dispatches logs and command-specific help without serve flags", () => {
  expect(parseServerCliCommand(["logs", "--follow", "--lines", "3", "--json"])).toBe("logs");
  expect(parseServerCliCommand(["logs", "--help"])).toBe("help");
  expect(() => parseServerCliCommand(["logs", "--host", "127.0.0.1"])).toThrow("logs");
});
it("prints only the selected tail and redacts existing diagnostic credential patterns", async () => {
  writeFileSync(path, "old\nAuthorization: Bearer secret-value\nporacode://pair#private\nlast");
  const { records } = reader(["--lines", "3"]);
  expect(await collect(records)).toEqual([
    { kind: "line", text: "Authorization: Bearer [redacted]" },
    { kind: "line", text: "poracode://[redacted]" },
    { kind: "line", text: "last" },
  ]);
});
it("omits the leading partial tail instead of printing a possible credential fragment", async () => {
  writeFileSync(path, "x".repeat(70000) + "\nsafe\n");
  const { records } = reader();
  const result = await collect(records);
  expect(result).toEqual([
    { kind: "notice", text: expect.stringContaining("64 KiB") },
    { kind: "line", text: "safe" },
  ]);
});
it("holds partial lines and UTF-8 sequences until the complete line can be redacted", async () => {
  writeFileSync(path, "ready\nBearer ");
  const { records, controller } = reader(["--follow"]);
  expect((await records.next()).value).toEqual({ kind: "line", text: "ready" });
  const next = records.next();
  appendFileSync(path, Buffer.from([0xe2, 0x82]));
  await new Promise((resolve) => setTimeout(resolve, 300));
  appendFileSync(path, Buffer.from([0xac, 0x0a]));
  expect((await next).value).toEqual({ kind: "line", text: "Bearer [redacted]" });
  controller.abort();
  expect((await records.next()).done).toBe(true);
});
it("follows replacement and truncation without retaining the old file handle", async () => {
  writeFileSync(path, "original long line\n");
  const { records, controller } = reader(["--follow"]);
  expect((await records.next()).value?.text).toBe("original long line");
  renameSync(path, path + ".1");
  writeFileSync(path, "replacement\n");
  expect((await records.next()).value?.kind).toBe("notice");
  expect((await records.next()).value?.text).toBe("replacement");
  writeFileSync(path, "new\n");
  expect((await records.next()).value?.kind).toBe("notice");
  expect((await records.next()).value?.text).toBe("new");
  controller.abort();
  await records.next();
});
it("bounds incomplete lines and discards their entire remainder before resuming", async () => {
  writeFileSync(path, "ready\n");
  const { records, controller } = reader(["--follow"]);
  await records.next();
  appendFileSync(path, "q".repeat(70000));
  expect((await records.next()).value).toEqual({
    kind: "notice",
    text: expect.stringContaining("overlong"),
  });
  appendFileSync(path, "hidden-end\nsafe\n");
  expect((await records.next()).value).toEqual({ kind: "line", text: "safe" });
  controller.abort();
  await records.next();
});
it("also omits an oversized line completed in the next bounded read", async () => {
  writeFileSync(path, "ready\n");
  const { records, controller } = reader(["--follow"]);
  await records.next();
  appendFileSync(path, "x".repeat(65530));
  const next = records.next();
  await new Promise((resolve) => setTimeout(resolve, 300));
  appendFileSync(path, "end-of-secret\nsafe\n");
  expect((await next).value?.kind).toBe("notice");
  expect((await records.next()).value?.text).toBe("safe");
  controller.abort();
  await records.next();
});
it("missing snapshots fail actionably; follow waits without creating any root", async () => {
  await expect(collect(reader().records)).rejects.toThrow("same --base-dir");
  const { records, controller } = reader(["--follow"]);
  expect((await records.next()).value?.text).toContain("No server was started");
  expect(existsSync(path)).toBe(false);
  writeFileSync(path, "created later\n");
  expect((await records.next()).value?.text).toBe("created later");
  controller.abort();
  await records.next();
});
it("refuses a directory and a symlink instead of following a different file", async () => {
  mkdirSync(path);
  await expect(collect(reader().records)).rejects.toThrow("regular file");
  rmSync(path, { recursive: true });
  // Directory junctions do not need Windows symlink privilege and are also refused.
  symlinkSync(root, path, "junction");
  await expect(collect(reader().records)).rejects.toThrow("regular file");
});

describe("active output and signal lifetime", () => {
  it("escapes terminal controls; structured output is versioned NDJSON", async () => {
    writeFileSync(path, "visible\u001b[31m\n");
    let text = "";
    const output = new Writable({
      write(chunk, _encoding, callback) {
        text += chunk;
        callback();
      },
    });
    await runServerLogs(root, parseLogsCliOptions(["--log-file", path]), output);
    expect(text).toBe("visible\\u001b[31m\n");
    text = "";
    await runServerLogs(root, parseLogsCliOptions(["--log-file", path, "--json"]), output);
    expect(JSON.parse(text)).toEqual({
      formatVersion: 1,
      view: "local-log",
      kind: "line",
      text: "visible\u001b[31m",
    });
  });
  it.each(["SIGINT", "SIGTERM"] as const)(
    "%s exits a waiting follower and restores listeners",
    async (signal) => {
      const before = process.listenerCount(signal);
      let started!: () => void;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      const output = new Writable({
        write(_chunk, _encoding, callback) {
          callback();
          started();
        },
      });
      const operation = runServerLogs(
        root,
        parseLogsCliOptions(["--log-file", path, "--follow"]),
        output,
      );
      await ready;
      process.emit(signal);
      await operation;
      expect(process.listenerCount(signal)).toBe(before);
      expect(output.listenerCount("error")).toBe(0);
    },
  );
  it("joins callback and asynchronous stream errors before removing active listeners", async () => {
    writeFileSync(path, "line\n");
    const error = new Error("controlled output failure");
    const before = process.listenerCount("SIGINT");
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        callback(error);
      },
    });
    await expect(
      runServerLogs(root, parseLogsCliOptions(["--log-file", path, "--follow"]), output),
    ).rejects.toBe(error);
    expect(output.listenerCount("error")).toBe(0);
    expect(process.listenerCount("SIGINT")).toBe(before);
    renameSync(path, path + ".retired");
  });
  it("an output error while following a missing file cancels the wait and is retained", async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
        started();
      },
    });
    const operation = runServerLogs(
      root,
      parseLogsCliOptions(["--log-file", path, "--follow"]),
      output,
    );
    await ready;
    output.emit("error", new Error("fixture idle error"));
    await expect(operation).rejects.toThrow("fixture idle error");
    expect(output.listenerCount("error")).toBe(0);
  });
  it("keeps stream custody until an admitted write callback joins after interrupt", async () => {
    writeFileSync(path, "ready\n");
    let finish!: (error?: Error | null) => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        finish = callback;
        started();
      },
    });
    let settled = false;
    const operation = runServerLogs(
      root,
      parseLogsCliOptions(["--log-file", path, "--follow"]),
      output,
    ).finally(() => {
      settled = true;
    });
    await ready;
    process.emit("SIGINT");
    await new Promise((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    expect(output.listenerCount("error")).toBe(1);
    finish();
    await operation;
    expect(output.listenerCount("error")).toBe(0);
  });
});
