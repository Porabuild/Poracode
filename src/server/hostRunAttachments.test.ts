import { mkdirSync, mkdtempSync, writeFileSync, rmSync, truncateSync } from "node:fs";
import * as fs from "node:fs/promises";
import { resolve, join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HOST_RUN_MAX_FILES, HOST_RUN_MAX_FILE_BYTES } from "@/shared/contracts/hostRun";
import { inspectRunAttachments, readRunAttachments } from "./hostRunAttachments";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    open: vi.fn<typeof actual.open>(actual.open),
    lstat: vi.fn<typeof actual.lstat>(actual.lstat),
  };
});
beforeEach(async () => {
  const actual = await vi.importActual<typeof fs>("node:fs/promises");
  vi.mocked(fs.open).mockReset().mockImplementation(actual.open);
  vi.mocked(fs.lstat).mockReset().mockImplementation(actual.lstat);
});

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  mkdirSync(resolve("tmp"), { recursive: true });
  const root = mkdtempSync(resolve("tmp/run-files-"));
  roots.push(root);
  return root;
}
const active = () => {};
it("opens native regular files without reading bytes during preparation and preserves order/empty bytes", async () => {
  const root = fixture(),
    first = join(root, "first file.txt"),
    second = join(root, "empty.txt");
  writeFileSync(first, "Attachment 世界");
  writeFileSync(second, "");
  const sources = await inspectRunAttachments([first, second], active);
  expect(sources.map((file) => file.path)).toEqual([first, second]);
  expect(sources).not.toHaveProperty("data");
  const uploads = await readRunAttachments(sources, active);
  expect(uploads.map((file) => [file.fileName, file.data.toString()])).toEqual([
    ["first file.txt", "Attachment 世界"],
    ["empty.txt", ""],
  ]);
});
it("refuses counts, relative paths, WSL paths, directories and missing files before reading", async () => {
  const root = fixture(),
    open = vi.mocked(fs.open);
  await expect(inspectRunAttachments([], active)).rejects.toThrow("1 to");
  await expect(
    inspectRunAttachments(Array(HOST_RUN_MAX_FILES + 1).fill(join(root, "missing")), active),
  ).rejects.toThrow("1 to");
  await expect(inspectRunAttachments(["relative.txt"], active)).rejects.toThrow("absolute native");
  await expect(
    inspectRunAttachments(["\\\\wsl.localhost\\Selected\\private.txt"], active),
  ).rejects.toThrow("native");
  await expect(inspectRunAttachments([root], active)).rejects.toThrow("regular files");
  await expect(inspectRunAttachments([join(root, "missing")], active)).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(open).not.toHaveBeenCalled();
});
it("bounds the combined size before allocating attachment buffers", async () => {
  const root = fixture(),
    first = join(root, "first.txt"),
    second = join(root, "second.txt");
  writeFileSync(first, "");
  truncateSync(first, HOST_RUN_MAX_FILE_BYTES);
  writeFileSync(second, "x");
  await expect(inspectRunAttachments([first, second], active)).rejects.toThrow("20 MiB");
  truncateSync(first, HOST_RUN_MAX_FILE_BYTES + 1);
  await expect(inspectRunAttachments([first], active)).rejects.toThrow("20 MiB");
});
it("rejects a replaced/changed selected source instead of reading the new contents", async () => {
  const path = join(fixture(), "source.txt");
  writeFileSync(path, "before");
  const sources = await inspectRunAttachments([path], active);
  writeFileSync(path, "different bytes");
  await expect(readRunAttachments(sources, active)).rejects.toThrow("changed after preparation");
});
it("distinguishes exact file IDs beyond number precision even when size and timestamps match", async () => {
  const path = join(fixture(), "source.txt");
  writeFileSync(path, "Identical bytes");
  const actual = await vi.importActual<typeof fs>("node:fs/promises");
  let inode = 9007199254740992n;
  vi.mocked(fs.lstat).mockImplementation(async (...params) => {
    const info = await Reflect.apply(actual.lstat, actual, params);
    Reflect.set(info, "ino", typeof info.ino === "bigint" ? inode : Number(inode));
    return info;
  });
  vi.mocked(fs.open).mockImplementation(async (...params) => {
    const file = await actual.open(...params),
      stat = file.stat.bind(file);
    vi.spyOn(file, "stat").mockImplementation(async (...args) => {
      const info = await Reflect.apply(stat, file, args);
      Reflect.set(info, "ino", typeof info.ino === "bigint" ? inode : Number(inode));
      return info;
    });
    return file;
  });
  const sources = await inspectRunAttachments([path], active);
  inode += 1n;
  expect(Number(inode)).toBe(Number(inode - 1n));
  await expect(readRunAttachments(sources, active)).rejects.toThrow("changed after preparation");
});
it("refuses a source that grows during a bounded descriptor read and joins its close", async () => {
  const path = join(fixture(), "source.txt");
  writeFileSync(path, "before");
  const sources = await inspectRunAttachments([path], active);
  const original = (await vi.importActual<typeof fs>("node:fs/promises")).open;
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  vi.mocked(fs.open).mockImplementation(async (...args) => {
    const file = await original(...args);
    handle = file;
    const read = file.read.bind(file);
    vi.spyOn(file, "read").mockImplementation(async (...params) => {
      const result = await Reflect.apply(read, file, params);
      writeFileSync(path, "Changed during descriptor read");
      return result;
    });
    return file;
  });
  await expect(readRunAttachments(sources, active)).rejects.toThrow("changed while reading");
  expect(handle!.fd).toBe(-1);
});
it("does not open anything after cancellation", async () => {
  const path = join(fixture(), "source.txt");
  writeFileSync(path, "before");
  const sources = await inspectRunAttachments([path], active),
    open = vi.mocked(fs.open);
  open.mockClear();
  const cancelled = () => {
    throw new Error("Owned cancellation");
  };
  await expect(inspectRunAttachments([path], cancelled)).rejects.toThrow("Owned cancellation");
  await expect(readRunAttachments(sources, cancelled)).rejects.toThrow("Owned cancellation");
  expect(open).not.toHaveBeenCalled();
});
it("joins a held native stat and closes its exact descriptor before rejecting cancellation", async () => {
  const path = join(fixture(), "source.txt");
  writeFileSync(path, "before");
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>(),
    controller = new AbortController(),
    original = (await vi.importActual<typeof fs>("node:fs/promises")).open;
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  vi.mocked(fs.open).mockImplementation(async (...args) => {
    const file = await original(...args);
    handle = file;
    const stat = file.stat.bind(file);
    vi.spyOn(file, "stat").mockImplementation(async (...params) => {
      entered.resolve();
      await release.promise;
      return Reflect.apply(stat, file, params);
    });
    return file;
  });
  const pending = inspectRunAttachments([path], () => controller.signal.throwIfAborted());
  void pending.catch(() => {});
  await entered.promise;
  controller.abort(new Error("Owned cancellation"));
  expect(handle!.fd).toBeGreaterThanOrEqual(0);
  release.resolve();
  await expect(pending).rejects.toThrow("Owned cancellation");
  expect(handle!.fd).toBe(-1);
});
