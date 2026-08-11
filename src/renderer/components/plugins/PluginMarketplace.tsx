import { Card, Input } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { FolderOpen, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/renderer/components/common";
import { readBridge } from "@/renderer/bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { isPluginSupportedOnHost } from "@/shared/plugins/catalog";
import type { PluginCategory } from "@/shared/contracts";
import { PluginIcon } from "./PluginIcon";
import { PluginTag } from "./PluginTag";
import type { LocalizedPlugin } from "./pluginCopy";

/** Section order for the browse view. Featured is derived, not a category. */
const CATEGORY_ORDER: PluginCategory[] = [
  "developer-tools",
  "communication",
  "automation",
  "productivity",
];

export function PluginMarketplace(props: {
  plugins: readonly LocalizedPlugin[];
  hostPlatform: NodeJS.Platform;
  onOpen: (pluginId: string) => void;
}) {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const installedPlugins = useSharedSettings((state) => state.installedPlugins);
  const normalizedQuery = query.trim().toLowerCase();

  const matches = props.plugins.filter((entry) =>
    [
      entry.name,
      entry.description,
      entry.category,
      ...(entry.plugin.manifest.keywords ?? []),
      ...entry.skills.map((skill) => skill.name),
      ...entry.mcpServers.map((server) => server.name),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery),
  );

  const installed = props.plugins.filter((entry) => installedPlugins[entry.plugin.name]);
  const featured = matches.filter((entry) => entry.plugin.poracode.featured);
  const sections = CATEGORY_ORDER.flatMap((category) => {
    const entries = matches.filter(
      (entry) => entry.plugin.poracode.category === category && !entry.plugin.poracode.featured,
    );
    return entries.length > 0 ? [{ category, entries }] : [];
  });

  return (
    <div className="mx-auto min-h-full max-w-[960px]">
      <h1 className="text-lg font-semibold text-foreground">
        <Trans>Plugins</Trans>
      </h1>
      <p className="mb-5 mt-1 text-xs text-muted">
        <Trans>
          Bundles of skills and MCP servers that work across every supported agent. Poracode loads
          any package built for the Agent Plugins specification.
        </Trans>
      </p>

      <div className="mb-6 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted" />
          <Input
            aria-label={t`Search plugins`}
            className="w-full pl-9"
            placeholder={t`Search plugins, skills, and servers...`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Button size="sm" variant="tertiary" onPress={() => void readBridge().openPluginsFolder()}>
          <FolderOpen className="size-4" />
          <Trans>Plugin folder</Trans>
        </Button>
      </div>

      {installed.length > 0 && !normalizedQuery ? (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            <Trans>Installed</Trans>
          </h2>
          <div className="flex flex-wrap gap-2">
            {installed.map((entry) => (
              <Button
                key={entry.plugin.name}
                isIconOnly
                size="sm"
                variant="tertiary"
                aria-label={t`Open ${entry.name}`}
                data-plugin-shortcut-id={entry.plugin.name}
                className="size-10 rounded-xl border border-[var(--hairline)] bg-surface-secondary p-0 text-foreground hover:border-[var(--hairline-strong)] focus-visible:border-[var(--hairline-strong)]"
                onPress={() => props.onOpen(entry.plugin.name)}
              >
                <PluginIcon pluginId={entry.plugin.name} />
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      {matches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--hairline-strong)] px-4 py-10 text-center">
          <p className="text-sm text-foreground">
            <Trans>No plugins match your search.</Trans>
          </p>
        </div>
      ) : null}

      {featured.length > 0 ? (
        <PluginSection title={t`Featured`} count={featured.length}>
          {featured.map((entry) => (
            <PluginCard
              key={entry.plugin.name}
              entry={entry}
              hostPlatform={props.hostPlatform}
              onOpen={props.onOpen}
            />
          ))}
        </PluginSection>
      ) : null}

      {sections.map(({ category, entries }) => (
        <PluginSection key={category} title={entries[0]!.category} count={entries.length}>
          {entries.map((entry) => (
            <PluginCard
              key={entry.plugin.name}
              entry={entry}
              hostPlatform={props.hostPlatform}
              onOpen={props.onOpen}
            />
          ))}
        </PluginSection>
      ))}
    </div>
  );
}

function PluginSection(props: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mb-6 space-y-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-foreground">{props.title}</h2>
        <span className="text-xs text-muted">{props.count}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{props.children}</div>
    </section>
  );
}

function PluginCard(props: {
  entry: LocalizedPlugin;
  hostPlatform: NodeJS.Platform;
  onOpen: (pluginId: string) => void;
}) {
  const installedPlugins = useSharedSettings((state) => state.installedPlugins);
  const installPlugin = useSharedSettings((state) => state.installPlugin);
  const plugin = props.entry.plugin;
  const installed = installedPlugins[plugin.name] !== undefined;
  const supported = isPluginSupportedOnHost(plugin, props.hostPlatform);
  const titleId = `plugin-${plugin.name}-title`;
  const actionLabelId = `plugin-${plugin.name}-action`;
  const serverCount = props.entry.mcpServers.length;

  return (
    <Card className="min-h-40 items-stretch gap-3 border border-[var(--hairline)] p-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--hairline)] bg-surface-secondary text-foreground">
          <PluginIcon pluginId={plugin.name} />
        </div>
        <Card.Header className="min-w-0 flex-1 gap-1 p-0">
          <Card.Title className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <Button
              id={titleId}
              size="sm"
              variant="ghost"
              data-plugin-id={plugin.name}
              className="min-w-0 truncate !p-0 text-left text-sm font-semibold hover:underline focus-visible:underline"
              onPress={() => props.onOpen(plugin.name)}
            >
              {props.entry.name}
            </Button>
            {plugin.source === "user" ? (
              <PluginTag>
                <Trans>External</Trans>
              </PluginTag>
            ) : null}
            {plugin.poracode.communityMaintained ? (
              <PluginTag>
                <Trans>Community</Trans>
              </PluginTag>
            ) : null}
          </Card.Title>
          <Card.Description className="line-clamp-2 text-xs text-muted">
            {props.entry.description}
          </Card.Description>
        </Card.Header>
      </div>
      <Card.Footer className="mt-auto flex items-center justify-between gap-3 p-0">
        <span className="text-[11px] text-muted">
          <Plural value={props.entry.skills.length} one="# skill" other="# skills" />
          {" · "}
          <Plural value={serverCount} one="# server" other="# servers" />
        </span>
        {installed ? (
          <Button
            size="sm"
            variant="tertiary"
            aria-labelledby={`${titleId} ${actionLabelId}`}
            onPress={() => props.onOpen(plugin.name)}
          >
            <span id={actionLabelId}>
              <Trans>Manage</Trans>
            </span>
          </Button>
        ) : (
          <Button
            size="sm"
            variant="tertiary"
            aria-labelledby={`${titleId} ${actionLabelId}`}
            isDisabled={!supported}
            onPress={() => {
              installPlugin(plugin);
              props.onOpen(plugin.name);
            }}
          >
            {supported ? (
              <span id={actionLabelId}>
                <Trans>Install</Trans>
              </span>
            ) : (
              <span id={actionLabelId}>
                <Trans>Unavailable on this device</Trans>
              </span>
            )}
          </Button>
        )}
      </Card.Footer>
    </Card>
  );
}
