import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { MAX_CLIENT_DRAFT_ASSET_BYTES } from "@/shared/clientDraftAssets";

/** Device-local, tab-owned preview. Never writes a draft into a selected host. */
export async function createClientPdfPreview<T>(
  data: Uint8Array,
  open: (url: string, release: () => Promise<void>) => Promise<T>,
) {
  if (
    data.byteLength > MAX_CLIENT_DRAFT_ASSET_BYTES ||
    new TextDecoder().decode(data.subarray(0, 5)) !== "%PDF-"
  )
    throw new Error("Invalid client PDF preview.");
  const directory = await mkdtemp(join(tmpdir(), "poracode-client-pdf-"));
  const path = join(directory, "preview.pdf");
  const release = () =>
    rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  try {
    await writeFile(path, data, { mode: 0o600, flag: "wx" });
    return { tab: await open(pathToFileURL(path).href, release), release };
  } catch (error) {
    await release();
    throw error;
  }
}
