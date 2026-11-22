import { useEffect, useRef, useState } from "react";
import { toast } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { Button, PixelLoader } from "@/renderer/components/common";
import { PluginDetail } from "@/renderer/components/plugins/PluginDetail";
import { PluginMarketplace } from "@/renderer/components/plugins/PluginMarketplace";
import { PluginCatalogDetail } from "@/renderer/components/plugins/PluginCatalogDetail";
import {
  catalogEntryKey,
  usePluginCatalog,
  type PluginCatalogController,
  type PluginCatalogHost,
  type PluginCatalogTarget,
} from "@/renderer/components/plugins/usePluginCatalog";
import {
  useLocalizedPluginCatalog,
  usePluginLocalizer,
} from "@/renderer/components/plugins/pluginCopy";
import { usePluginCategoryLabel } from "@/renderer/components/plugins/pluginCategories";
import {
  PluginHostProvider,
  type PluginHost,
} from "@/renderer/components/plugins/PluginHostContext";
import { pluginScopeKey, usePlugins } from "@/renderer/state/pluginsStore";
import { resolveProjectIdForView } from "@/renderer/actions/currentProject";
import { useAppStore } from "@/renderer/state/appStore";
import { isHomeProject } from "@/shared/homeScope";
import { friendlyError } from "@/shared/messages";
import { canonicalPluginCategory } from "@/shared/plugins/categories";
import {
  installPlugin as addInstalledPlugin,
  setInstalledPluginEnabled,
  setPluginMcpServerEnabled,
  setPluginSkillEnabled,
  uninstallPlugin as removeInstalledPlugin,
} from "@/shared/plugins/catalog";
import {
  listPluginsResultSchema,
  mcpOauthWaitResultSchema,
  pluginAccountsResultSchema,
  pluginCatalogResultSchema,
  type BuiltInMcpServerDisabled,
  type InstalledPlugins,
  type LoadedPlugin,
  type McpOauthWaitResult,
  type PluginAccountsPayload,
  type PluginAccountsResult,
  type PluginCatalogPayload,
  type PluginCatalogResult,
  type ProjectLocation,
} from "@/shared/contracts";
import type { RemoteProcedureName } from "@/shared/remote";
import { getProjectFsPath } from "@/shared/wsl";
import { readBridge } from "@/renderer/bridge";
import { unprojectProjectLocation } from "@/renderer/remoteProcedureRouter";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import {
  editPairedHostSettings,
  refreshPairedHostSettings,
  usePairedHostSettings,
} from "@/renderer/state/pairedHostSettings";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { currentRemoteServerGeneration } from "@/renderer/state/remoteServers/eventSocketRegistry";

export function PluginsSettings(props: {
  /** Paired host to manage; absent means this client's own host. */
  connectionKey?: string;
  hostPlatform?: NodeJS.Platform;
}) {
  return props.connectionKey ? (
    <RemotePluginsSettings
      connectionKey={props.connectionKey}
      {...(props.hostPlatform ? { hostPlatform: props.hostPlatform } : {})}
    />
  ) : (
    <LocalPluginsSettings />
  );
}

/**
 * Returns the active workspace's project location only when it belongs to the
 * addressed host (`undefined` for local, or a paired `connectionKey`). Home
 * has no repository of its own, so it sees app-global plugin roots only.
 */
function useWorkspaceProjectLocation(connectionKey?: string): ProjectLocation | undefined {
  return useAppStore((state) => {
    const projectId = resolveProjectIdForView(state.view, state.threads, state.focusedPaneId);
    const project = state.projects.find((item) => item.id === projectId);
    if (!project || isHomeProject(project)) return undefined;
    const owner = remoteOwner(project);
    return connectionKey
      ? owner?.desktopId === connectionKey
        ? project.location
        : undefined
      : !owner
        ? project.location
        : undefined;
  });
}

