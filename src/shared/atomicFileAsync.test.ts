import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeFileAtomicAsync } from "./atomicFileAsync";

/**
 * Drives rename failures and write failures without touching the ESM
 * namespace. `failCodes` is a queue of error codes to throw — one per rename
 * call, in order — before delegating to the real fs; `writeFailure` swaps the
 * opened handle's `writeFile` for a throwing stub.
 */
const fsControl = vi.hoisted(() => ({
  failCodes: [] as string[],
  writeFailure: false,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    open: vi.fn<(path: string, flags: string | number, mode?: number) => Promise<FileHandle>>(
      async (path, flags, mode) => {
        const handle = await actual.open(path, flags, mode);
        if (!fsControl.writeFailure) return handle;
        return new Proxy(handle, {
          get(target, property) {
            if (property === "writeFile") {
              return async () => {
                throw new Error("Synthetic write failure.");
              };
            }
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
          },
        }) as typeof handle;
      },
    ) as unknown as typeof actual.open,
    rename: vi.fn<(from: string, to: string) => Promise<void>>(async (from, to) => {
      const code = fsControl.failCodes.shift();
      if (code) throw Object.assign(new Error(`${code}: operation on file`), { code });
      return actual.rename(from, to);
    }) as typeof actual.rename,
  };
});

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: vi.fn<typeof actual.randomUUID>(actual.randomUUID) };
});

describe("writeFileAtomicAsync", () => {
  let dir: string;

  beforeEach(() => {
    fsControl.failCodes = [];
    fsControl.writeFailure = false;
    vi.mocked(randomUUID).mockReset();
    vi.mocked(randomUUID).mockImplementation(() => "f6489b1a-1952-4a42-8e74-448e00c24a15");
    dir = mkdtempSync(join(tmpdir(), "atomic-async-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes content to a new file", async () => {
    const target = join(dir, "settings.json");
    await writeFileAtomicAsync(target, '{"a":1}', { encoding: "utf8" });
    expect(readFileSync(target, "utf8")).toBe('{"a":1}');
  });

  it("creates parent directories", async () => {
    const target = join(dir, "nested", "deep", "file.txt");
    await writeFileAtomicAsync(target, "hello", { encoding: "utf8" });
    expect(readFileSync(target, "utf8")).toBe("hello");
  });

  it("overwrites an existing file and leaves no temporary behind", async () => {
    const target = join(dir, "file.txt");
    writeFileSync(target, "old", "utf8");
    await writeFileAtomicAsync(target, "new", { encoding: "utf8" });
    expect(readFileSync(target, "utf8")).toBe("new");
    expect(readdirSync(dir)).toEqual(["file.txt"]);
  });

  it("preserves the target and cleans up its owned temporary when the rename fails", async () => {
    const target = join(dir, "target-is-a-dir");
    mkdirSync(target);
    let thrown: unknown;
    try {
      await writeFileAtomicAsync(target, "replacement", { encoding: "utf8" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(statSync(target).isDirectory()).toBe(true);
    expect(readdirSync(dir)).toEqual(["target-is-a-dir"]);
  });

  it("retries a transient EPERM lock on the rename and succeeds", async () => {
    fsControl.failCodes = ["EPERM", "EPERM"];
    const target = join(dir, "settings.json");
    await writeFileAtomicAsync(target, '{"a":1}', { encoding: "utf8" });
    expect(readFileSync(target, "utf8")).toBe('{"a":1}');
    expect(readdirSync(dir)).toEqual(["settings.json"]);
  });

  it("throws and cleans up its temporary when the lock does not clear", async () => {
    fsControl.failCodes = ["EPERM", "EPERM", "EPERM", "EPERM", "EPERM", "EPERM"];
    const target = join(dir, "settings.json");
    await expect(writeFileAtomicAsync(target, "data", { encoding: "utf8" })).rejects.toThrow(
      /EPERM/,
    );
    expect(readdirSync(dir)).toEqual([]);
  });

  it("does not retry a non-retryable rename error", async () => {
    fsControl.failCodes = ["EISDIR"];
    const target = join(dir, "settings.json");
    await expect(writeFileAtomicAsync(target, "data", { encoding: "utf8" })).rejects.toThrow(
      /EISDIR/,
    );
    expect(readdirSync(dir)).toEqual([]);
  });

  it("closes its owned descriptor, removes its temporary, and preserves the target after a write failure", async () => {
    const target = join(dir, "target.json");
    writeFileSync(target, "old target");
    fsControl.writeFailure = true;
    await expect(
      writeFileAtomicAsync(target, "replacement", { mode: 0o600, encoding: "utf8" }),
    ).rejects.toThrow(/Synthetic write failure/);
    expect(readFileSync(target, "utf8")).toBe("old target");
    expect(readdirSync(dir)).toEqual(["target.json"]);
  });

  it.each(
    process.platform === "win32"
      ? (["file", "link"] as const)
      : (["file", "link", "FIFO"] as const),
  )(
    "preserves a pre-existing %s at a colliding temporary name without removing it",
    async (kind) => {
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
      await expect(
        writeFileAtomicAsync(target, "replacement", { encoding: "utf8" }),
      ).rejects.toThrow(/EEXIST/);
      expect(readFileSync(target, "utf8")).toBe("old target");
      expect(preservedState()).toEqual(originalState);
    },
  );

  it("preserves the requested encoding and creation mode", async () => {
    const target = join(dir, "encoded.json");
    await writeFileAtomicAsync(target, "synthetic", { encoding: "utf16le", mode: 0o600 });
    expect(readFileSync(target)).toEqual(Buffer.from("synthetic", "utf16le"));
    expect(existsSync(target)).toBe(true);
  });

  it.skipIf(process.platform === "win32")("applies the requested POSIX creation mode", async () => {
    const target = join(dir, "private.json");
    await writeFileAtomicAsync(target, "private bytes", { mode: 0o600 });
    expect(statSync(target).mode & 0o777).toBe(0o600);
  });
});
