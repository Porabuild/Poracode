import { useEffect, useEffectEvent, useRef, useState } from "react";
import { readBridge } from "@/renderer/bridge";
import { usePlugins } from "@/renderer/state/pluginsStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { LoadedPlugin, ProjectLocation } from "@/shared/contracts";
import type { PluginCatalogPayload, PluginCatalogResult } from "@/shared/contracts/pluginCatalog";

export interface PluginCatalogTarget {
  catalogId: string;
  entryName: string;
}

export function catalogEntryKey(target: PluginCatalogTarget): string {
  return JSON.stringify([target.catalogId, target.entryName]);
}

export type PluginCatalogController = ReturnType<typeof usePluginCatalog>;

/** The host operations a catalog browser needs, independent of transport. */
export interface PluginCatalogHost {
  pluginCatalog(payload: PluginCatalogPayload): Promise<PluginCatalogResult>;
  installPlugin(plugin: LoadedPlugin): void | Promise<void>;
  uninstallPlugin(plugin: LoadedPlugin): void | Promise<void>;
  findPlugin(pluginName: string): LoadedPlugin | undefined;
  reloadPlugins(): Promise<void>;
}

async function refreshUnloadedCatalogs(
  result: PluginCatalogResult,
  update: (value: PluginCatalogResult) => void,
  active: () => boolean,
  pluginCatalog: PluginCatalogHost["pluginCatalog"],
): Promise<boolean> {
  let failed = false;
  for (const catalog of result.catalogs.filter((item) => item.refreshedAt === 0)) {
    if (!active()) break;
    try {
      const value = await pluginCatalog({ action: "refresh", catalogId: catalog.id });
      if (active()) update(value);
    } catch {
      failed = true;
    }
  }
  return failed;
}

/**
 * Marketplace state for one host. `hostKey` names the machine so switching
 * hosts reloads the catalog and clears any reviewed package.
 */
export function usePluginCatalog(
  projectLocation?: ProjectLocation,
  host?: PluginCatalogHost,
  hostKey = "local",
) {
  const [result, setResult] = useState<PluginCatalogResult>({ catalogs: [], installations: [] });
  const [busy, setBusy] = useState(true);
  const busyRef = useRef(true);
  const epochRef = useRef(0);
  const [error, setError] = useState(false);
  const [review, setReview] = useState<{
    target: PluginCatalogTarget;
    inspection: NonNullable<PluginCatalogResult["inspection"]>;
  }>();

  const activeHost: PluginCatalogHost = host ?? {
    pluginCatalog: (payload: PluginCatalogPayload) => readBridge().pluginCatalog(payload),
    installPlugin: (plugin: LoadedPlugin) => useSharedSettings.getState().installPlugin(plugin),
    uninstallPlugin: (plugin: LoadedPlugin) => useSharedSettings.getState().uninstallPlugin(plugin),
    findPlugin: (pluginName: string) =>
      Object.values(usePlugins.getState().pluginsByScope)
        .flat()
        .find((plugin) => plugin.source === "user" && plugin.name === pluginName),
    reloadPlugins: () =>
      usePlugins.getState().load({ rescan: true, ...(projectLocation ? { projectLocation } : {}) }),
  };

  const loadInitial = useEffectEvent((epoch: number, _targetHostKey: string) => {
    const isCurrent = () => epochRef.current === epoch;
    const source = activeHost;
    setBusy(true);
    busyRef.current = true;
    setResult({ catalogs: [], installations: [] });
    setReview(undefined);
    setError(false);
    void source
      .pluginCatalog({ action: "list" })
      .then(
        async (value) => {
          if (!isCurrent()) return;
          setResult(value);
          const failed = await refreshUnloadedCatalogs(
            value,
            setResult,
            isCurrent,
            source.pluginCatalog,
          );
          if (isCurrent()) setError(failed);
        },
        () => {
          if (isCurrent()) setError(true);
        },
      )
      .finally(() => {
        if (isCurrent()) {
          busyRef.current = false;
          setBusy(false);
        }
      });
  });

  useEffect(() => {
    const epoch = ++epochRef.current;
    loadInitial(epoch, hostKey);
    return () => {
      epochRef.current += 1;
    };
  }, [hostKey]);

  const run = async (payload: PluginCatalogPayload): Promise<PluginCatalogResult | undefined> => {
    if (busyRef.current) return;
    const epoch = epochRef.current;
    const isCurrent = () => epochRef.current === epoch;
    busyRef.current = true;
    setBusy(true);
    setError(false);
    if (payload.action !== "install" && payload.action !== "update") setReview(undefined);
    try {
      const source = activeHost;
      const removed =
        payload.action === "remove-package" ? source.findPlugin(payload.pluginName) : undefined;
      const value = await source.pluginCatalog(payload);
      if (!isCurrent()) return undefined;
      setResult(value);
      setReview(undefined);
      if (payload.action === "inspect" && value.inspection) {
        setReview({
          target: { catalogId: payload.catalogId, entryName: payload.entryName },
          inspection: value.inspection,
        });
      }
      if (payload.action === "list") {
        const failed = await refreshUnloadedCatalogs(
          value,
          setResult,
          isCurrent,
          source.pluginCatalog,
        );
        if (isCurrent()) setError(failed);
      }
      if ((payload.action === "install" || payload.action === "update") && value.inspection) {
        if (payload.action === "install") await source.installPlugin(value.inspection.plugin);
        if (isCurrent()) await source.reloadPlugins();
      }
      if (payload.action === "remove-package") {
        if (removed) await source.uninstallPlugin(removed);
        if (isCurrent()) await source.reloadPlugins();
      }
      return isCurrent() ? value : undefined;
    } catch {
      if (isCurrent()) setError(true);
      return undefined;
    } finally {
      if (isCurrent()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };

  return { result, busy, error, review, clearReview: () => setReview(undefined), run };
}
