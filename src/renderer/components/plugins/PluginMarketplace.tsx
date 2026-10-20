import { Input, Tooltip } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { FolderOpen, Search, Settings2 } from "lucide-react";
import { useState } from "react";
import { Button, LightballTabs, OptionMenu } from "@/renderer/components/common";
import { readBridge } from "@/renderer/bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { isPluginSupportedOnHost, resolveInstalledPluginState } from "@/shared/plugins/catalog";
import {
  canonicalPluginCategory,
  PLUGIN_CATEGORY_OTHER,
  pluginCategorySortOrder,
  type PluginCategorySectionId,
} from "@/shared/plugins/categories";
import type { PluginCatalogSnapshot } from "@/shared/contracts/pluginCatalog";
import { PluginIcon } from "./PluginIcon";
import { usePluginCategoryLabel } from "./pluginCategories";
import type { LocalizedPlugin } from "./pluginCopy";
import { PluginCatalogBrowser } from "./PluginCatalogBrowser";
import {
  catalogEntryKey,
  type PluginCatalogController,
  type PluginCatalogTarget,
} from "./usePluginCatalog";

/** Rows rendered per category before its inline "Show more". */
const SECTION_ROWS = 8;

type BrowseRow =
  | {
      kind: "loaded";
      key: string;
      group: string;
      entry: LocalizedPlugin;
      sourceName: string | undefined;
      isCatalogInstalled: boolean;
    }
  | {
      kind: "catalog";
      key: string;
      group: string;
      target: PluginCatalogTarget;
      name: string;
      description: string;
      sourceName: string;
      installed: boolean;
    };

interface BrowseSection {
  key: string;
  label: string;
  order: number;
  rows: BrowseRow[];
}

