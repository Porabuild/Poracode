import {
  closeSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  openSync,
  lstatSync,
  fstatSync,
  symlinkSync,
} from "node:fs";
import { fork, execFileSync } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeFileAtomic } from "./atomicFile";

/**
 * Drives `renameSync` failures without touching the ESM namespace (which is
 * non-configurable and can't be `vi.spyOn`'d). `failCodes` is a queue of error
 * codes to throw — one per call, in order — before delegating to the real fs.
 */
const renameControl = vi.hoisted(() => ({
  failCodes: [] as string[],
  realRename: (() => {}) as (from: string, to: string) => void,
  writeFailure: false,
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  renameControl.realRename = actual.renameSync;
  return {
    ...actual,
    openSync: vi.fn<typeof actual.openSync>(actual.openSync),
    closeSync: vi.fn<typeof actual.closeSync>(actual.closeSync),
    writeFileSync: vi.fn<typeof actual.writeFileSync>((...args) => {
      if (renameControl.writeFailure && typeof args[0] === "number")
        throw new Error("Synthetic write failure.");
      return actual.writeFileSync(...args);
    }),
    renameSync: vi.fn<(from: string, to: string) => void>((from, to) => {
      const code = renameControl.failCodes.shift();
      if (code) {
        throw Object.assign(new Error(`${code}: operation on file`), { code });
      }
      return renameControl.realRename(from, to);
    }),
  };
});

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: vi.fn<typeof actual.randomUUID>(actual.randomUUID) };
});

