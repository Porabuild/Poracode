import { Input } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { LightballTabs, ToggleSwitch } from "@/renderer/components/common";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  isPluginAppEnabled,
  isPluginMcpServerEnabled,
  isPluginSkillEnabled,
  isPluginSupportedOnHost,
} from "@/shared/plugins/catalog";
import { PluginIcon } from "./PluginIcon";
import { PluginTag } from "./PluginTag";
import type { LocalizedPlugin, LocalizedPluginContribution } from "./pluginCopy";

/**
 * Flat management view over installed packages, broken out by contribution type.
 *
 * The marketplace answers "what can I add"; this answers "what is currently
 * active and where did it come from".
 */

type ManageTab = "plugins" | "apps" | "mcps" | "skills";

interface ContributionRow {
  key: string;
  plugin: LocalizedPlugin;
  contribution: LocalizedPluginContribution;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export function PluginsManager(props: {
  plugins: readonly LocalizedPlugin[];
  hostPlatform: NodeJS.Platform;
  onOpen: (pluginId: string) => void;
}) {
  const { t } = useLingui();
  const [tab, setTab] = useState<ManageTab>("plugins");
  const [query, setQuery] = useState("");
  const installedPlugins = useSharedSettings((state) => state.installedPlugins);
  const setPluginEnabled = useSharedSettings((state) => state.setPluginEnabled);
  const setPluginAppEnabled = useSharedSettings((state) => state.setPluginAppEnabled);
  const setPluginSkillEnabled = useSharedSettings((state) => state.setPluginSkillEnabled);
  const setPluginMcpServerEnabled = useSharedSettings((state) => state.setPluginMcpServerEnabled);
  const normalizedQuery = query.trim().toLowerCase();

  const installedEntries = props.plugins.filter((entry) => installedPlugins[entry.plugin.name]);

  const contributionRows = (kind: Exclude<ManageTab, "plugins">): ContributionRow[] =>
    installedEntries.flatMap((entry) => {
      const name = entry.plugin.name;
      const state = installedPlugins[name]!;
      const list = kind === "apps" ? entry.apps : kind === "mcps" ? entry.mcpServers : entry.skills;
      return list.map((contribution) => ({
        key: `${name}:${contribution.id}`,
        plugin: entry,
        contribution,
        enabled:
          kind === "apps"
            ? isPluginAppEnabled(entry.plugin, state, contribution.id)
            : kind === "mcps"
              ? isPluginMcpServerEnabled(entry.plugin, state, contribution.id)
              : isPluginSkillEnabled(entry.plugin, state, contribution.id),
        setEnabled: (enabled: boolean) => {
          if (kind === "apps") setPluginAppEnabled(entry.plugin, contribution.id, enabled);
          else if (kind === "mcps") setPluginMcpServerEnabled(name, contribution.id, enabled);
          else setPluginSkillEnabled(name, contribution.id, enabled);
        },
      }));
    });

  const appRows = contributionRows("apps");
  const mcpRows = contributionRows("mcps");
  const skillRows = contributionRows("skills");

  const tabs = [
    { id: "plugins" as const, label: t`Plugins`, trailing: props.plugins.length },
    { id: "apps" as const, label: t`Apps`, trailing: appRows.length },
    { id: "mcps" as const, label: t`MCPs`, trailing: mcpRows.length },
    { id: "skills" as const, label: t`Skills`, trailing: skillRows.length },
  ];

  const matchesQuery = (...values: (string | undefined)[]) =>
    values.filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery);

  const visibleRows = (rows: ContributionRow[]) =>
    rows.filter((row) =>
      matchesQuery(row.contribution.name, row.contribution.description, row.plugin.name),
    );

  const rows = tab === "apps" ? appRows : tab === "mcps" ? mcpRows : skillRows;

  return (
    <div className="mx-auto min-h-full max-w-[960px]">
      <h1 className="text-lg font-semibold text-foreground">
        <Trans>Plugins</Trans>
      </h1>
      <p className="mb-5 mt-1 text-xs text-muted">
        <Trans>Manage installed plugins and the skills and servers they contribute.</Trans>
      </p>

      <div className="mb-5 flex items-center justify-between gap-4">
        <LightballTabs
          tabs={tabs}
          active={tab}
          onChange={setTab}
          ariaLabel={t`Plugin management views`}
        />
        <div className="relative w-[280px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted" />
          <Input
            aria-label={t`Search installed plugins`}
            className="w-full pl-9"
            placeholder={t`Search...`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      {tab === "plugins" ? (
        <ManageList>
          {props.plugins
            .filter((entry) => matchesQuery(entry.name, entry.description))
            .map((entry) => {
              const name = entry.plugin.name;
              const state = installedPlugins[name];
              const supported = isPluginSupportedOnHost(entry.plugin, props.hostPlatform);
              return (
                <ManageRow
                  key={name}
                  icon={<PluginIcon pluginId={name} />}
                  name={entry.name}
                  description={entry.description}
                  onOpen={() => props.onOpen(name)}
                  tags={
                    <>
                      {entry.plugin.source === "user" ? (
                        <PluginTag>
                          <Trans>External</Trans>
                        </PluginTag>
                      ) : null}
                      {entry.plugin.poracode.communityMaintained ? (
                        <PluginTag>
                          <Trans>Community</Trans>
                        </PluginTag>
                      ) : null}
                    </>
                  }
                  control={
                    state ? (
                      <ToggleSwitch
                        aria-label={t`Enable ${entry.name}`}
                        isSelected={state.enabled}
                        isDisabled={!supported}
                        onChange={(enabled) => setPluginEnabled(entry.plugin, enabled)}
                      />
                    ) : (
                      <span className="text-xs text-muted">
                        <Trans>Not installed</Trans>
                      </span>
                    )
                  }
                />
              );
            })}
        </ManageList>
      ) : (
        <ManageList>
          {visibleRows(rows).map((row) => (
            <ManageRow
              key={row.key}
              icon={<PluginIcon pluginId={row.plugin.plugin.name} />}
              name={row.contribution.name}
              {...(row.contribution.description
                ? { description: row.contribution.description }
                : {})}
              onOpen={() => props.onOpen(row.plugin.plugin.name)}
              tags={<PluginTag>{row.plugin.name}</PluginTag>}
              control={
                <ToggleSwitch
                  aria-label={t`Enable ${row.contribution.name}`}
                  isSelected={row.enabled}
                  isDisabled={!installedPlugins[row.plugin.plugin.name]?.enabled}
                  onChange={row.setEnabled}
                />
              }
            />
          ))}
        </ManageList>
      )}

      {tab !== "plugins" && visibleRows(rows).length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--hairline-strong)] px-4 py-10 text-center">
          <p className="text-sm text-foreground">
            <Trans>Nothing here yet. Install a plugin to add contributions.</Trans>
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ManageList(props: { children: ReactNode }) {
  return <div className="space-y-2">{props.children}</div>;
}

function ManageRow(props: {
  icon: ReactNode;
  name: string;
  description?: string;
  tags?: ReactNode;
  control: ReactNode;
  onOpen: () => void;
}) {
  return (
    <div className="flex min-h-16 items-center gap-3 rounded-xl border border-[var(--hairline)] px-3 py-2.5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--hairline)] bg-surface-secondary text-foreground">
        {props.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="truncate text-sm font-medium text-foreground hover:underline focus-visible:underline"
            onClick={props.onOpen}
          >
            {props.name}
          </button>
          {props.tags}
        </div>
        {props.description ? (
          <p className="truncate text-xs text-muted">{props.description}</p>
        ) : null}
      </div>
      {props.control}
    </div>
  );
}
