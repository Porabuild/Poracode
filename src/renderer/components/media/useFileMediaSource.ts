import { useEffect, useState } from "react";
import type { ProjectLocation } from "@/shared/contracts";
import { createEditorMediaSource, type EditorMediaSource } from "./fileMediaSource";
import { closeImageLightboxForSource } from "@/renderer/components/composer/ImageLightbox";

const RENEW_MARGIN_MS = 30_000;
const RETRY_DELAYS_MS = [5_000, 10_000, 20_000];

/** One mount owns one stable grant/URL. Failed renewal never retires still-valid playback. */
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
    let expiry = 0;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    let renewTimer: ReturnType<typeof setTimeout> | undefined;
    const retire = () => {
      controller.abort();
      clearTimeout(expiryTimer);
      clearTimeout(renewTimer);
      if (current) {
        closeImageLightboxForSource(current.url);
        void current.release().catch(() => undefined);
        current = null;
      }
    };
    const expire = () => {
      retire();
      setLoaded(null);
      setFailedScope(scope);
    };
    const schedule = () => {
      clearTimeout(expiryTimer);
      clearTimeout(renewTimer);
      expiryTimer = setTimeout(expire, Math.max(0, expiry - Date.now()));
      // A short or session-limited lease can expire honestly without a tight retry loop.
      if (expiry - Date.now() > RENEW_MARGIN_MS)
        renewTimer = setTimeout(() => void renew(0), expiry - Date.now() - RENEW_MARGIN_MS);
    };
    async function renew(attempt: number) {
      const source = current;
      if (!source || controller.signal.aborted) return;
      try {
        const result = await source.renew(controller.signal);
        if (controller.signal.aborted || current !== source) return;
        const nextExpiry = Date.parse(result.expiresAt);
        if (
          result.ticket !== source.ticket ||
          !Number.isFinite(nextExpiry) ||
          nextExpiry <= Date.now()
        )
          throw new Error("Invalid media renewal.");
        if (nextExpiry <= expiry) {
          // Honor a shorter authoritative deadline without retrying at the session limit.
          expiry = nextExpiry;
          if (result.expiresAt !== source.expiresAt) {
            current = { ...source, expiresAt: result.expiresAt };
            setLoaded({ scope, source: current });
          }
          clearTimeout(expiryTimer);
          expiryTimer = setTimeout(expire, Math.max(0, expiry - Date.now()));
          return;
        }
        expiry = nextExpiry;
        current = { ...source, expiresAt: result.expiresAt };
        setLoaded({ scope, source: current });
        schedule();
      } catch {
        if (controller.signal.aborted || current !== source) return;
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay !== undefined && Date.now() + delay < expiry)
          renewTimer = setTimeout(() => void renew(attempt + 1), delay);
        // The independent expiry timer remains authoritative, including on an older host.
      }
    }
    async function load() {
      if (!location) {
        setFailedScope(scope);
        return;
      }
      try {
        const source = await createEditorMediaSource(location, path, controller.signal);
        if (controller.signal.aborted) {
          void source.release().catch(() => undefined);
          return;
        }
        current = source;
        expiry = Date.parse(source.expiresAt);
        if (!Number.isFinite(expiry) || expiry <= Date.now()) {
          expire();
          return;
        }
        setFailedScope(null);
        setLoaded({ scope, source });
        schedule();
      } catch {
        if (!controller.signal.aborted) {
          retire();
          setLoaded(null);
          setFailedScope(scope);
        }
      }
    }
    void load();
    return retire;
  }, [location, path, scope]);
  return { source: loaded?.scope === scope ? loaded.source : null, failed: failedScope === scope };
}