export function PluginMarketplace(props: {
  plugins: readonly LocalizedPlugin[];
  hostPlatform: NodeJS.Platform;
  catalog: PluginCatalogController;
  onOpen: (pluginId: string) => void;
  onOpenCatalog: (target: PluginCatalogTarget) => void;
}) {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const [installedOnly, setInstalledOnly] = useState(false);
  const [sourceId, setSourceId] = useState("all");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const categoryLabel = usePluginCategoryLabel();
  const installedPlugins = useSharedSettings((state) => state.installedPlugins);
  const { catalogs, installations } = props.catalog.result;
  const selectedSource = catalogs.some((item) => item.id === sourceId) ? sourceId : "all";
  const normalizedQuery = query.trim().toLowerCase();
  const receiptFor = (entry: LocalizedPlugin) =>
    entry.plugin.source === "user"
      ? installations.find((item) => item.pluginName === entry.plugin.name)
      : undefined;
  const installed = props.plugins.filter(
    (entry) => receiptFor(entry) || resolveInstalledPluginState(entry.plugin, installedPlugins),
  );
  const loadedMatches = props.plugins.filter((entry) => {
    const receipt = receiptFor(entry);
    return (
      (selectedSource === "all" || receipt?.catalogId === selectedSource) &&
      (!installedOnly || receipt || resolveInstalledPluginState(entry.plugin, installedPlugins)) &&
      [
        entry.name,
        entry.description,
        entry.category,
        ...(entry.plugin.manifest.keywords ?? []),
        ...entry.skills.map((skill) => skill.name),
        ...entry.mcpServers.map((server) => server.name),
        receipt?.catalogName ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  });
  const catalogMatches = catalogs.flatMap((catalog) =>
    catalog.entries.flatMap((entry) => {
      const target = { catalogId: catalog.id, entryName: entry.name };
      const receipt = installations.find(
        (item) => item.catalogId === catalog.id && item.entryName === entry.name,
      );
      const loaded =
        receipt &&
        props.plugins.some(
          (item) => item.plugin.source === "user" && item.plugin.name === receipt.pluginName,
        );
      return !loaded &&
        (selectedSource === "all" || selectedSource === catalog.id) &&
        (!installedOnly || receipt) &&
        `${entry.name} ${entry.description} ${entry.category ?? ""} ${catalog.name}`
          .toLowerCase()
          .includes(normalizedQuery)
        ? [
            {
              target,
              catalogId: catalog.id,
              name: entry.name,
              description: entry.description,
              category: entry.category,
              sourceName: catalog.name,
              installed: !!receipt,
            },
          ]
        : [];
    }),
  );
  const orphanMatches = installations.flatMap((receipt) => {
    const loaded = props.plugins.some(
      (item) => item.plugin.source === "user" && item.plugin.name === receipt.pluginName,
    );
    const listed = catalogs.some(
      (catalog) =>
        catalog.id === receipt.catalogId &&
        catalog.entries.some((entry) => entry.name === receipt.entryName),
    );
    return !loaded &&
      !listed &&
      (selectedSource === "all" || selectedSource === receipt.catalogId) &&
      `${receipt.pluginName} ${receipt.catalogName}`.toLowerCase().includes(normalizedQuery)
      ? [
          {
            target: { catalogId: receipt.catalogId, entryName: receipt.entryName },
            name: receipt.pluginName,
            description: t`This plugin is no longer listed in a registered source.`,
            sourceName: receipt.catalogName,
            installed: true,
          },
        ]
      : [];
  });
  const available = [...catalogMatches, ...orphanMatches];
  const total = loadedMatches.length + available.length;
  // Catalogs that publish no category at all fall back to their source name
  // instead of dumping hundreds of rows into "Other".
  const categorylessCatalogs = new Set(
    catalogs
      .filter(
        (catalog) =>
          catalog.entries.length > 0 &&
          catalog.entries.every((entry) => canonicalPluginCategory(entry.category) === undefined),
      )
      .map((catalog) => catalog.id),
  );
  const browseRows: BrowseRow[] = [
    ...loadedMatches.map((entry): BrowseRow => {
      const receipt = receiptFor(entry);
      // An installed catalog package keeps the category its source published;
      // the package manifest is the fallback for bundled/manual plugins.
      const catalogEntry = receipt
        ? catalogs
            .find((catalog) => catalog.id === receipt.catalogId)
            ?.entries.find((candidate) => candidate.name === receipt.entryName)
        : undefined;
      const authoredCategory = canonicalPluginCategory(catalogEntry?.category);
      return {
        kind: "loaded",
        key: `plugin:${entry.plugin.name}`,
        group: authoredCategory
          ? `category:${authoredCategory}`
          : receipt && categorylessCatalogs.has(receipt.catalogId)
            ? `source:${receipt.catalogId}`
            : `category:${
                canonicalPluginCategory(entry.plugin.poracode.category) ?? PLUGIN_CATEGORY_OTHER
              }`,
        entry,
        sourceName: receipt?.catalogName,
        isCatalogInstalled: !!receipt,
      };
    }),
    ...catalogMatches.map((entry): BrowseRow => ({
      kind: "catalog",
      key: catalogEntryKey(entry.target),
      group: categorylessCatalogs.has(entry.catalogId)
        ? `source:${entry.catalogId}`
        : `category:${canonicalPluginCategory(entry.category) ?? PLUGIN_CATEGORY_OTHER}`,
      target: entry.target,
      name: entry.name,
      description: entry.description,
      sourceName: entry.sourceName,
      installed: entry.installed,
    })),
    ...orphanMatches.map((entry): BrowseRow => ({
      kind: "catalog",
      key: catalogEntryKey(entry.target),
      group: `category:${PLUGIN_CATEGORY_OTHER}`,
      target: entry.target,
      name: entry.name,
      description: entry.description,
      sourceName: entry.sourceName,
      installed: entry.installed,
    })),
  ];
  const sections = buildBrowseSections(browseRows, catalogs, categoryLabel, t`Other`);

  return (
    <div className="mx-auto min-h-full max-w-[880px] pb-8">
      {/* Mirrors the Agent Registry page header: the closest sibling surface
          with an actions cluster beside a wide discovery list. */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground">
              <Trans>Plugins</Trans>
            </h1>
            <p className="mt-0.5 text-xs text-muted">
              <Trans>Discover skills and MCP servers from your marketplace sources.</Trans>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Tooltip>
              <Tooltip.Trigger>
                <Button
                  isIconOnly
                  size="sm"
                  variant="tertiary"
                  aria-label={t`Plugin folder`}
                  onPress={() => void readBridge().openPluginsFolder()}
                >
                  <FolderOpen className="size-4" />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content>
                <Trans>Plugin folder</Trans>
              </Tooltip.Content>
            </Tooltip>
            <Button size="sm" variant="tertiary" onPress={() => setSourcesOpen(true)}>
              <Settings2 className="size-4" />
              <Trans>Marketplace sources</Trans>
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted" />
          <Input
            aria-label={t`Search plugins`}
            className="w-full pl-9"
            placeholder={t`Search plugins, skills, and servers...`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setExpandedSections({});
            }}
          />
        </div>
      </div>
      {installed.length > 0 && !normalizedQuery && selectedSource === "all" && !installedOnly ? (
        <section className="mb-4">
          <div className="mb-2 flex items-baseline gap-1.5 border-b border-[var(--hairline)] pb-1.5">
            <h2 className="text-xs font-semibold text-foreground">
              <Trans>Your plugins</Trans>
            </h2>
            <span className="text-[11px] tabular-nums text-muted">{installed.length}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {installed.map((entry) => (
              <span key={entry.plugin.name} title={entry.name}>
                <Button
                  isIconOnly
                  size="sm"
                  variant="tertiary"
                  aria-label={t`Open ${entry.name}`}
                  data-plugin-shortcut-id={entry.plugin.name}
                  className="size-8 rounded-lg bg-surface-secondary p-0 text-foreground transition-colors hover:bg-surface-tertiary"
                  onPress={() => props.onOpen(entry.plugin.name)}
                >
                  <PluginIcon
                    pluginId={entry.plugin.name}
                    pluginRoot={entry.plugin.root}
                    className="size-5"
                  />
                </Button>
              </span>
            ))}
          </div>
        </section>
      ) : null}
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-3 pb-2">
        <LightballTabs
          active={installedOnly ? "installed" : "all"}
          ariaLabel={t`Filter plugins`}
          onChange={(value) => {
            setInstalledOnly(value === "installed");
            setExpandedSections({});
          }}
          tabs={[
            { id: "all", label: t`All plugins` },
            { id: "installed", label: t`Installed` },
          ]}
        />
        <OptionMenu
          value={selectedSource}
          placeholder={t`Marketplace source`}
          options={[
            { id: "all", label: t`All sources` },
            ...catalogs.map((catalog) => ({ id: catalog.id, label: catalog.name })),
          ]}
          onChange={(value) => {
            setSourceId(value);
            setExpandedSections({});
          }}
        />
      </div>
      {props.catalog.busy ? (
        <p role="status" className="mb-3 text-xs text-muted">
          <Trans>Loading plugins and marketplaces…</Trans>
        </p>
      ) : null}
      {props.catalog.error && !sourcesOpen ? (
        <div role="alert" className="mb-3 text-xs text-warning">
          <Trans>
            Could not manage this plugin or marketplace. Check the source, compatibility, and local
            file changes, then try again.
          </Trans>
          <Button
            size="sm"
            variant="ghost"
            isDisabled={props.catalog.busy}
            onPress={() => void props.catalog.run({ action: "list" })}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}
      {!total ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted">
            {installedOnly && !normalizedQuery ? (
              <Trans>No installed plugins yet.</Trans>
            ) : (
              <Trans>No plugins match your search.</Trans>
            )}
          </p>
          {normalizedQuery ? (
            <Button
              className="mt-2"
              size="sm"
              variant="ghost"
              onPress={() => {
                setQuery("");
                setExpandedSections({});
              }}
            >
              <Trans>Clear search</Trans>
            </Button>
          ) : null}
        </div>
      ) : null}
      {sections.map((section) => {
        const expanded = expandedSections[section.key] === true;
        const visible = expanded ? section.rows : section.rows.slice(0, SECTION_ROWS);
        const hidden = section.rows.length - visible.length;
        return (
          <section key={section.key} className="mb-4">
            <div className="mb-1.5 flex items-baseline gap-1.5 border-b border-[var(--hairline)] pb-1.5">
              <h2 className="text-xs font-semibold text-foreground">{section.label}</h2>
              <span className="text-[11px] tabular-nums text-muted">{section.rows.length}</span>
            </div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 md:grid-cols-2">
              {visible.map((row) =>
                row.kind === "loaded" ? (
                  <PluginRow
                    key={row.key}
                    entry={row.entry}
                    hostPlatform={props.hostPlatform}
                    sourceName={row.sourceName}
                    isCatalogInstalled={row.isCatalogInstalled}
                    onOpen={props.onOpen}
                  />
                ) : (
                  <CatalogRow key={row.key} entry={row} onOpen={props.onOpenCatalog} />
                ),
              )}
            </div>
            {hidden > 0 ? (
              <div className="mt-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  aria-label={`${t`Show more`}: ${section.label}`}
                  onPress={() =>
                    setExpandedSections((previous) => ({ ...previous, [section.key]: true }))
                  }
                >
                  <Trans>Show more</Trans>
                </Button>
              </div>
            ) : null}
          </section>
        );
      })}
      <PluginCatalogBrowser
        controller={props.catalog}
        isOpen={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
      />
    </div>
  );
}

function buildBrowseSections(
  rows: BrowseRow[],
  catalogs: readonly PluginCatalogSnapshot[],
  categoryLabel: (id: PluginCategorySectionId) => string,
  otherLabel: string,
): BrowseSection[] {
  const byKey = new Map<string, BrowseSection>();
  const catalogOrder = new Map(catalogs.map((catalog, index) => [catalog.id, index]));
  for (const row of rows) {
    let section = byKey.get(row.group);
    if (!section) {
      if (row.group.startsWith("source:")) {
        const catalogId = row.group.slice("source:".length);
        section = {
          key: row.group,
          label: catalogs.find((catalog) => catalog.id === catalogId)?.name ?? otherLabel,
          order: 100,
          rows: [],
        };
      } else {
        const id = row.group.slice("category:".length) as PluginCategorySectionId;
        section = {
          key: row.group,
          label: categoryLabel(id),
          order: pluginCategorySortOrder(id),
          rows: [],
        };
      }
      byKey.set(row.group, section);
    }
    section.rows.push(row);
  }
  return [...byKey.values()].sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order;
    if (left.key.startsWith("source:") && right.key.startsWith("source:")) {
      return (
        (catalogOrder.get(left.key.slice("source:".length)) ?? 0) -
        (catalogOrder.get(right.key.slice("source:".length)) ?? 0)
      );
    }
    return left.label.localeCompare(right.label);
  });
}

function CatalogRow(props: {
  entry: Extract<BrowseRow, { kind: "catalog" }>;
  onOpen: (target: PluginCatalogTarget) => void;
}) {
  const { t } = useLingui();
  const entry = props.entry;
  return (
    <article
      data-plugin-row
      className="flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-[var(--row-hover)] focus-within:bg-[var(--row-hover)]"
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-secondary">
        <PluginIcon
          pluginId={entry.name}
          target={{ type: "catalog", ...entry.target }}
          className="size-5"
        />
      </div>
      <div className="min-w-0 flex-1">
        <Button
          size="sm"
          variant="ghost"
          data-marketplace-id={catalogEntryKey(entry.target)}
          className="h-auto min-h-0 max-w-full justify-start truncate !p-0 text-[13px] font-semibold leading-[17px]"
          onPress={() => props.onOpen(entry.target)}
        >
          {entry.name}
        </Button>
        <p className="truncate text-[11px] leading-[15px] text-muted" title={entry.description}>
          {entry.description}
        </p>
        <p className="truncate text-[10px] leading-[13px] text-muted">{entry.sourceName}</p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="max-w-32 shrink-0"
        aria-label={t`Review ${entry.name} from ${entry.sourceName}`}
        onPress={() => props.onOpen(entry.target)}
      >
        {entry.installed ? <Trans>Manage</Trans> : <Trans>Review</Trans>}
      </Button>
    </article>
  );
}

function PluginRow(props: {
  entry: LocalizedPlugin;
  hostPlatform: NodeJS.Platform;
  sourceName: string | undefined;
  isCatalogInstalled: boolean;
  onOpen: (name: string) => void;
}) {
  const installPlugin = useSharedSettings((state) => state.installPlugin);
  const { entry } = props;
  const plugin = entry.plugin;
  const installed = useSharedSettings(
    (state) =>
      props.isCatalogInstalled ||
      resolveInstalledPluginState(plugin, state.installedPlugins) !== undefined,
  );
  const supported = isPluginSupportedOnHost(plugin, props.hostPlatform);
  const serverCount = entry.mcpServers.length;
  const titleId = `plugin-${plugin.name}-title`;
  const actionId = `plugin-${plugin.name}-action`;
  return (
    <article
      data-plugin-row
      className="flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-[var(--row-hover)] focus-within:bg-[var(--row-hover)]"
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-foreground">
        <PluginIcon pluginId={plugin.name} pluginRoot={plugin.root} className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <Button
          id={titleId}
          data-plugin-id={plugin.name}
          data-marketplace-id={`plugin:${plugin.name}`}
          size="sm"
          variant="ghost"
          className="h-auto min-h-0 max-w-full justify-start truncate !p-0 text-[13px] font-semibold leading-[17px]"
          onPress={() => props.onOpen(plugin.name)}
        >
          {entry.name}
        </Button>
        <p className="truncate text-[11px] leading-[15px] text-muted" title={entry.description}>
          {entry.description}
        </p>
        <p className="truncate text-[10px] leading-[13px] text-muted">
          {props.sourceName ??
            (plugin.source === "project" ? (
              <Trans>Project</Trans>
            ) : plugin.source === "user" ? (
              <Trans>External</Trans>
            ) : (
              <Trans>Built-in</Trans>
            ))}
          {" · "}
          <Plural value={entry.skills.length} one="# skill" other="# skills" />
          {" · "}
          <Plural value={serverCount} one="# server" other="# servers" />
        </p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-auto min-h-8 max-w-32 shrink-0 whitespace-normal py-1"
        isDisabled={!supported}
        aria-labelledby={`${titleId} ${actionId}`}
        onPress={() => {
          if (!installed) installPlugin(plugin);
          props.onOpen(plugin.name);
        }}
      >
        <span id={actionId}>
          {!supported ? (
            <Trans>Unavailable on this device</Trans>
          ) : installed ? (
            <Trans>Manage</Trans>
          ) : (
            <Trans>Install</Trans>
          )}
        </span>
      </Button>
    </article>
  );
}
