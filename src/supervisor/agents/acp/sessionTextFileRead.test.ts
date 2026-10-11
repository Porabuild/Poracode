import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  createReadStream,
  open,
  read,
  close,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readTextFileContent } from "./sessionTextFileRead";
import { sliceTextFileContent } from "./sessionPaths";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    createReadStream: vi.fn<typeof actual.createReadStream>(actual.createReadStream),
  };
});

describe("ACP file reads", () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "poracode-acp-range-"));
    vi.mocked(createReadStream).mockClear();
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it("matches the existing slice for empty, mixed-newline and Unicode files", async () => {
    const bodies = [
      "",
      "\n",
      "\r\n",
      "one\n",
      "one\r",
      "one\r\n\r\n🙂\nend\r",
      "α🙂\rβ\nγ\r\r\n終",
    ];
    const ranges = [
      [undefined, undefined],
      [null, null],
      [undefined, 0],
      [null, 1],
      [1, undefined],
      [2, undefined],
      [2, 1],
      [1, 2],
      [3, 20],
      [20, 1],
      [0, 1],
      [-2, -1],
      [2.9, 1.9],
      [NaN, 1],
      [1, Infinity],
      [Infinity, 2],
    ] as const;
    for (const body of bodies) {
      const path = join(directory, "text.txt");
      writeFileSync(path, body);
      for (const [line, limit] of ranges) {
        expect(await readTextFileContent(path, line, limit)).toBe(
          sliceTextFileContent(body, line, limit),
        );
      }
    }
  });

  it("preserves delimiters and UTF-8 characters split across stream chunks", async () => {
    const path = join(directory, "boundaries.txt");
    const body = "x".repeat(65535) + "\r\n" + "y".repeat(65533) + "🙂\r\nlast\r";
    writeFileSync(path, body);
    for (const [line, limit] of [
      [1, 1],
      [2, 1],
      [2, 2],
      [1, 3],
      [3, undefined],
    ] as const) {
      expect(await readTextFileContent(path, line, limit)).toBe(
        sliceTextFileContent(body, line, limit),
      );
    }
    expect(vi.mocked(createReadStream).mock.results.every((r) => r.value.closed)).toBe(true);
  });

  it("decodes invalid UTF-8 exactly like the existing UTF-8 read", async () => {
    const path = join(directory, "invalid.txt");
    writeFileSync(
      path,
      Buffer.concat([
        Buffer.alloc(65535, 0x61),
        Buffer.from([0xf0, 0x9f, 0x0a, 0x80, 0x0d, 0x0a, 0xe2]),
      ]),
    );
    const oracle = readFileSync(path, "utf8");
    for (const [line, limit] of [
      [1, 1],
      [2, 1],
      [2, 2],
      [1, undefined],
    ] as const) {
      expect(await readTextFileContent(path, line, limit)).toBe(
        sliceTextFileContent(oracle, line, limit),
      );
    }
  });

  it("closes early after requested lines instead of reading a large suffix", async () => {
    const path = join(directory, "large.txt");
    writeFileSync(path, "first\r\nsecond🙂\r\n" + "x\n".repeat(4 * 1024 * 1024));
    expect(await readTextFileContent(path, 2, 1)).toBe("second🙂");
    const stream = vi.mocked(createReadStream).mock.results[0]!.value;
    expect(stream.bytesRead).toBeLessThan(1024 * 1024);
    expect(stream.closed).toBe(true);
  });

  it("skips a long unrequested prefix and preserves a long selected line", async () => {
    const path = join(directory, "long-lines.txt");
    const prefix = "p".repeat(256 * 1024),
      selected = "🙂".repeat(64 * 1024);
    writeFileSync(path, prefix + "\r\n" + selected + "\r\nlast");
    expect(await readTextFileContent(path, 2, 1)).toBe(selected);
    expect(await readTextFileContent(path, 3, undefined)).toBe("last");
  });

  it("still reports missing and directory paths with zero requested lines", async () => {
    await expect(readTextFileContent(join(directory, "missing"), 1, 0)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readTextFileContent(directory, 1, 0)).rejects.toMatchObject({ code: "EISDIR" });
    expect(vi.mocked(createReadStream).mock.results.every((r) => r.value.closed)).toBe(true);
  });

  it("keeps unrestricted reads byte-for-byte, including CRLF and trailing newline", async () => {
    const path = join(directory, "full.txt"),
      body = "first\r\n🙂\r\n";
    writeFileSync(path, body);
    expect(await readTextFileContent(path, undefined, undefined)).toBe(body);
    expect(createReadStream).not.toHaveBeenCalled();
  });

  it.each([0, 1, 20])(
    "reports a filesystem close error after a range with limit %i",
    async (limit) => {
      const path = join(directory, "close-error.txt");
      writeFileSync(path, "first\n" + "tail\n".repeat(65536));
      const fault = Object.assign(new Error("fixture close EIO"), { code: "EIO" });
      const createReal = vi.mocked(createReadStream).getMockImplementation()!;
      vi.mocked(createReadStream).mockImplementationOnce((file, options) =>
        createReal(file, {
          ...(typeof options === "object" ? options : {}),
          fs: {
            open,
            read,
            close(fd, callback) {
              close(fd, (error) => callback(error ?? fault));
            },
          },
        }),
      );
      await expect(readTextFileContent(path, 1, limit)).rejects.toBe(fault);
      expect(vi.mocked(createReadStream).mock.results[0]!.value.closed).toBe(true);
    },
  );

  it("reports a midstream read error and still closes the descriptor", async () => {
    const path = join(directory, "read-error.txt");
    writeFileSync(path, "x".repeat(256 * 1024));
    const fault = Object.assign(new Error("fixture read EIO"), { code: "EIO" });
    const createReal = vi.mocked(createReadStream).getMockImplementation()!;
    let reads = 0;
    vi.mocked(createReadStream).mockImplementationOnce((file, options) =>
      createReal(file, {
        ...(typeof options === "object" ? options : {}),
        fs: {
          open,
          close,
          read(fd, buffer, offset, length, position, callback) {
            if (++reads === 1) read(fd, buffer, offset, length, position, callback);
            else callback(fault, 0, buffer);
          },
        },
      }),
    );
    await expect(readTextFileContent(path, 1, 1)).rejects.toBe(fault);
    expect(vi.mocked(createReadStream).mock.results[0]!.value.closed).toBe(true);
  });
});
