import { useState } from "react";
import { Button, toast } from "@heroui/react";
import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  codexProfileKind,
  extractCodexProfileInstanceId,
  parseCodexProfileInstanceConfig,
  type AgentInstanceConfig,
  type AgentStatus,
  type CodexProfileInstanceConfig,
} from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { ollamaModelInventory } from "@/shared/agents/ollamaModelInventory";
import { ConfirmDialog, Input } from "@/renderer/components/common";
import { useAppStore } from "@/renderer/state/appStore";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { AgentProfileList } from "@/renderer/views/SettingsOverlay/parts/AgentProfileList";
import type {
  NativeAgentProfileSupport,
  NativeAgentSettingsPanelProps,
} from "@/renderer/views/SettingsOverlay/parts/agentRegistryNative";
import {
  rediscoverHostAgents,
  useAgentSettingsHost,
  useHostAgentInstance,
  type AgentSettingsHost,
} from "@/renderer/components/providers/settings/AgentSettingsHostContext";
import { CodexProviderSettings } from "@/renderer/components/providers/settings/CodexProviderSettings";
import { OllamaContextSetting } from "@/renderer/components/providers/settings/OllamaContextSetting";

/**
 * Codex profiles are a second account: each one owns a `CODEX_HOME` with its
 * own `auth.json`, `config.toml`, and `sessions/`. Sign-in happens through the
 * regular Login button on the profile page (the auth method carries the
 * profile's `CODEX_HOME`), so the only per-profile setting is the directory.
 *
 * The default home is keyed by the allocated instance id, never the display
 * name: distinct names can slugify alike ("Work 1" / "Work-1", or any two
 * non-Latin names), and two profiles sharing a home would share credentials
 * and sessions.
 */
export function defaultCodexHomeDir(profileId: string): string {
  return `~/.poracode/codex-profiles/${profileId}`;
}

function refreshCodexProfile(settingsHost: AgentSettingsHost, kind?: string): void {
  window.setTimeout(() => {
    void rediscoverHostAgents(settingsHost, kind).catch((error) =>
      toast.danger(
        error instanceof Error ? error.message : i18n._(msg`Unable to refresh Codex profiles.`),
      ),
    );
  }, 50);
}

// ── Per-profile page ─────────────────────────────────────────────────────────

/**
 * Settings body for one Codex profile (`codex:<id>`). Renders nothing for an
 * unknown / non-Codex id — the generic page chrome still shows install/auth.
 */
export function CodexProfileProviderSettings(props: { instanceId: string }) {
  const settingsHost = useAgentSettingsHost();
  const instance = useHostAgentInstance(props.instanceId);
  if (!settingsHost.canManageProfiles || !instance || instance.driver !== "codex") return null;
  let config: CodexProfileInstanceConfig;
  try {
    config = parseCodexProfileInstanceConfig(instance.config);
  } catch {
    return null;
  }
  return (
    <CodexProfileEditor
      key={`${settingsHost.key}:${instance.id}`}
      instance={instance}
      config={config}
    />
  );
}

