import type { SaveClipboardImage } from "@/renderer/components/composer/useAttachments";
import { entityHost } from "./entityHost";
import { importClientDraftFiles, pickClientDraftFiles } from "@/renderer/utils/browserFilePicker";
import { stageClientDraftAsset } from "./composerDrafts/clientDraftDatabase";
import { clientDraftPersistenceError } from "./composerDrafts/persistenceError";
import { isRemoteSession } from "@/renderer/bridge";

/**
 * Client-side import for composers targeting another machine. Draft files stay
 * on the client until submission; native pickers import their selected paths
 * through useAttachments instead.
 */
export interface HostFileAccess {
  /** Picks files and returns durable client asset references. */
  readonly pickFiles?: () => Promise<string[] | null>;
  /** Imports dropped files and returns durable client asset references. */
  readonly importFiles?: (files: readonly File[]) => Promise<string[]>;
  /** Imports a pasted or captured image into client storage. */
  readonly saveClipboardImage?: SaveClipboardImage;
  /** False when "reveal in file manager" would open the wrong machine. */
  readonly canShowProjectEntryInExplorer?: false;
}

const NATIVE_FILE_ACCESS: HostFileAccess = {};

export function resolveHostFileAccess(entity: Parameters<typeof entityHost>[0]): HostFileAccess {
  const host = entityHost(entity);
  if (!isRemoteSession() && (!host || host.runsOnThisMachine || host.connectionKey === undefined)) {
    return NATIVE_FILE_ACCESS;
  }
  return {
    pickFiles: pickClientDraftFiles,
    importFiles: importClientDraftFiles,
    saveClipboardImage: async (input) => {
      const asset = stageClientDraftAsset(
        new Blob([Uint8Array.from(input.data)], { type: `image/${input.extension}` }),
        `clipboard.${input.extension}`,
      );
      await asset.saved.catch((error: unknown) => {
        throw clientDraftPersistenceError(error);
      });
      return asset.path;
    },
    canShowProjectEntryInExplorer: false,
  };
}
