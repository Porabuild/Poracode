import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePoracodePaths } from "@/shared/poracodePaths";
import { saveClipboardImageFile } from "./localFiles";

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
});
