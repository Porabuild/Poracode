import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createClientPdfPreview } from "./clientPdfPreview";

describe("tab-owned client PDF previews", () => {
  it("writes exact private bytes on this device and removes them with the tab", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\nclient snapshot");
    let path = "";
    const preview = await createClientPdfPreview(bytes, async (url) => {
      path = fileURLToPath(url);
      expect(new Uint8Array(await readFile(path))).toEqual(bytes);
      return { tabId: "preview" };
    });
    expect(preview.tab).toEqual({ tabId: "preview" });
    await preview.release();
    await expect(access(path)).rejects.toThrow("ENOENT");
  });
  it("cleans up after a failed viewer open", async () => {
    let path = "";
    await expect(
      createClientPdfPreview(new TextEncoder().encode("%PDF-1.7"), async (url) => {
        path = fileURLToPath(url);
        throw new Error("Viewer closed");
      }),
    ).rejects.toThrow("Viewer closed");
    await expect(access(path)).rejects.toThrow("ENOENT");
  });
  it("refuses non-PDF bytes before opening anything", async () => {
    const open = vi.fn<(url: string) => Promise<void>>();
    await expect(createClientPdfPreview(new TextEncoder().encode("<html>"), open)).rejects.toThrow(
      "Invalid client PDF",
    );
    expect(open).not.toHaveBeenCalled();
  });
});
