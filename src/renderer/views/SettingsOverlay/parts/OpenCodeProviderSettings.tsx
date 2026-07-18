import { useState } from "react";
import type { ReactNode } from "react";
import { Button, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { LogOut, Plus } from "lucide-react";
import type { AgentConnectedProvider, AgentStatus } from "@/shared/contracts";
import { runAgentLoginCommand } from "@/renderer/actions/agentLoginActions";
import { readBridge } from "@/renderer/bridge";
import { PixelLoader, ToggleSwitch } from "@/renderer/components/common";
import type { ComposerMcpConfigKey } from "@/renderer/components/composer/composerMcpServers";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { flushSharedSettings, useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { friendlyError } from "@/shared/messages";
import { SettingRow } from "./SettingsForm";

const ADD_PROVIDER_KEY = "__add__";

const OPEN_CODE_MCP_KEYS = [
  "browserMcp",
  "crossagentMcp",
  "chromeMcp",
  "computerUse",
] as const satisfies readonly (ComposerMcpConfigKey | "computerUse")[];
type OpenCodeMcpKey = (typeof OPEN_CODE_MCP_KEYS)[number];

function readMcpSettings(
  settings: Record<string, boolean | string> | undefined,
): Record<OpenCodeMcpKey, boolean> {
  return {
    browserMcp: settings?.browserMcp === true,
    crossagentMcp: settings?.crossagentMcp === true,
    chromeMcp: settings?.chromeMcp === true,
    computerUse: settings?.computerUse === true,
  };
}
// auth.json provider ids are upstream slugs (e.g. `opencode`, `github-copilot`).
// Only pass an id straight into the shell command when it stays within that safe
// shape — anything else degrades to OpenCode's interactive picker rather than
// risk an injected logout argument.
const SAFE_PROVIDER_ID = /^[a-zA-Z0-9_.-]+$/;

function providerActionKey(provider: AgentConnectedProvider, index: number): string {
  return provider.id ?? `${provider.label}:${index}`;
}

/**
 * OpenCode credential management. OpenCode authenticates per upstream AI
 * provider (its `opencode providers` CLI), so instead of the generic single
 * sign-in row we surface the connected providers and drive add / remove through
 * the interactive terminal overlay, re-probing detection on completion so the
 * list reflects the change.
 */
export function OpenCodeProviderSettings(props: {
  agentKind: string;
  statuses: readonly AgentStatus[];
  wslDistros: string[];
}) {
  const { t } = useLingui();
  const { agentKind, statuses, wslDistros } = props;
  const [pendingKey, setPendingKey] = useState<string | undefined>();

  // MCP servers are staged locally so a batch of toggles applies to running
  // OpenCode directory instances with a single Save.
  const savedMcp = readMcpSettings(useSharedSettings((state) => state.agentSettings[agentKind]));
  const setAgentSetting = useSharedSettings((state) => state.setAgentSetting);
  const [mcpBaseline, setMcpBaseline] = useState(savedMcp);
  const [draftMcp, setDraftMcp] = useState(savedMcp);
  const [mcpSaving, setMcpSaving] = useState(false);
  const mcpDirty = OPEN_CODE_MCP_KEYS.some((key) => draftMcp[key] !== mcpBaseline[key]);
  const showComputerUse = readBridge()?.platform !== "linux";

  const saveMcpSettings = async () => {
    setMcpSaving(true);
    try {
      OPEN_CODE_MCP_KEYS.filter((key) => draftMcp[key] !== mcpBaseline[key]).forEach((key) =>
        setAgentSetting(agentKind, key, draftMcp[key]),
      );
      // The store's setter fires-and-forgets the settings-file write, but the
      // reload below re-reads that same file from the supervisor — flush
      // first so the reload can't race the write and pick up stale flags.
      await flushSharedSettings();
      await readBridge().reloadAgentMcpServers({ agentKind });
      setMcpBaseline(draftMcp);
      toast.success(t`MCP servers updated.`);
    } catch (error) {
      toast.danger(friendlyError(error));
    } finally {
      setMcpSaving(false);
    }
  };

  // Credentials live in a host-global auth.json, and only the native probe
  // resolves stable logout ids — prefer that status's provider list.
  const status = statuses.find((entry) => entry.envKind !== "wsl") ?? statuses[0];
  const label = status?.label ?? "OpenCode";
  const providers = status?.providerMetadata?.connectedProviders ?? [];

  const clearPending = (key: string) =>
    setPendingKey((current) => (current === key ? undefined : current));

  const runProviderCommand = (key: string, command: string) => {
    setPendingKey(key);
    const opened = runAgentLoginCommand({
      label,
      command,
      onCommandComplete: (exitCode) => {
        if (exitCode !== 0) {
          clearPending(key);
          return;
        }
        void readBridge()
          .refreshAgentStatuses(wslDistros, { agentKinds: [agentKind] })
          .finally(() => clearPending(key));
      },
    });
    if (!opened) clearPending(key);
  };

  const addProvider = () => runProviderCommand(ADD_PROVIDER_KEY, "opencode providers login");

  const logoutProvider = (provider: AgentConnectedProvider, index: number) => {
    const command =
      provider.id && SAFE_PROVIDER_ID.test(provider.id)
        ? `opencode providers logout ${provider.id}`
        : "opencode providers logout";
    runProviderCommand(providerActionKey(provider, index), command);
  };

  const isBusy = pendingKey !== undefined;

  return (
    <>
      <div className="border-t border-border/10 pt-3">
        <div className="mb-2 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              <Trans>AI providers</Trans>
            </p>
            <p className="text-xs text-muted">
              <Trans>Connect the AI providers OpenCode can use and sign out of them here.</Trans>
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 min-h-7 shrink-0 gap-1 px-2 text-[11px] text-foreground"
            isDisabled={isBusy}
            isPending={pendingKey === ADD_PROVIDER_KEY}
            onPress={addProvider}
          >
            <Plus className="size-3" />
            <Trans>Add provider</Trans>
          </Button>
        </div>

        {providers.length === 0 ? (
          <p className="py-2 text-[11px] text-muted/60">
            <Trans>No providers connected yet.</Trans>
          </p>
        ) : (
          <div className="space-y-0.5">
            {providers.map((provider, index) => {
              const key = providerActionKey(provider, index);
              return (
                <div
                  key={key}
                  className="group/provider -mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-secondary/40"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <ProviderIcon kind={agentKind} tone="active" className="size-3.5 shrink-0" />
                    <span className="min-w-0 truncate text-sm font-medium text-foreground/90">
                      {provider.label}
                    </span>
                    {provider.detail ? (
                      <span className="shrink-0 text-[11px] tabular-nums text-muted/60">
                        {provider.detail}
                      </span>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    variant="tertiary"
                    className="h-6 min-h-6 shrink-0 gap-1 px-2 text-[10px] text-muted hover:text-foreground"
                    aria-label={t`Sign out of ${provider.label}`}
                    isDisabled={isBusy}
                    isPending={pendingKey === key}
                    onPress={() => logoutProvider(provider, index)}
                  >
                    {pendingKey === key ? (
                      <PixelLoader size="xs" />
                    ) : (
                      <LogOut className="size-3 text-danger" />
                    )}
                    <Trans>Logout</Trans>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-border/10 pt-3">
        <div className="mb-2 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              <Trans>MCP servers</Trans>
            </p>
            <p className="text-xs text-muted">
              <Trans>
                These built-in MCP servers are shared by OpenCode threads. Saving updates running
                GUI projects; removing a server can interrupt an active turn. Terminal threads pick
                up changes on their next launch.
              </Trans>
            </p>
          </div>
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

        <div className="space-y-0.5">
          <McpToggleRow
            title={t`Browser`}
            description={<Trans>Poracode's built-in browser tools.</Trans>}
            isSelected={draftMcp.browserMcp}
            onChange={(value) => setDraftMcp((current) => ({ ...current, browserMcp: value }))}
          />
          <McpToggleRow
            title={t`Crossagents`}
            description={<Trans>Delegate work to other AI agents.</Trans>}
            isSelected={draftMcp.crossagentMcp}
            onChange={(value) => setDraftMcp((current) => ({ ...current, crossagentMcp: value }))}
          />
          <McpToggleRow
            title={t`Chrome`}
            description={<Trans>Control an external Chrome browser.</Trans>}
            isSelected={draftMcp.chromeMcp}
            onChange={(value) => setDraftMcp((current) => ({ ...current, chromeMcp: value }))}
          />
          {showComputerUse ? (
            <McpToggleRow
              title={t`Computer Use`}
              description={<Trans>Control the desktop.</Trans>}
              isSelected={draftMcp.computerUse}
              onChange={(value) => setDraftMcp((current) => ({ ...current, computerUse: value }))}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}

function McpToggleRow(props: {
  title: string;
  description: ReactNode;
  isSelected: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <SettingRow title={props.title} description={props.description} className="py-1.5">
      <ToggleSwitch
        aria-label={props.title}
        isSelected={props.isSelected}
        size="sm"
        onChange={props.onChange}
      />
    </SettingRow>
  );
}