function LocalPluginsSettings() {
  const projectLocation = useWorkspaceProjectLocation();
  const scopeKey = pluginScopeKey(projectLocation);
  const plugins = useLocalizedPluginCatalog(projectLocation);
  const loadPlugins = usePlugins((state) => state.load);
  const loaded = usePlugins((state) => state.loadedScopes[scopeKey] === true);
  const error = usePlugins((state) => state.error);
  const catalog = usePluginCatalog(projectLocation);
  const hostPlatform = readBridge().platform;

  const rescanLocal = () => {
    void loadPlugins({ rescan: true, ...(projectLocation ? { projectLocation } : {}) });
  };

  // Packages live on disk and can be added while the app runs, so rescan every
  // time the marketplace opens rather than trusting the first load.
  useEffect(() => {
    void loadPlugins({ rescan: true, ...(projectLocation ? { projectLocation } : {}) });
  }, [loadPlugins, projectLocation]);

  return (
    <PluginsBody
      plugins={plugins}
      hostPlatform={hostPlatform}
      catalog={catalog}
      loading={!loaded}
      loadError={error !== undefined}
      onRetry={rescanLocal}
    />
  );
}

function RemotePluginsSettings(props: { connectionKey: string; hostPlatform?: NodeJS.Platform }) {
  const { connectionKey } = props;
  const status = useRemoteServersStore((state) => state.runtime[connectionKey]?.status);
  const paired = usePairedHostSettings(connectionKey);
  const generation = currentRemoteServerGeneration(connectionKey);

  if (status !== "online") {
    return (
      <div className="flex min-h-32 items-center justify-center text-sm text-muted" role="status">
        {status === undefined || status === "connecting" ? (
          <Trans>Connecting…</Trans>
        ) : (
          <Trans>Offline</Trans>
        )}
      </div>
    );
  }
  if (paired === undefined) {
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
  if (paired.error !== undefined || !paired.settings) {
    return (
      <div
        className="mx-auto my-6 max-w-[880px] rounded-xl border border-danger/40 bg-danger/10 px-3 py-3 text-sm text-danger"
        role="alert"
      >
        <p>
          <Trans>Couldn't load plugins.</Trans>
        </p>
        <Button
          className="mt-2"
          size="sm"
          variant="tertiary"
          onPress={() => refreshPairedHostSettings(connectionKey, generation)}
        >
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  }
  const installedPlugins = paired.settings.installedPlugins;
  // Older hosts expose neither `installedPlugins` nor the plugin procedures.
  // Enabling a package is host-owned, so there is no safe local fallback.
  if (installedPlugins === undefined) {
    return (
      <p className="py-8 text-center text-sm text-muted" role="status">
        <Trans>Update the remote server first.</Trans>
      </p>
    );
  }

  return (
    <ConnectedRemotePluginsSettings
      key={`${connectionKey}:${generation}`}
      connectionKey={connectionKey}
      installedPlugins={installedPlugins}
      disabledBuiltInMcpServers={paired.settings.disabledBuiltInMcpServers}
      {...(props.hostPlatform ? { hostPlatform: props.hostPlatform } : {})}
    />
  );
}

function ConnectedRemotePluginsSettings(props: {
  connectionKey: string;
  installedPlugins: InstalledPlugins;
  disabledBuiltInMcpServers: BuiltInMcpServerDisabled;
  hostPlatform?: NodeJS.Platform;
}) {
  const { connectionKey, installedPlugins, disabledBuiltInMcpServers } = props;
  const withClient = useRemoteServersStore((state) => state.withClient);
  const localize = usePluginLocalizer();
  const [inventory, setInventory] = useState<{
    plugins: LoadedPlugin[];
    loading: boolean;
    error: boolean;
  }>({ plugins: [], loading: true, error: false });
  const requestRef = useRef(0);

  const projectLocation = useWorkspaceProjectLocation(connectionKey);
  const hostProjectLocation = projectLocation
    ? unprojectProjectLocation(projectLocation)
    : undefined;
  const projectFsPath = hostProjectLocation ? getProjectFsPath(hostProjectLocation) : undefined;
  const listPayload = hostProjectLocation ? { projectLocation: hostProjectLocation } : {};

  const callRemote = <Result,>(
    procedure: RemoteProcedureName,
    payload: unknown,
    schema: { parse(value: unknown): Result },
  ): Promise<Result> =>
    withClient(connectionKey, (client) => client.callRemoteProcedure(procedure, payload)).then(
      (value) => schema.parse(value),
    );

  const loadInventory = async (): Promise<void> => {
    const request = ++requestRef.current;
    setInventory((current) => ({ ...current, loading: true }));
    try {
      const result = await callRemote("refreshPlugins", listPayload, listPluginsResultSchema);
      if (request === requestRef.current) {
        setInventory({ plugins: result.plugins, loading: false, error: false });
      }
    } catch (error) {
      if (request === requestRef.current) {
        setInventory((current) => ({ ...current, loading: false, error: true }));
      }
      throw error;
    }
  };

  useEffect(() => {
    const request = ++requestRef.current;
    const payload = projectLocation
      ? { projectLocation: unprojectProjectLocation(projectLocation) }
      : {};
    void withClient(connectionKey, (client) =>
      client.callRemoteProcedure("refreshPlugins", payload),
    )
      .then((value) => listPluginsResultSchema.parse(value))
      .then(
        (result) => {
          if (request === requestRef.current) {
            setInventory({ plugins: result.plugins, loading: false, error: false });
          }
        },
        () => {
          if (request === requestRef.current) {
            setInventory((current) => ({ ...current, loading: false, error: true }));
          }
        },
      );
  }, [connectionKey, projectLocation, withClient]);

  const applyInstalledPlugins = (
    compute: (current: InstalledPlugins) => InstalledPlugins,
  ): Promise<void> =>
    editPairedHostSettings(connectionKey, (current) => {
      const installed = current.installedPlugins;
      if (installed === undefined) return undefined;
      const next = compute(installed);
      return next === installed ? undefined : { installedPlugins: next };
    });

  const applyWithToast = (
    compute: (current: InstalledPlugins) => InstalledPlugins,
  ): Promise<void> =>
    applyInstalledPlugins(compute).catch((error: unknown) => {
      toast.danger(friendlyError(error));
    });

  const plugins = inventory.plugins.map(localize);
  const pluginHost: PluginHost = {
    installedPlugins,
    disabledBuiltInMcpServers,
    isRemote: true,
    canManageLocalHelpers: false,
    canStartOauth: false,
    ...(projectFsPath ? { projectFsPath } : {}),
    pluginCatalog: (payload: PluginCatalogPayload): Promise<PluginCatalogResult> =>
      callRemote("pluginCatalog", payload, pluginCatalogResultSchema),
    pluginAccounts: (payload: PluginAccountsPayload): Promise<PluginAccountsResult> =>
      callRemote("pluginAccounts", payload, pluginAccountsResultSchema),
    waitMcpServerOauth: (flowId: string): Promise<McpOauthWaitResult> =>
      callRemote("waitMcpServerOauth", { flowId }, mcpOauthWaitResultSchema),
    installPlugin: (plugin) => applyWithToast((current) => addInstalledPlugin(current, plugin)),
    enablePlugin: (plugin) =>
      applyWithToast((current) =>
        setInstalledPluginEnabled(addInstalledPlugin(current, plugin), plugin, true),
      ),
    uninstallPlugin: (plugin) =>
      applyWithToast((current) => removeInstalledPlugin(current, plugin.name)),
    setPluginEnabled: (plugin, enabled) =>
      applyWithToast((current) => setInstalledPluginEnabled(current, plugin, enabled)),
    setPluginSkillEnabled: (plugin, skillId, enabled) =>
      applyWithToast((current) => setPluginSkillEnabled(current, plugin, skillId, enabled)),
    setPluginMcpServerEnabled: (plugin, serverName, enabled) =>
      applyWithToast((current) => setPluginMcpServerEnabled(current, plugin, serverName, enabled)),
  };
  const catalogHost: PluginCatalogHost = {
    pluginCatalog: pluginHost.pluginCatalog,
    installPlugin: (plugin) =>
      applyInstalledPlugins((current) => addInstalledPlugin(current, plugin)),
    uninstallPlugin: (plugin) =>
      applyInstalledPlugins((current) => removeInstalledPlugin(current, plugin.name)),
    findPlugin: (pluginName) =>
      inventory.plugins.find((plugin) => plugin.source === "user" && plugin.name === pluginName),
    reloadPlugins: () => loadInventory(),
  };
  const catalog = usePluginCatalog(undefined, catalogHost, connectionKey);

  return (
    <PluginHostProvider host={pluginHost}>
      <PluginsBody
        plugins={plugins}
        hostPlatform={props.hostPlatform ?? "linux"}
        catalog={catalog}
        loading={inventory.loading}
        loadError={inventory.error}
        onRetry={() => void loadInventory().catch(() => undefined)}
      />
    </PluginHostProvider>
  );
}

function PluginsBody(props: {
  plugins: ReturnType<typeof useLocalizedPluginCatalog>;
  hostPlatform: NodeJS.Platform;
  catalog: PluginCatalogController;
  loading: boolean;
  loadError: boolean;
  onRetry: () => void;
}) {
  const [selection, setSelection] = useState<
    { type: "plugin"; id: string } | { type: "catalog"; target: PluginCatalogTarget }
  >();
  const returnFocusPluginId = useRef<string | undefined>(undefined);
  const plugins = props.plugins;
  const selectedPlugin =
    selection?.type === "plugin"
      ? plugins.find((entry) => entry.plugin.name === selection.id)
      : undefined;
  const receipt =
    selectedPlugin?.plugin.source === "user"
      ? props.catalog.result.installations.find(
          (item) => item.pluginName === selectedPlugin.plugin.name,
        )
      : undefined;
  const categoryLabel = usePluginCategoryLabel();
  const receiptCatalogEntry = receipt
    ? props.catalog.result.catalogs
        .find((item) => item.id === receipt.catalogId)
        ?.entries.find((entry) => entry.name === receipt.entryName)
    : undefined;
  const receiptCategory = receiptCatalogEntry?.category;
  const canonicalReceiptCategory = canonicalPluginCategory(receiptCategory);
  const receiptCategoryLabel = canonicalReceiptCategory
    ? categoryLabel(canonicalReceiptCategory)
    : receiptCategory;

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

  if (props.loading && plugins.length === 0) {
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
    props.catalog.clearReview();
    setSelection({ type: "plugin", id: pluginId });
  };
  const openCatalog = (target: PluginCatalogTarget) => {
    returnFocusPluginId.current = catalogEntryKey(target);
    props.catalog.clearReview();
    setSelection({ type: "catalog", target });
  };

  return (
    <div data-settings-anchor="plugins.marketplace">
      {props.loadError ? (
        <div
          className="mx-auto mb-4 max-w-[880px] rounded-xl border border-danger/40 bg-danger/10 px-3 py-3 text-sm text-danger"
          role="alert"
        >
          <p>
            <Trans>Couldn't load plugins.</Trans>
          </p>
          <Button className="mt-2" size="sm" variant="tertiary" onPress={props.onRetry}>
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}
      <div hidden={selectedPlugin !== undefined || selection?.type === "catalog"}>
        <PluginMarketplace
          plugins={plugins}
          hostPlatform={props.hostPlatform}
          catalog={props.catalog}
          onOpen={openPlugin}
          onOpenCatalog={openCatalog}
        />
      </div>
      {selectedPlugin ? (
        <PluginDetail
          plugin={selectedPlugin}
          hostPlatform={props.hostPlatform}
          onBack={() => setSelection(undefined)}
          {...(receipt
            ? {
                catalogPackage: {
                  receipt,
                  busy: props.catalog.busy,
                  error: props.catalog.error,
                  ...(receiptCategoryLabel ? { entryCategory: receiptCategoryLabel } : {}),
                  onReview: () =>
                    openCatalog({ catalogId: receipt.catalogId, entryName: receipt.entryName }),
                  onRemove: async () => {
                    const value = await props.catalog.run({
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
          controller={props.catalog}
          plugins={plugins}
          hostPlatform={props.hostPlatform}
          onBack={() => {
            props.catalog.clearReview();
            setSelection(undefined);
          }}
          onOpen={openPlugin}
        />
      ) : null}
    </div>
  );
}
