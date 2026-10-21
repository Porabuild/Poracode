import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_EXPORT_CHUNK_BYTES } from "@/shared/contracts/sessionExport";
import type { HostAdminCommand } from "@/shared/hostAdminProtocol";
import { cliCommandHelp } from "./cliHelp";
import { parseSessionExportCli, runSessionExportCli } from "./cliSessionExport";

const directories: string[] = [];
async function directory() {
  await mkdir("tmp", { recursive: true });
  const path = await mkdtemp(resolve("tmp/cli-session-export-test-"));
  directories.push(path);
  return path;
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});
function fixture(data = Buffer.from(JSON.stringify({ message: "Hello 🧪 Привет 你好" }))) {
  const exportId = randomUUID();
  const metadata = { exportId, threadId: "thread", formatVersion: 1, scope: "persisted-thread" };
  const request = vi.fn<(command: HostAdminCommand, signal?: AbortSignal) => Promise<unknown>>(
    async (command, _signal) => {
      switch (command.action) {
        case "sessions-export-start":
          return {
            ...metadata,
            format: "poracode-session-json",
            chunkBytes: SESSION_EXPORT_CHUNK_BYTES,
            expiresAt: Date.now() + 600_000,
          };
        case "sessions-export-cancel":
          return { ...metadata, closed: true };
        case "sessions-export-read": {
          const end = Math.min(data.length, command.offset + SESSION_EXPORT_CHUNK_BYTES);
          return command.offset === data.length
            ? {
                ...metadata,
                offset: command.offset,
                nextOffset: end,
                data: "",
                finished: true,
                sha256: createHash("sha256").update(data).digest("hex"),
              }
            : {
                ...metadata,
                offset: command.offset,
                nextOffset: end,
                data: data.subarray(command.offset, end).toString("base64"),
                finished: false,
              };
        }
        default:
          throw new Error("Unexpected administration command");
      }
    },
  );
  const chunks: Buffer[] = [];
  const stdout = new Writable({
    write(bytes, _encoding, done) {
      chunks.push(Buffer.from(bytes));
      done();
    },
  });
  const connect = vi.fn<(signal: AbortSignal) => Promise<typeof request>>(async () => request);
  return { data, exportId, request, stdout, chunks, connect };
}
describe("CLI complete session export", () => {
  it("parses an exact saved ID and output path with command-specific scope and sensitivity help", () => {
    expect(parseSessionExportCli(["sessions", "list"])).toBeNull();
    expect(parseSessionExportCli(["sessions", "export", "thread"])).toEqual({
      threadId: "thread",
      output: "-",
    });
    expect(
      parseSessionExportCli(["sessions", "export", "thread", "--output", "archive.json"]),
    ).toEqual({ threadId: "thread", output: "archive.json" });
    for (const args of [[], ["thread", "extra"], ["thread", "--output", " "], ["thread", "--json"]])
      expect(() => parseSessionExportCli(["sessions", "export", ...args])).toThrow(
        /Usage|Unknown|Invalid/,
      );
    expect(cliCommandHelp("sessions", "export")).toMatch(/v13/);
    expect(cliCommandHelp("sessions", "export")).toMatch(/sensitive/);
  });

  it("streams complete Unicode and more than one admin response to stdout without extra text", async () => {
    const f = fixture(Buffer.from(JSON.stringify({ message: "🧪猫".repeat(300_000) })));
    const signals = process.listenerCount("SIGINT"),
      terms = process.listenerCount("SIGTERM");
    await runSessionExportCli({ threadId: "thread", output: "-" }, f.connect, f.stdout);
    expect(Buffer.concat(f.chunks)).toEqual(f.data);
    expect(
      f.request.mock.calls.filter(([c]) => c.action === "sessions-export-read").length,
    ).toBeGreaterThan(16);
    expect(f.request.mock.calls.some(([c]) => c.action === "sessions-export-cancel")).toBe(false);
    expect(process.listenerCount("SIGINT")).toBe(signals);
    expect(process.listenerCount("SIGTERM")).toBe(terms);
    expect(f.stdout.listenerCount("error")).toBe(0);
  });

  it("publishes a complete checksummed file exclusively and cleans its exact sibling temporary file", async () => {
    const dir = await directory(),
      target = join(dir, "session.json"),
      f = fixture();
    await runSessionExportCli({ threadId: "thread", output: target }, f.connect, f.stdout);
    expect(await readFile(target)).toEqual(f.data);
    expect(await readdir(dir)).toEqual(["session.json"]);
    expect(f.chunks).toEqual([]);
  });

  it("refuses an existing destination without reading or replacing it and confirms worker cancellation", async () => {
    const dir = await directory(),
      target = join(dir, "kept.json"),
      f = fixture();
    await writeFile(target, "kept");
    await expect(
      runSessionExportCli({ threadId: "thread", output: target }, f.connect, f.stdout),
    ).rejects.toThrow("already exists");
    expect(await readFile(target, "utf8")).toBe("kept");
    expect(await readdir(dir)).toEqual(["kept.json"]);
    expect(f.request.mock.calls.map(([c]) => c.action)).toEqual([
      "sessions-export-start",
      "sessions-export-cancel",
    ]);
  });

  it("identifies an unavailable destination directory instead of suggesting an offline owner", async () => {
    const dir = await directory(),
      f = fixture();
    await expect(
      runSessionExportCli(
        { threadId: "thread", output: join(dir, "missing", "session.json") },
        f.connect,
      ),
    ).rejects.toThrow("export destination directory");
    expect(f.request.mock.calls.map(([command]) => command.action)).toEqual([
      "sessions-export-start",
      "sessions-export-cancel",
    ]);
    expect(await readdir(dir)).toEqual([]);
  });

  it.each(["checksum", "offset", "identity", "base64"])(
    "rejects a corrupt %s, cancels through the pinned connection and leaves no partial destination",
    async (kind) => {
      const dir = await directory(),
        target = join(dir, "bad.json"),
        f = fixture();
      const original = f.request.getMockImplementation()!;
      f.request.mockImplementation(async (command, signal) => {
        const result = (await original(command, signal)) as Record<string, unknown>;
        if (command.action !== "sessions-export-read") return result;
        if (kind === "checksum" && result.finished) result.sha256 = "00".repeat(32);
        if (kind === "offset") result.nextOffset = 7;
        if (kind === "identity") result.threadId = "other";
        if (kind === "base64") result.data = "!!!!";
        return result;
      });
      await expect(
        runSessionExportCli({ threadId: "thread", output: target }, f.connect, f.stdout),
      ).rejects.toThrow(/mismatch|Invalid/);
      expect(await readdir(dir)).toEqual([]);
      expect(f.request.mock.calls.at(-1)).toEqual([
        { action: "sessions-export-cancel", threadId: "thread", exportId: f.exportId },
      ]);
    },
  );

  it("does not touch output files when an older owner refuses v13", async () => {
    const dir = await directory(),
      f = fixture();
    f.request.mockRejectedValue(new Error("Unsupported local administration version"));
    await expect(
      runSessionExportCli({ threadId: "thread", output: join(dir, "absent.json") }, f.connect),
    ).rejects.toThrow("Unsupported");
    expect(await readdir(dir)).toEqual([]);
    expect(f.request).toHaveBeenCalledTimes(1);
  });

  it("preserves the original failure and cause when owner cancellation cannot be confirmed", async () => {
    const dir = await directory(),
      f = fixture(),
      original = f.request.getMockImplementation()!;
    const failure = new Error("Export read refused: capacity"),
      cleanup = new Error("Owner unavailable");
    f.request.mockImplementation(async (command, signal) => {
      if (command.action === "sessions-export-read") throw failure;
      if (command.action === "sessions-export-cancel") throw cleanup;
      return original(command, signal);
    });
    const result = await runSessionExportCli(
      { threadId: "thread", output: join(dir, "absent.json") },
      f.connect,
    ).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(AggregateError);
    expect(result).toMatchObject({
      cause: failure,
      message: expect.stringContaining("Export read refused: capacity"),
      errors: [failure, cleanup],
    });
    expect(await readdir(dir)).toEqual([]);
  });

  it("preserves EPIPE and joins cancellation before retiring the stdout error listener", async () => {
    const f = fixture(),
      error = Object.assign(new Error("consumer closed"), { code: "EPIPE" });
    const stdout = new Writable({
      write(_bytes, _encoding, done) {
        done(error);
      },
    });
    const close = Promise.withResolvers<void>(),
      entered = Promise.withResolvers<void>();
    const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (command, signal) => {
      if (command.action === "sessions-export-cancel") {
        entered.resolve();
        await close.promise;
      }
      return original(command, signal);
    });
    const run = runSessionExportCli({ threadId: "thread", output: "-" }, f.connect, stdout);
    const rejected = run.catch((failure: unknown) => failure);
    await entered.promise;
    expect(stdout.listenerCount("error")).toBe(1);
    close.resolve();
    expect(await rejected).toBe(error);
    expect(stdout.listenerCount("error")).toBe(0);
  });

  it("cancels a blocked pipe write on Ctrl+C and confirms host cleanup without an aborted cleanup signal", async () => {
    const f = fixture(),
      entered = Promise.withResolvers<void>();
    const stdout = new Writable({
      write(_bytes, _encoding, _done) {
        entered.resolve();
      },
    });
    const run = runSessionExportCli({ threadId: "thread", output: "-" }, f.connect, stdout);
    const rejected = run.catch((failure: unknown) => failure);
    await entered.promise;
    process.emit("SIGINT");
    expect(await rejected).toMatchObject({ message: "Session export cancelled." });
    expect(stdout.destroyed).toBe(true);
    expect(f.request.mock.calls.at(-1)).toEqual([
      { action: "sessions-export-cancel", threadId: "thread", exportId: f.exportId },
    ]);
    expect(stdout.listenerCount("error")).toBe(0);
  });
});
