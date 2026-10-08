import { useEffect, useState } from "react";
import type { ProjectLocation } from "@/shared/contracts";
import { createEditorMediaSource, type EditorMediaSource } from "./fileMediaSource";
import {
  closeImageLightboxForSource,
  updateImageLightboxSource,
} from "@/renderer/components/composer/ImageLightbox";

/** Each mounted preview owns one grant; renewal retires the previous grant after commit. */
export function useFileMediaSource(
  location: ProjectLocation | null,
  path: string,
  version: number,
  reload: number,
) {
  const scope = JSON.stringify([location, path, version, reload]);
  const [loaded, setLoaded] = useState<{ scope: string; source: EditorMediaSource } | null>(null);
  const [failedScope, setFailedScope] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let current: EditorMediaSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      if (!location) {
        setFailedScope(scope);
        return;
      }
      try {
        const next = await createEditorMediaSource(location, path, controller.signal);
        if (controller.signal.aborted) {
          void next.release().catch(() => undefined);
          return;
        }
        const previous = current;
        current = next;
        setLoaded({ scope, source: next });
        // Release after React has switched the native element to the new source.
        if (previous) {
          updateImageLightboxSource(previous.url, next.url, next.readImageBytes);
          setTimeout(() => void previous.release().catch(() => undefined), 1000);
        }
        timer = setTimeout(
          () => void load(),
          Math.max(1000, Date.parse(next.expiresAt) - Date.now() - 30_000),
        );
      } catch {
        if (!controller.signal.aborted) {
          if (current) {
            closeImageLightboxForSource(current.url);
            void current.release().catch(() => undefined);
          }
          current = null;
          setLoaded(null);
          setFailedScope(scope);
        }
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
      if (current) {
        closeImageLightboxForSource(current.url);
        void current.release().catch(() => undefined);
      }
    };
  }, [location, path, scope]);
  return { source: loaded?.scope === scope ? loaded.source : null, failed: failedScope === scope };
}
