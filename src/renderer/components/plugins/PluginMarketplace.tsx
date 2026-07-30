import { Card, Input } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Search } from "lucide-react";
import { useState } from "react";
import { Button, LightballTabs } from "@/renderer/components/common";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { isPluginSupportedOnHost } from "@/shared/plugins/catalog";
import { PluginIcon } from "./PluginIcon";
import type { LocalizedPlugin } from "./pluginCopy";

type MarketplaceTab = "installed" | "discover";

export function PluginMarketplace(props: {
  plugins: readonly LocalizedPlugin[];
  hostPlatform: NodeJS.Platform;
  onOpen: (pluginId: string) => void;
}) {
  const { t } = useLingui();
  const [tab, setTab] = useState<MarketplaceTab>("discover");
  const [query, setQuery] = useState("");
  const installedPlugins = useSharedSettings((state) => state.installedPlugins);
  const installPlugin = useSharedSettings((state) => state.installPlugin);
  const normalizedQuery = query.trim().toLowerCase();
  const visiblePlugins = props.plugins.filter((plugin) => {
    if (tab === "installed" && !installedPlugins[plugin.manifest.id]) return false;
    return [
      plugin.name,
      plugin.description,
      plugin.category,
      ...plugin.skills.flatMap((skill) => [skill.name, skill.description]),
      ...plugin.apps.flatMap((app) => [app.name, app.description]),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });

  const tabs = [
    {
      id: "installed" as const,
      label: t`Installed`,
      trailing: props.plugins.filter((plugin) => installedPlugins[plugin.manifest.id]).length,
    },
    { id: "discover" as const, label: t`Discover` },
  ];

  return (
    <div className="mx-auto min-h-full max-w-[960px]">
      <div className="mb-2 flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-foreground">
          <Trans>Plugins</Trans>
        </h1>
        <LightballTabs
          tabs={tabs}
          active={tab}
          onChange={setTab}
          ariaLabel={t`Plugin marketplace views`}
        />
      </div>
      <p className="mb-5 text-xs text-muted">
        <Trans>
          Install Poracode-managed bundles of skills and MCP-powered apps for every supported agent.
        </Trans>
      </p>
      <div className="relative mb-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted" />
        <Input
          aria-label={t`Search plugins`}
          className="w-full pl-9"
          placeholder={t`Search plugins, skills, and apps...`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {visiblePlugins.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              {tab === "installed" ? <Trans>Installed</Trans> : <Trans>Featured</Trans>}
            </h2>
            <span className="text-xs text-muted">{visiblePlugins.length}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {visiblePlugins.map((plugin) => {
              const installed = installedPlugins[plugin.manifest.id] !== undefined;
              const supported = isPluginSupportedOnHost(plugin.manifest, props.hostPlatform);
              const titleId = `plugin-${plugin.manifest.id}-title`;
              const actionLabelId = `plugin-${plugin.manifest.id}-action`;
              return (
                <Card
                  key={plugin.manifest.id}
                  className="min-h-40 items-stretch gap-3 border border-[var(--hairline)] p-4"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--hairline)] bg-surface-secondary text-foreground">
                      <PluginIcon pluginId={plugin.manifest.id} />
                    </div>
                    <Card.Header className="min-w-0 flex-1 gap-1 p-0">
                      <Card.Title className="truncate text-sm font-semibold">
                        <button
                          id={titleId}
                          type="button"
                          data-plugin-id={plugin.manifest.id}
                          className="truncate text-left hover:underline focus-visible:underline"
                          onClick={() => props.onOpen(plugin.manifest.id)}
                        >
                          {plugin.name}
                        </button>
                      </Card.Title>
                      <Card.Description className="line-clamp-2 text-xs text-muted">
                        {plugin.description}
                      </Card.Description>
                    </Card.Header>
                  </div>
                  <Card.Footer className="mt-auto flex items-center justify-between gap-3 p-0">
                    <span className="text-[11px] text-muted">
                      <Plural value={plugin.skills.length} one="# skill" other="# skills" />
                      {" · "}
                      <Plural value={plugin.apps.length} one="# app" other="# apps" />
                    </span>
                    {installed ? (
                      <Button
                        size="sm"
                        variant="tertiary"
                        aria-labelledby={`${titleId} ${actionLabelId}`}
                        onPress={() => props.onOpen(plugin.manifest.id)}
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
                          installPlugin(plugin.manifest.id);
                          props.onOpen(plugin.manifest.id);
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
            })}
          </div>
        </section>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--hairline-strong)] px-4 py-10 text-center">
          <p className="text-sm text-foreground">
            {tab === "installed" && !normalizedQuery ? (
              <Trans>No plugins installed yet</Trans>
            ) : (
              <Trans>No plugins match your search.</Trans>
            )}
          </p>
          {tab === "installed" && !normalizedQuery ? (
            <Button
              className="mt-3"
              size="sm"
              variant="tertiary"
              onPress={() => setTab("discover")}
            >
              <Trans>Discover plugins</Trans>
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
