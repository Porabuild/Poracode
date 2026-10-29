import { useEffect, useRef, useState } from "react";
import { Trans } from "@lingui/react/macro";
import { Button, PixelLoader } from "@/renderer/components/common";
import { PluginDetail } from "@/renderer/components/plugins/PluginDetail";
import { PluginMarketplace } from "@/renderer/components/plugins/PluginMarketplace";
import { PluginCatalogDetail } from "@/renderer/components/plugins/PluginCatalogDetail";
import {
  catalogEntryKey,
  usePluginCatalog,
  type PluginCatalogTarget,
} from "@/renderer/components/plugins/usePluginCatalog";
import { useLocalizedPluginCatalog } from "@/renderer/components/plugins/pluginCopy";
import { usePluginCategoryLabel } from "@/renderer/components/plugins/pluginCategories";
import { pluginScopeKey, usePlugins } from "@/renderer/state/pluginsStore";
import { resolveProjectIdForView } from "@/renderer/actions/currentProject";
import { useAppStore } from "@/renderer/state/appStore";
import { isHomeProject } from "@/shared/homeScope";
import { canonicalPluginCategory } from "@/shared/plugins/categories";
import { readBridge } from "@/renderer/bridge";

export function PluginsSettings() {
  // The open workspace decides which project packages are in scope; the home
  // scope has no repository of its own, so it sees the app-global roots only.
  const workspaceProject = useAppStore((state) => {
    const projectId = resolveProjectIdForView(state.view, state.threads, state.focusedPaneId);
    const project = state.projects.find((item) => item.id === projectId);
    return isHomeProject(project) ? undefined : project;
  });
  const projectLocation = workspaceProject?.location;
  const plugins = useLocalizedPluginCatalog(projectLocation);
  const loadPlugins = usePlugins((state) => state.load);
  const loaded = usePlugins(
    (state) => state.loadedScopes[pluginScopeKey(projectLocation)] === true,
  );
  const error = usePlugins((state) => state.error);
  const catalog = usePluginCatalog(projectLocation);
  const [selection, setSelection] = useState<
    { type: "plugin"; id: string } | { type: "catalog"; target: PluginCatalogTarget }
  >();
  const returnFocusPluginId = useRef<string | undefined>(undefined);
  const selectedPlugin =
    selection?.type === "plugin"
      ? plugins.find((entry) => entry.plugin.name === selection.id)
      : undefined;
  const receipt =
    selectedPlugin?.plugin.source === "user"
      ? catalog.result.installations.find((item) => item.pluginName === selectedPlugin.plugin.name)
      : undefined;
  const categoryLabel = usePluginCategoryLabel();
  const receiptCatalogEntry = receipt
    ? catalog.result.catalogs
        .find((item) => item.id === receipt.catalogId)
        ?.entries.find((entry) => entry.name === receipt.entryName)
    : undefined;
  const receiptCategory = receiptCatalogEntry?.category;
  const canonicalReceiptCategory = canonicalPluginCategory(receiptCategory);
  const receiptCategoryLabel = canonicalReceiptCategory
    ? categoryLabel(canonicalReceiptCategory)
    : receiptCategory;
  const hostPlatform = readBridge().platform;

  // Packages live on disk and can be added while the app runs, so rescan every
  // time the marketplace opens rather than trusting the first load.
  useEffect(() => {
    void loadPlugins({ rescan: true, ...(projectLocation ? { projectLocation } : {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rescan per project scope, not per location object identity.
  }, [loadPlugins, pluginScopeKey(projectLocation)]);

  useEffect(() => {
    const pluginId = returnFocusPluginId.current;
    if (selection !== undefined || pluginId === undefined) return;
    const marketplace = document.querySelector<HTMLElement>(
      '[data-settings-anchor="plugins.marketplace"]',
    );
    const target = [
      ...(marketplace?.querySelectorAll<HTMLElement>("[data-marketplace-id]") ?? []),
    ].find((element) => element.dataset.marketplaceId === pluginId);
    (target ?? marketplace?.querySelector<HTMLElement>('input[type="search"], input'))?.focus();
    returnFocusPluginId.current = undefined;
  }, [selection]);

  if (!loaded) {
    return (
      <div
        className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted"
        role="status"
      >
        <PixelLoader size="xs" />
        <Trans>Loading plugins…</Trans>
      </div>
    );
  }

  const openPlugin = (pluginId: string) => {
    returnFocusPluginId.current = `plugin:${pluginId}`;
    catalog.clearReview();
    setSelection({ type: "plugin", id: pluginId });
  };
  const openCatalog = (target: PluginCatalogTarget) => {
    returnFocusPluginId.current = catalogEntryKey(target);
    catalog.clearReview();
    setSelection({ type: "catalog", target });
  };

  return (
    <div data-settings-anchor="plugins.marketplace">
      {error ? (
        <div
          className="mx-auto mb-4 max-w-[880px] rounded-xl border border-danger/40 bg-danger/10 px-3 py-3 text-sm text-danger"
          role="alert"
        >
          <p>
            <Trans>Couldn't load plugins.</Trans>
          </p>
          <Button
            className="mt-2"
            size="sm"
            variant="tertiary"
            onPress={() =>
              void loadPlugins({ rescan: true, ...(projectLocation ? { projectLocation } : {}) })
            }
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}
      <div hidden={selectedPlugin !== undefined || selection?.type === "catalog"}>
        <PluginMarketplace
          plugins={plugins}
          hostPlatform={hostPlatform}
          catalog={catalog}
          onOpen={openPlugin}
          onOpenCatalog={openCatalog}
        />
      </div>
      {selectedPlugin ? (
        <PluginDetail
          plugin={selectedPlugin}
          hostPlatform={hostPlatform}
          onBack={() => setSelection(undefined)}
          {...(receipt
            ? {
                catalogPackage: {
                  receipt,
                  busy: catalog.busy,
                  error: catalog.error,
                  ...(receiptCategoryLabel ? { entryCategory: receiptCategoryLabel } : {}),
                  onReview: () =>
                    openCatalog({ catalogId: receipt.catalogId, entryName: receipt.entryName }),
                  onRemove: async () => {
                    const value = await catalog.run({
                      action: "remove-package",
                      pluginName: receipt.pluginName,
                    });
                    if (value) setSelection(undefined);
                  },
                },
              }
            : {})}
        />
      ) : null}
      {selection?.type === "catalog" ? (
        <PluginCatalogDetail
          key={catalogEntryKey(selection.target)}
          target={selection.target}
          controller={catalog}
          plugins={plugins}
          hostPlatform={hostPlatform}
          onBack={() => {
            catalog.clearReview();
            setSelection(undefined);
          }}
          onOpen={openPlugin}
        />
      ) : null}
    </div>
  );
}
