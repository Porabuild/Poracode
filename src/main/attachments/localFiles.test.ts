import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PoracodePaths } from "@/shared/poracodePaths";
import { resolvePoracodePaths } from "@/shared/poracodePaths";
import { saveUploadedAttachmentFile } from "@/host/attachments/attachmentStorage";
import {
  readLocalImageFile,
  saveClipboardImageFile,
  saveHandoffContextFile,
  writeImageFile,
} from "./localFiles";

type FsOperation = "mkdir" | "writeFile";

// Deferred filesystem boundary: ordering tests park a real operation on a gate
// and assert what may run while it is suspended. Everything else delegates to
// the real implementation.
const fsControl = vi.hoisted(() => ({
  calls: [] as FsOperation[],
  gate: null as {
    operation: FsOperation;
    signalEntered: () => void;
    released: Promise<void>;
  } | null,
  failNextWriteFile: false,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const beforeOperation = async (operation: FsOperation): Promise<void> => {
    fsControl.calls.push(operation);
    const gate = fsControl.gate;
    if (gate && gate.operation === operation) {
      fsControl.gate = null;
      gate.signalEntered();
      await gate.released;
    }
  };
  return {
    ...actual,
    mkdir: (async (
      path: Parameters<typeof actual.mkdir>[0],
      options?: Parameters<typeof actual.mkdir>[1],
    ) => {
      await beforeOperation("mkdir");
      return actual.mkdir(path, options);
    }) as typeof actual.mkdir,
    rm: actual.rm,
    writeFile: (async (
      path: Parameters<typeof actual.writeFile>[0],
      data: Parameters<typeof actual.writeFile>[1],
      options?: Parameters<typeof actual.writeFile>[2],
    ) => {
      await beforeOperation("writeFile");
      if (fsControl.failNextWriteFile) {
        fsControl.failNextWriteFile = false;
        throw Object.assign(new Error("ENOSPC: no space left"), { code: "ENOSPC" });
      }
      return actual.writeFile(path, data, options);
    }) as typeof actual.writeFile,
  };
});

function deferNextOperation(operation: FsOperation): {
  entered: Promise<void>;
  release: () => void;
} {
  let signalEntered!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    signalEntered = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  fsControl.gate = { operation, signalEntered, released };
  return { entered, release };
}

function flushEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

type SaveForm = "clipboard" | "handoff";

function saveFor(form: SaveForm, paths: PoracodePaths, threadId = "thread-1"): Promise<string> {
  return form === "clipboard"
    ? saveClipboardImageFile(paths, { threadId, data: new Uint8Array([7, 7]), extension: "png" })
    : saveHandoffContextFile(paths, { threadId, content: "# Handoff\n" });
}

afterEach(() => {
  fsControl.calls.length = 0;
  fsControl.gate = null;
  fsControl.failNextWriteFile = false;
});

describe("saveClipboardImageFile", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    vi.restoreAllMocks();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("sanitizes draft ids in both directory and filename", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1777618781449);
    tempDir = mkdtempSync(join(tmpdir(), "poracode-attachments-"));
    const paths = resolvePoracodePaths(tempDir);
    const data = new Uint8Array([1, 2, 3, 4]);

    const filePath = await saveClipboardImageFile(paths, {
      threadId: "draft:e0107b4b-0ddc-49a7-bf10-f2c9259ed5b3",
      data,
      extension: "png",
    });

    expect(filePath).toBe(join(paths.attachmentsDir, "draft-e0107b", "draft-e0-1777618781449.png"));
    expect(basename(filePath)).not.toContain(":");
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath)).toEqual(Buffer.from(data));
  });

  it("keeps concurrent same-millisecond clipboard saves distinct", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1777618781449);
    tempDir = mkdtempSync(join(tmpdir(), "poracode-attachments-"));
    const paths = resolvePoracodePaths(tempDir);

    const [first, second] = await Promise.all([
      saveClipboardImageFile(paths, {
        threadId: "thread-1",
        data: new Uint8Array([1]),
        extension: "png",
      }),
      saveClipboardImageFile(paths, {
        threadId: "thread-1",
        data: new Uint8Array([2]),
        extension: "png",
      }),
    ]);

    const threadDir = join(paths.attachmentsDir, "thread-1");
    expect(new Set([first, second])).toEqual(
      new Set([
        join(threadDir, "thread-1-1777618781449.png"),
        join(threadDir, "thread-1-1777618781449 (2).png"),
      ]),
    );
    expect(readFileSync(first)).toEqual(Buffer.from([1]));
    expect(readFileSync(second)).toEqual(Buffer.from([2]));
  });

  it("keeps concurrent same-instant handoff saves distinct", async () => {
    vi.spyOn(Date.prototype, "toISOString").mockReturnValue("2026-09-20T12:34:56.789Z");
    tempDir = mkdtempSync(join(tmpdir(), "poracode-handoff-"));
    const paths = resolvePoracodePaths(tempDir);

    const [first, second] = await Promise.all([
      saveHandoffContextFile(paths, { threadId: "thread-1", content: "# One\n" }),
      saveHandoffContextFile(paths, { threadId: "thread-1", content: "# Two\n" }),
    ]);

    const threadDir = join(paths.attachmentsDir, "thread-1");
    expect(new Set([first, second])).toEqual(
      new Set([
        join(threadDir, "handoff-context-2026-09-20T12-34-56-789Z.md"),
        join(threadDir, "handoff-context-2026-09-20T12-34-56-789Z (2).md"),
      ]),
    );
    expect(readFileSync(first, "utf8")).toBe("# One\n");
    expect(readFileSync(second, "utf8")).toBe("# Two\n");
  });

  it("propagates asynchronous save failures", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-attachments-"));
    const paths = resolvePoracodePaths(tempDir);
    mkdirSync(paths.attachmentsDir, { recursive: true });
    writeFileSync(join(paths.attachmentsDir, "thread-1"), "occupied");

    await expect(
      saveClipboardImageFile(paths, {
        threadId: "thread-1",
        data: new Uint8Array([1]),
        extension: "png",
      }),
    ).rejects.toThrow(/EEXIST/);
    await expect(
      saveHandoffContextFile(paths, { threadId: "thread-1", content: "# Handoff\n" }),
    ).rejects.toThrow(/EEXIST/);
    await expect(
      writeImageFile(join(paths.attachmentsDir, "missing", "image.png"), new Uint8Array([1])),
    ).rejects.toThrow(/ENOENT/);
  });

  it("preserves a safe display name and avoids overwriting duplicates", () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-attachments-"));
    const paths = resolvePoracodePaths(tempDir);

    const first = saveUploadedAttachmentFile(paths, {
      threadId: "thread-1",
      fileName: "notes.md",
      data: new Uint8Array([1]),
    });
    const second = saveUploadedAttachmentFile(paths, {
      threadId: "thread-1",
      fileName: "notes.md",
      data: new Uint8Array([2]),
    });

    expect(basename(first)).toBe("notes.md");
    expect(basename(second)).toBe("notes (2).md");
    expect(readFileSync(first)).toEqual(Buffer.from([1]));
    expect(readFileSync(second)).toEqual(Buffer.from([2]));
  });

  it("keeps untrusted thread ids inside the attachment root", () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-attachments-"));
    const paths = resolvePoracodePaths(tempDir);

    const filePath = saveUploadedAttachmentFile(paths, {
      threadId: "..",
      fileName: "notes.md",
      data: new Uint8Array([1]),
    });

    expect(dirname(filePath)).toBe(join(paths.attachmentsDir, "--"));
  });

  it("reads bytes from a local image protocol URL", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-local-image-"));
    const filePath = join(tempDir, "image.png");
    const bytes = Buffer.from([137, 80, 78, 71]);
    writeFileSync(filePath, bytes);

    await expect(
      readLocalImageFile(`poracode-local://local${pathToFileURL(filePath).pathname}`),
    ).resolves.toEqual(bytes);
    await expect(readLocalImageFile(`file://${filePath}`)).rejects.toThrow(
      "Unsupported local image URL",
    );
  });

  it("writes image bytes to a chosen absolute path", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-write-image-"));
    const filePath = join(tempDir, "saved.png");
    const bytes = new Uint8Array([9, 8, 7]);

    await writeImageFile(filePath, bytes);

    expect(readFileSync(filePath)).toEqual(Buffer.from(bytes));
  });

  it("writes a handoff summary under the thread's attachment directory", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-handoff-"));
    const paths = resolvePoracodePaths(tempDir);

    const filePath = await saveHandoffContextFile(paths, {
      threadId: "thread-1",
      content: "# Handoff\n",
    });
    expect(readFileSync(filePath, "utf8")).toBe("# Handoff\n");
    expect(dirname(filePath)).toBe(join(paths.attachmentsDir, "thread-1"));
  });
});