describe("writeFileAtomic", () => {
  let dir: string;

  beforeEach(() => {
    renameControl.failCodes = [];
    renameControl.writeFailure = false;
    vi.mocked(randomUUID).mockReset();
    vi.mocked(randomUUID).mockImplementation(() => "f6489b1a-1952-4a42-8e74-448e00c24a15");
    vi.mocked(renameSync).mockClear();
    dir = mkdtempSync(join(tmpdir(), "atomic-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes content to a new file", () => {
    const target = join(dir, "settings.json");
    writeFileAtomic(target, '{"a":1}', { encoding: "utf8" });
    expect(readFileSync(target, "utf8")).toBe('{"a":1}');
  });

  it("creates parent directories", () => {
    const target = join(dir, "nested", "deep", "file.txt");
    writeFileAtomic(target, "hello", { encoding: "utf8" });
    expect(readFileSync(target, "utf8")).toBe("hello");
  });

  it("overwrites an existing file", () => {
    const target = join(dir, "file.txt");
    writeFileSync(target, "old", "utf8");
    writeFileAtomic(target, "new", { encoding: "utf8" });
    expect(readFileSync(target, "utf8")).toBe("new");
  });

  it("leaves no temp file behind on success", () => {
    const target = join(dir, "file.txt");
    writeFileAtomic(target, "data", { encoding: "utf8" });
    const leftovers = readdirSync(dir).filter((name) => name.includes(".tmp"));
    expect(leftovers).toEqual([]);
  });

  it("preserves the existing target and cleans up the temp file when the rename fails", () => {
    // Renaming a regular file onto an existing directory fails on POSIX and
    // Windows alike (EISDIR/ENOTDIR/EPERM), so this exercises the real failure
    // path without mocking fs internals.
    const target = join(dir, "target-is-a-dir");
    mkdirSync(target);

    // The rename throws an fs error whose code varies by platform
    // (EISDIR/ENOTDIR/EPERM), so assert on the captured error rather than a message.
    let thrown: unknown;
    try {
      writeFileAtomic(target, "replacement", { encoding: "utf8" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);

    // The original entry is untouched (still a directory)…
    expect(statSync(target).isDirectory()).toBe(true);
    // …and the temp file was cleaned up rather than orphaned.
    const leftovers = readdirSync(dir).filter((name) => name.includes(".tmp"));
    expect(leftovers).toEqual([]);
  });

  it("writes Buffer data (e.g. binary/encoded secrets)", () => {
    const target = join(dir, "key.safe");
    const buf = Buffer.from("c2VjcmV0", "utf8");
    writeFileAtomic(target, buf);
    expect(readFileSync(target).equals(buf)).toBe(true);
    expect(existsSync(`${target}.${process.pid}.tmp`)).toBe(false);
  });

  it("retries a transient EPERM lock on the rename and succeeds", () => {
    renameControl.failCodes = ["EPERM", "EPERM"];

    const target = join(dir, "settings.json");
    writeFileAtomic(target, '{"a":1}', { encoding: "utf8" });

    // Two failed attempts + one successful call.
    expect(vi.mocked(renameSync)).toHaveBeenCalledTimes(3);
    expect(readFileSync(target, "utf8")).toBe('{"a":1}');
  });

  it("throws and cleans up the temp file when the lock does not clear", () => {
    // Exceed the retry budget so the write still fails.
    renameControl.failCodes = ["EPERM", "EPERM", "EPERM", "EPERM", "EPERM", "EPERM"];

    const target = join(dir, "settings.json");
    expect(() => writeFileAtomic(target, "data", { encoding: "utf8" })).toThrow(/EPERM/);

    // Temp file cleaned up rather than orphaned.
    const leftovers = readdirSync(dir).filter((name) => name.includes(".tmp"));
    expect(leftovers).toEqual([]);
  });

  it("does not retry a non-retryable rename error", () => {
    renameControl.failCodes = ["EISDIR"];

    const target = join(dir, "settings.json");
    expect(() => writeFileAtomic(target, "data", { encoding: "utf8" })).toThrow(/EISDIR/);

    // A non-retryable code aborts immediately after a single attempt.
    expect(vi.mocked(renameSync)).toHaveBeenCalledTimes(1);
  });

  it.each(
    process.platform === "win32"
      ? (["file", "link"] as const)
      : (["file", "link", "FIFO"] as const),
  )("preserves a pre-existing %s at a colliding temporary name", (kind) => {
    const target = join(dir, "target.json");
    const temporary = `${target}.f6489b1a-1952-4a42-8e74-448e00c24a15.tmp`;
    writeFileSync(target, "old target");
    const linked = join(dir, "linked");
    if (kind === "FIFO") execFileSync("mkfifo", [temporary]);
    else if (kind === "link") {
      mkdirSync(linked);
      writeFileSync(join(linked, "preserve"), "linked bytes");
      symlinkSync(linked, temporary, process.platform === "win32" ? "junction" : "dir");
    } else writeFileSync(temporary, "unowned temporary bytes");
    const preservedState = () =>
      kind === "FIFO"
        ? { fifo: lstatSync(temporary).isFIFO() }
        : kind === "link"
          ? {
              link: lstatSync(temporary).isSymbolicLink(),
              content: readFileSync(join(linked, "preserve"), "utf8"),
            }
          : { content: readFileSync(temporary, "utf8") };
    const originalState = preservedState();
    expect(() => writeFileAtomic(target, "replacement", { encoding: "utf8" })).toThrow(/EEXIST/);
    expect(readFileSync(target, "utf8")).toBe("old target");
    expect(preservedState()).toEqual(originalState);
  });

  it("closes its owned descriptor and preserves the target after a write failure", () => {
    const target = join(dir, "target.json");
    writeFileSync(target, "old target");
    renameControl.writeFailure = true;
    expect(() => writeFileAtomic(target, "replacement", { mode: 0o600, encoding: "utf8" })).toThrow(
      /Synthetic write failure/,
    );
    const fd = vi.mocked(openSync).mock.results.at(-1)?.value as number;
    expect(closeSync).toHaveBeenCalledWith(fd);
    expect(() => fstatSync(fd)).toThrow(/EBADF/);
    expect(readFileSync(target, "utf8")).toBe("old target");
    expect(readdirSync(dir)).toEqual(["target.json"]);
  });

  it("preserves the requested encoding and creation mode", () => {
    const target = join(dir, "encoded.json");
    writeFileAtomic(target, "synthetic", { encoding: "utf16le", mode: 0o600 });
    expect(readFileSync(target)).toEqual(Buffer.from("synthetic", "utf16le"));
    expect(openSync).toHaveBeenCalledWith(expect.any(String), "wx", 0o600);
  });

  it.skipIf(process.platform === "win32")("applies the requested POSIX creation mode", () => {
    const target = join(dir, "private.json");
    writeFileAtomic(target, "private bytes", { mode: 0o600 });
    expect(statSync(target).mode & 0o777).toBe(0o600);
  });

  it.skipIf(process.platform === "win32")(
    "ignores a legacy PID temporary FIFO without opening or renaming it",
    async () => {
      const target = join(dir, "target.json");
      writeFileSync(target, "old target");
      const moduleUrl = new URL("./atomicFile.ts", import.meta.url).href;
      const bootstrap = `void(async()=>{
const{writeFileAtomic}=await import(${JSON.stringify(moduleUrl)});
process.send('ready');
process.once('message',()=>{
try{writeFileAtomic(${JSON.stringify(target)},'replacement',{encoding:'utf8'});process.send({ok:true},()=>process.disconnect())}
catch(error){process.send({ok:false,error:String(error)},()=>process.disconnect())}
});
})();`;
      const child = fork(join(dir, "unused.cjs"), [], {
        execArgv: ["--eval", bootstrap],
        env: { ...process.env, NODE_OPTIONS: "" },
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      });
      const closed = once(child, "close");
      let stderr = "";
      child.stderr?.on("data", (data: Buffer) => {
        stderr = (stderr + data.toString()).slice(-2_000);
      });
      const exitedEarly = closed.then(() => {
        throw new Error(`Atomic writer fixture exited before replying: ${stderr}`);
      });
      void exitedEarly.catch(() => undefined);
      let backstop: ReturnType<typeof setTimeout> | undefined;
      let reader: number | undefined;
      let intervention = false;
      try {
        await Promise.race([once(child, "message"), exitedEarly]);
        const temporary = `${target}.${child.pid}.tmp`;
        execFileSync("mkfifo", [temporary]);
        backstop = setTimeout(() => {
          intervention = true;
          reader = openSync(temporary, constants.O_RDONLY | constants.O_NONBLOCK);
        }, 500);
        const result = Promise.race([once(child, "message"), exitedEarly]);
        child.send("write");
        expect((await result)[0]).toEqual({ ok: true });
        expect({ intervention, targetIsRegular: lstatSync(target).isFile() }).toEqual({
          intervention: false,
          targetIsRegular: true,
        });
        expect(readFileSync(target, "utf8")).toBe("replacement");
        expect(lstatSync(temporary).isFIFO()).toBe(true);
        await closed;
      } finally {
        clearTimeout(backstop);
        if (reader !== undefined) closeSync(reader);
        if (child.pid && child.pid > 0 && child.exitCode === null && child.signalCode === null)
          child.kill("SIGKILL");
        await closed;
      }
    },
  );
});
