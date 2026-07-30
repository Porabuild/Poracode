import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePoracodePaths } from "@/shared/poracodePaths";
import { saveUploadedAttachmentFile } from "./attachmentStorage";
import { readLocalImageFile, saveClipboardImageFile } from "./localFiles";

describe("saveClipboardImageFile", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    vi.restoreAllMocks();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("sanitizes draft ids in both directory and filename", () => {
    vi.spyOn(Date, "now").mockReturnValue(1777618781449);
    tempDir = mkdtempSync(join(tmpdir(), "poracode-attachments-"));
    const paths = resolvePoracodePaths(tempDir);
    const data = new Uint8Array([1, 2, 3, 4]);

    const filePath = saveClipboardImageFile(paths, {
      threadId: "draft:e0107b4b-0ddc-49a7-bf10-f2c9259ed5b3",
      data,
      extension: "png",
    });

    expect(filePath).toBe(join(paths.attachmentsDir, "draft-e0107b", "draft-e0-1777618781449.png"));
    expect(basename(filePath)).not.toContain(":");
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath)).toEqual(Buffer.from(data));
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

  it("reads bytes from a local image protocol URL", () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-local-image-"));
    const filePath = join(tempDir, "image.png");
    const bytes = Buffer.from([137, 80, 78, 71]);
    writeFileSync(filePath, bytes);

    expect(readLocalImageFile(`poracode-local://local${pathToFileURL(filePath).pathname}`)).toEqual(
      bytes,
    );
    expect(() => readLocalImageFile(`file://${filePath}`)).toThrow("Unsupported local image URL");
  });
});