function CodexProfileEditor(props: {
  instance: AgentInstanceConfig;
  config: CodexProfileInstanceConfig;
}) {
  const { t } = useLingui();
  const settingsHost = useAgentSettingsHost();
  const profileKind = codexProfileKind(props.instance.id);
  // Archived threads count too: they can still be restored and resumed.
  const hasThreads = useAppStore((s) =>
    s.threads.some(
      (thread) =>
        thread.agentKind === profileKind &&
        (settingsHost.isRemote
          ? remoteOwner(thread)?.desktopId === settingsHost.connectionKey
          : remoteOwner(thread) === undefined),
    ),
  );
  // Seeded once from props; the editor is keyed by host + instance id so it
  // re-seeds when switching profiles or machines.
  const [name, setName] = useState(props.instance.displayName ?? props.instance.id);
  const [homeDir, setHomeDir] = useState(props.config.homeDir);
  const [confirmHomeChange, setConfirmHomeChange] = useState(false);

  const displayLabel = props.instance.displayName ?? props.instance.id;
  const local = props.config.local;
  const rawConfig =
    typeof props.instance.config === "object" && props.instance.config !== null
      ? (props.instance.config as Record<string, unknown>)
      : {};
  const rawLocal =
    local && typeof rawConfig.local === "object" && rawConfig.local !== null
      ? (rawConfig.local as Record<string, unknown>)
      : {};
  const trimmedName = name.trim();
  const trimmedHomeDir = homeDir.trim();
  const dirty =
    trimmedName !== (props.instance.displayName ?? props.instance.id) ||
    (!local && trimmedHomeDir !== props.config.homeDir);
  const canSave =
    settingsHost.isOnline &&
    trimmedName.length > 0 &&
    (local !== undefined || trimmedHomeDir.length > 0) &&
    dirty;
  // A thread resumes from the rollout files in the home it ran under, so
  // moving the home strands every existing thread's session.
  const strandsThreads = !local && hasThreads && trimmedHomeDir !== props.config.homeDir;

  const commit = () => {
    if (!canSave) return;
    // A local profile's route/config is managed by its create flow and the
    // Context length control. Renaming it must not rewrite that config from a
    // decoded snapshot, which would drop opaque keys.
    const patch = local
      ? { displayName: trimmedName }
      : { displayName: trimmedName, config: { homeDir: trimmedHomeDir } };
    void settingsHost
      .updateProfile(props.instance.id, patch, { flush: false })
      .then(() => {
        refreshCodexProfile(settingsHost, profileKind);
        toast.success(t`Codex ${trimmedName || displayLabel} profile saved.`);
      })
      .catch((error) => {
        toast.danger(friendlyError(error));
      });
  };

  const save = () => {
    if (!canSave) return;
    if (strandsThreads) {
      setConfirmHomeChange(true);
      return;
    }
    commit();
  };

  const strandedThreadsWarning = (
    <Trans>
      This profile already has threads. Their sessions stay in the current home directory, so they
      can't be resumed after you change it.
    </Trans>
  );

  return (
    <div className="space-y-4 border-t border-border/10 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            <Trans>Profile home</Trans>
          </p>
          <p className="text-xs text-muted">
            {local ? (
              <Trans>Poracode manages this local model route and its Codex home.</Trans>
            ) : (
              <Trans>
                Codex runs this profile with CODEX_HOME set to the directory below. Use Login above
                to sign this profile in to its own account.
              </Trans>
            )}
          </p>
        </div>
        <Button
          size="sm"
          variant="tertiary"
          aria-label={t`Save Codex profile`}
          className="h-7 min-h-7 px-3 text-[11px]"
          isDisabled={!canSave}
          onPress={save}
        >
          <Trans>Save</Trans>
        </Button>
      </div>

      <section className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted">
            <Trans>Name</Trans>
          </span>
          <Input
            aria-label={t`Codex profile name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted">
            {local ? <Trans>Managed home</Trans> : <Trans>Home directory</Trans>}
          </span>
          {local ? (
            <Input
              aria-label={t`Codex profile managed home`}
              className="font-mono text-xs"
              value={t`Managed by Poracode`}
              disabled
              readOnly
            />
          ) : (
            <Input
              aria-label={t`Codex profile home directory`}
              className="font-mono text-xs"
              value={homeDir}
              onChange={(event) => setHomeDir(event.target.value)}
            />
          )}
        </div>
      </section>
      {local ? (
        <>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted">{t`Server`}</dt>
            <dd className="min-w-0 break-all font-mono text-foreground">{local.endpoint}</dd>
            <dt className="text-muted">{t`Model`}</dt>
            <dd className="min-w-0 break-all font-mono text-foreground">
              {local.baseModel ?? local.model}
            </dd>
          </dl>
          <OllamaContextSetting
            instanceId={props.instance.id}
            profileKind={profileKind}
            endpoint={local.endpoint}
            declaredEndpoint={codexProfileSupport.addProfile?.local?.ollamaEndpoint ?? ""}
            baseModel={local.baseModel ?? local.model}
            contextLength={local.contextLength}
            applyContext={async (next) => {
              const { local: _local, ...config } = rawConfig;
              const { baseModel: _baseModel, contextLength: _contextLength, ...route } = rawLocal;
              await settingsHost.updateProfile(props.instance.id, {
                config: {
                  ...config,
                  local: {
                    ...route,
                    model: next.model,
                    ...(next.baseModel ? { baseModel: next.baseModel } : {}),
                    ...(next.contextLength ? { contextLength: next.contextLength } : {}),
                  },
                },
              });
            }}
          />
        </>
      ) : null}
      {strandsThreads ? <p className="text-xs text-warning">{strandedThreadsWarning}</p> : null}

      <ConfirmDialog
        isOpen={confirmHomeChange}
        title={t`Change profile home?`}
        body={strandedThreadsWarning}
        confirmLabel={t`Change home`}
        confirmVariant="primary"
        status="warning"
        onConfirm={() => {
          setConfirmHomeChange(false);
          commit();
        }}
        onClose={() => setConfirmHomeChange(false)}
      />
    </div>
  );
}

// ── Profile list descriptor (rendered on the base "Codex" page) ──────────────

function CodexProfileSubtitle(props: { instance: AgentInstanceConfig }) {
  let config: CodexProfileInstanceConfig | undefined;
  try {
    config = parseCodexProfileInstanceConfig(props.instance.config);
  } catch {
    // Malformed records are skipped by the supervisor too; show the id only.
    config = undefined;
  }
  if (config?.local) {
    return (
      <span className="truncate font-mono">{config.local.baseModel ?? config.local.model}</span>
    );
  }
  return <span className="truncate font-mono">{config?.homeDir ?? props.instance.id}</span>;
}

export const codexProfileSupport: NativeAgentProfileSupport = {
  driver: "codex",
  description: (
    <Trans>
      Run a second Codex account from its own CODEX_HOME. Each profile signs in separately and keeps
      its own sessions.
    </Trans>
  ),
  // Local model routing uses scoped Codex launch overrides and a managed
  // profile home; ordinary profiles and user homes are never rewritten.
  addProfile: {
    label: msg`Codex`,
    order: 2,
    local: {
      ollamaEndpoint: "http://127.0.0.1:11434/v1",
      createPayload: ({ id, displayName, endpoint, model, baseModel, contextLength }) => ({
        driver: "codex",
        id,
        displayName,
        config: {
          homeDir: defaultCodexHomeDir(id),
          local: {
            endpoint,
            model,
            ...(baseModel && contextLength ? { baseModel, contextLength } : {}),
          },
        },
      }),
      modelSuggestions: ollamaModelInventory,
      modelHint: (
        <Trans>
          Codex uses scoped command-line overrides for this route. The user&apos;s Codex config
          files are not changed.
        </Trans>
      ),
    },
  },
  field: {
    ariaLabel: msg`New Codex profile home directory`,
    // Live default shown as the placeholder and used verbatim when left empty.
    placeholderFor: (_name, id) => defaultCodexHomeDir(id),
  },
  RowSubtitle: CodexProfileSubtitle,
  removalBody: (profileName) => (
    <Trans>
      Removing {profileName} drops it from Poracode. Its home directory and the Codex credentials
      inside it stay on disk.
    </Trans>
  ),
  createPayload: ({ id, displayName, field }) => ({
    driver: "codex",
    id,
    displayName,
    config: { homeDir: field },
  }),
};

export function CodexProfileSettings(props: {
  statuses?: readonly AgentStatus[] | undefined;
  suggestionStatuses?: readonly AgentStatus[] | undefined;
  workspaceIsClientDevice?: boolean | undefined;
  onOpenProfile?: ((profileKind: string) => void) | undefined;
}) {
  return (
    <AgentProfileList
      profiles={codexProfileSupport}
      {...(props.statuses ? { statuses: props.statuses } : {})}
      {...(props.suggestionStatuses ? { suggestionStatuses: props.suggestionStatuses } : {})}
      workspaceIsClientDevice={props.workspaceIsClientDevice}
      onOpenProfile={props.onOpenProfile}
    />
  );
}

/**
 * Registry-driven settings panel for the Codex family: the base agent page
 * keeps its context-window settings and manages the profile list; a profile
 * page shows that profile's own settings. Wired via
 * `NATIVE_AGENT_REGISTRY_ENTRIES[codex].settingsPanel`.
 */
export function CodexAgentSettingsPanel(props: NativeAgentSettingsPanelProps) {
  const instanceId = extractCodexProfileInstanceId(props.agentKind);
  if (instanceId !== undefined) {
    return <CodexProfileProviderSettings key={props.agentKind} instanceId={instanceId} />;
  }
  return (
    <>
      <CodexProviderSettings
        agentKind={props.agentKind}
        statuses={props.statuses}
        wslDistros={props.wslDistros}
      />
      <CodexProfileSettings
        statuses={props.statuses}
        suggestionStatuses={props.hostStatuses}
        workspaceIsClientDevice={props.workspaceIsClientDevice}
        onOpenProfile={props.onOpenProfile}
      />
    </>
  );
}
