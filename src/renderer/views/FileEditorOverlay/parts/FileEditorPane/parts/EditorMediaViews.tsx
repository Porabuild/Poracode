import type { ReactNode } from "react";
import { ImageFileView } from "@/renderer/components/media/ImageFileView";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { resolveFileDisplayUrl } from "@/renderer/utils/fileDisplayUrl";
import type { ProjectLocation } from "@/shared/contracts";
import { getBasename } from "@/shared/pathUtils";

function remoteLocalImageUrl(remoteServerId: string, absolutePath: string): string {
  return useRemoteServersStore.getState().localImageUrl(remoteServerId, absolutePath);
}

/** An image file the text editor can't open, loaded from disk by URL. */
export function EditorImageView(props: {
  path: string;
  projectLocation: ProjectLocation | null;
  fallback: ReactNode;
}) {
  const { path, projectLocation } = props;
  const modifiedAtMs = useFileEditorStore((state) => state.buffers[path]?.modifiedAtMs);
  const sizeBytes = useFileEditorStore((state) => state.buffers[path]?.sizeBytes);
  const src = projectLocation
    ? resolveFileDisplayUrl({
        projectLocation,
        path,
        ...(modifiedAtMs !== undefined ? { version: modifiedAtMs } : {}),
        remoteLocalImageUrl,
      })
    : "";
  return (
    <ImageFileView
      src={src}
      fileName={getBasename(path)}
      sizeBytes={sizeBytes}
      fallback={props.fallback}
    />
  );
}
