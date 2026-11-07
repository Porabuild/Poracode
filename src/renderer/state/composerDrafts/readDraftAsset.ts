import { readBridge } from "@/renderer/bridge";
import { toLocalFileUrl } from "@/shared/promptContent";
import { readClientDraftAsset, stageClientDraftAsset } from "./clientDraftDatabase";

interface AssetReference {
  path: string;
  name: string;
  mimeType?: string | undefined;
  source?: { path?: string | undefined; remoteServerId?: string | undefined } | undefined;
}

/** Resume a native import interrupted before its bytes committed locally. */
export async function readDraftAsset(reference: AssetReference) {
  try {
    return await readClientDraftAsset(reference.path);
  } catch (error) {
    const original = reference.source?.path;
    if (
      !original ||
      reference.source?.remoteServerId ||
      typeof readBridge()?.readClientDraftFile !== "function"
    )
      throw error;
    const data = await readBridge().readClientDraftFile({ url: toLocalFileUrl(original) });
    const stored = stageClientDraftAsset(
      new Blob([Uint8Array.from(data)], { type: reference.mimeType ?? "application/octet-stream" }),
      reference.name,
      reference.path,
    );
    await stored.saved;
    return readClientDraftAsset(stored.path);
  }
}
