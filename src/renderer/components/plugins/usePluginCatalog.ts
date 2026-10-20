import { useEffect, useRef, useState } from "react";
import { readBridge } from "@/renderer/bridge";
import { usePlugins } from "@/renderer/state/pluginsStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { ProjectLocation } from "@/shared/contracts";
import type { PluginCatalogPayload, PluginCatalogResult } from "@/shared/contracts/pluginCatalog";

export interface PluginCatalogTarget {
  catalogId: string;
  entryName: string;
}

export function catalogEntryKey(target: PluginCatalogTarget): string {
  return JSON.stringify([target.catalogId, target.entryName]);
}

export type PluginCatalogController = ReturnType<typeof usePluginCatalog>;

async function refreshUnloadedCatalogs(
  result: PluginCatalogResult,
  update: (value: PluginCatalogResult) => void,
  active: () => boolean,
): Promise<boolean> {
  let failed = false;
  for (const catalog of result.catalogs.filter((item) => item.refreshedAt === 0)) {
    if (!active()) break;
    try {
      const value = await readBridge().pluginCatalog({ action: "refresh", catalogId: catalog.id });
      if (active()) update(value);
    } catch {
      failed = true;
    }
  }
  return failed;
}

export function usePluginCatalog(projectLocation?: ProjectLocation) {
  const [result, setResult] = useState<PluginCatalogResult>({ catalogs: [], installations: [] });
  const [busy, setBusy] = useState(true);
  const busyRef = useRef(true);
  const mounted = useRef(false);
  const [error, setError] = useState(false);
  const [review, setReview] = useState<{
    target: PluginCatalogTarget;
    inspection: NonNullable<PluginCatalogResult["inspection"]>;
  }>();

  useEffect(() => {
    mounted.current = true;
    let active = true;
    void readBridge()
      .pluginCatalog({ action: "list" })
      .then(
        async (value) => {
          if (!active) return;
          setResult(value);
          const failed = await refreshUnloadedCatalogs(value, setResult, () => active);
          if (active) setError(failed);
        },
        () => {
          if (active) setError(true);
        },
      )
      .finally(() => {
        if (active) {
          busyRef.current = false;
          setBusy(false);
        }
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, []);

  const run = async (payload: PluginCatalogPayload): Promise<PluginCatalogResult | undefined> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(false);
    if (payload.action !== "install" && payload.action !== "update") setReview(undefined);
    try {
      const removed =
        payload.action === "remove-package"
          ? Object.values(usePlugins.getState().pluginsByScope)
              .flat()
              .find((plugin) => plugin.source === "user" && plugin.name === payload.pluginName)
          : undefined;
      const value = await readBridge().pluginCatalog(payload);
      if (mounted.current) {
        setResult(value);
        setReview(undefined);
        if (payload.action === "inspect" && value.inspection) {
          setReview({
            target: { catalogId: payload.catalogId, entryName: payload.entryName },
            inspection: value.inspection,
          });
        }
      }
      if (payload.action === "list") {
        const failed = await refreshUnloadedCatalogs(value, setResult, () => mounted.current);
        if (mounted.current) setError(failed);
      }
      if ((payload.action === "install" || payload.action === "update") && value.inspection) {
        if (payload.action === "install")
          useSharedSettings.getState().installPlugin(value.inspection.plugin);
        await usePlugins
          .getState()
          .load({ rescan: true, ...(projectLocation ? { projectLocation } : {}) });
      }
      if (payload.action === "remove-package") {
        if (removed) useSharedSettings.getState().uninstallPlugin(removed);
        await usePlugins
          .getState()
          .load({ rescan: true, ...(projectLocation ? { projectLocation } : {}) });
      }
      return value;
    } catch {
      if (mounted.current) setError(true);
      return undefined;
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return { result, busy, error, review, clearReview: () => setReview(undefined), run };
}
