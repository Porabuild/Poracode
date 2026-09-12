import { useState } from "react";
import type { ReactNode } from "react";
import { Button, Disclosure, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { readBridge } from "@/renderer/bridge";
import { ToggleSwitch } from "@/renderer/components/common";
import type { ComposerMcpConfigKey } from "@/renderer/components/composer/composerMcpServers";
import { mcpTransportSummary } from "@/renderer/components/mcp/mcpFormUtils";
import { flushSharedSettings, useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { friendlyError } from "@/shared/messages";
import { SettingRow } from "./SettingsForm";

/**
 * Poracode's own built-in MCP servers. They are host features rather than
 * provider features, so any agent panel that opts into this section offers the
 * same set.
 */
const BUILT_IN_MCP_KEYS = [
  "browserMcp",
  "crossagentMcp",
  "chromeMcp",
  "computerUse",
] as const satisfies readonly (ComposerMcpConfigKey | "computerUse")[];
type BuiltInMcpKey = (typeof BUILT_IN_MCP_KEYS)[number];

function readMcpSettings(
  settings: Record<string, boolean | string> | undefined,
): Record<BuiltInMcpKey, boolean> {
  return {
    browserMcp: settings?.browserMcp === true,
    // Delegation is routed back through the agent's own session, so it is safe
    // by default. An explicit false remains an opt-out for users who do not
    // want delegation.
    crossagentMcp: settings?.crossagentMcp !== false,
    chromeMcp: settings?.chromeMcp === true,
    computerUse: settings?.computerUse === true,
  };
}

/**
 * Collapsible built-in + configured MCP server list with a staged Save, shared
 * by the agent settings panels that manage MCP servers themselves. The caller
 * supplies the description because only it knows how its own threads pick the
 * change up.
 */
export function ProviderMcpServersSection(props: { agentKind: string; description: ReactNode }) {
  const { t } = useLingui();
  const { agentKind } = props;

  // MCP servers are staged locally so a batch of toggles applies to running
  // directory instances with a single Save.
  const savedMcp = readMcpSettings(useSharedSettings((state) => state.agentSettings[agentKind]));
  const setAgentSetting = useSharedSettings((state) => state.setAgentSetting);
  const savedCustomMcp = useSharedSettings((state) => state.mcpServers) ?? [];
  const setMcpServers = useSharedSettings((state) => state.setMcpServers);
  const [mcpBaseline, setMcpBaseline] = useState(savedMcp);
  const [draftMcp, setDraftMcp] = useState(savedMcp);
  const [customMcpBaseline, setCustomMcpBaseline] = useState(savedCustomMcp);
  const [draftCustomMcp, setDraftCustomMcp] = useState(savedCustomMcp);
  const [mcpSaving, setMcpSaving] = useState(false);
  const customMcpDirty =
    draftCustomMcp.length !== customMcpBaseline.length ||
    draftCustomMcp.some((server, index) => server.enabled !== customMcpBaseline[index]?.enabled);
  const mcpDirty =
    customMcpDirty || BUILT_IN_MCP_KEYS.some((key) => draftMcp[key] !== mcpBaseline[key]);
  const builtInMcpCount = BUILT_IN_MCP_KEYS.length;

  const saveMcpSettings = async () => {
    setMcpSaving(true);
    try {
      BUILT_IN_MCP_KEYS.filter((key) => draftMcp[key] !== mcpBaseline[key]).forEach((key) =>
        setAgentSetting(agentKind, key, draftMcp[key]),
      );
      if (customMcpDirty) setMcpServers(draftCustomMcp);
      // The store's setter fires-and-forgets the settings-file write, but the
      // reload below re-reads that same file from the supervisor — flush
      // first so the reload can't race the write and pick up stale flags.
      await flushSharedSettings();
      await readBridge().reloadAgentMcpServers({ agentKind });
      setMcpBaseline(draftMcp);
      setCustomMcpBaseline(draftCustomMcp);
      toast.success(t`MCP servers updated.`);
    } catch (error) {
      toast.danger(friendlyError(error));
    } finally {
      setMcpSaving(false);
    }
  };

  return (
    <div className="border-t border-border/10 pt-3">
      <div className="flex items-start gap-4">
        <Disclosure className="min-w-0 flex-1">
          <Disclosure.Heading>
            <Disclosure.Trigger className="flex w-full min-w-0 items-start gap-3 py-1 text-left">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  <Trans>MCP servers</Trans>
                </p>
                <p className="text-xs text-muted">{props.description}</p>
              </div>
              <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs tabular-nums text-muted">
                {builtInMcpCount + draftCustomMcp.length}
              </span>
              <Disclosure.Indicator className="mt-1 size-3.5 shrink-0 text-muted" />
            </Disclosure.Trigger>
          </Disclosure.Heading>

          <Disclosure.Content>
            <Disclosure.Body className="space-y-3 pt-2">
              <div className="space-y-0.5">
                <McpToggleRow
                  title={t`Browser`}
                  description={<Trans>Poracode's built-in browser tools.</Trans>}
                  isSelected={draftMcp.browserMcp}
                  isDisabled={mcpSaving}
                  onChange={(value) =>
                    setDraftMcp((current) => ({ ...current, browserMcp: value }))
                  }
                />
                <McpToggleRow
                  title={t`Crossagents`}
                  description={<Trans>Delegate work to other AI agents.</Trans>}
                  isSelected={draftMcp.crossagentMcp}
                  isDisabled={mcpSaving}
                  onChange={(value) =>
                    setDraftMcp((current) => ({ ...current, crossagentMcp: value }))
                  }
                />
                <McpToggleRow
                  title={t`Chrome`}
                  description={<Trans>Control an external Chrome browser.</Trans>}
                  isSelected={draftMcp.chromeMcp}
                  isDisabled={mcpSaving}
                  onChange={(value) => setDraftMcp((current) => ({ ...current, chromeMcp: value }))}
                />
                <McpToggleRow
                  title={t`Computer Use`}
                  description={<Trans>Control the desktop.</Trans>}
                  isSelected={draftMcp.computerUse}
                  isDisabled={mcpSaving}
                  onChange={(value) =>
                    setDraftMcp((current) => ({ ...current, computerUse: value }))
                  }
                />
              </div>

              <div className="border-t border-border/10 pt-3">
                <div className="mb-1 flex items-baseline gap-2">
                  <p className="text-xs font-semibold text-foreground">
                    <Trans>Configured MCP servers</Trans>
                  </p>
                  <span className="text-xs tabular-nums text-muted">{draftCustomMcp.length}</span>
                </div>
                {draftCustomMcp.length === 0 ? (
                  <p className="py-2 text-[11px] text-muted/60">
                    <Trans>No configured MCP servers yet</Trans>
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    {draftCustomMcp.map((server) => (
                      <McpToggleRow
                        key={server.id}
                        title={server.name}
                        description={
                          <span className="truncate font-mono text-[11px]">
                            {server.description || mcpTransportSummary(server.transport)}
                          </span>
                        }
                        ariaLabel={
                          server.enabled ? t`Disable ${server.name}` : t`Enable ${server.name}`
                        }
                        isSelected={server.enabled}
                        isDisabled={mcpSaving}
                        onChange={(enabled) =>
                          setDraftCustomMcp((current) =>
                            current.map((item) =>
                              item.id === server.id ? { ...item, enabled } : item,
                            ),
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>

        <Button
          size="sm"
          variant="primary"
          className="h-7 min-h-7 shrink-0 px-3 text-[11px]"
          aria-label={t`Save MCP servers`}
          isDisabled={!mcpDirty || mcpSaving}
          isPending={mcpSaving}
          onPress={() => void saveMcpSettings()}
        >
          <Trans>Save</Trans>
        </Button>
      </div>
    </div>
  );
}

function McpToggleRow(props: {
  title: string;
  description: ReactNode;
  ariaLabel?: string;
  isSelected: boolean;
  isDisabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <SettingRow title={props.title} description={props.description} className="py-1.5">
      <ToggleSwitch
        aria-label={props.ariaLabel ?? props.title}
        isSelected={props.isSelected}
        isDisabled={props.isDisabled === true}
        size="sm"
        onChange={props.onChange}
      />
    </SettingRow>
  );
}