describe("thread attachment directory ordering", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it.each<SaveForm>(["clipboard", "handoff"])(
    "queues a same-directory %s save behind a parked one, then releases both",
    async (form) => {
      tempDir = mkdtempSync(join(tmpdir(), "poracode-attachment-order-"));
      const paths = resolvePoracodePaths(tempDir);
      const threadDir = join(paths.attachmentsDir, "thread-1");

      const gate = deferNextOperation("mkdir");
      const first = saveFor(form, paths, "thread-1");
      await gate.entered;

      let secondSettled = false;
      const second = saveFor(form, paths, "thread-1").then((savedPath) => {
        secondSettled = true;
        return savedPath;
      });
      await flushEventLoop();
      // The queue holds the second save until the parked one finishes: no
      // second mkdir may start while the first is suspended.
      expect(secondSettled).toBe(false);
      expect(fsControl.calls.filter((operation) => operation === "mkdir")).toHaveLength(1);

      gate.release();
      const [firstPath, secondPath] = await Promise.all([first, second]);
      expect(secondSettled).toBe(true);
      expect(dirname(firstPath)).toBe(threadDir);
      expect(dirname(secondPath)).toBe(threadDir);
      expect(existsSync(firstPath)).toBe(true);
      expect(existsSync(secondPath)).toBe(true);
    },
  );

  it("keeps an unrelated thread directory moving while one save is deferred", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-attachment-order-"));
    const paths = resolvePoracodePaths(tempDir);

    const gate = deferNextOperation("mkdir");
    let deferredSettled = false;
    const deferredSave = saveFor("clipboard", paths, "thread-1").then((savedPath) => {
      deferredSettled = true;
      return savedPath;
    });
    await gate.entered;

    const otherPath = await saveFor("handoff", paths, "thread-2");
    expect(existsSync(otherPath)).toBe(true);
    expect(deferredSettled).toBe(false);

    gate.release();
    const deferredPath = await deferredSave;
    expect(dirname(deferredPath)).toBe(join(paths.attachmentsDir, "thread-1"));
    expect(existsSync(deferredPath)).toBe(true);
  });

  it("clears a failed save from the queue so a later save proceeds", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-attachment-order-"));
    const paths = resolvePoracodePaths(tempDir);

    fsControl.failNextWriteFile = true;
    await expect(saveFor("clipboard", paths)).rejects.toThrow("ENOSPC: no space left");

    const laterPath = await saveFor("clipboard", paths);
    expect(readFileSync(laterPath)).toEqual(Buffer.from([7, 7]));
  });
});
