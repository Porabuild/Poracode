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
  type CodexProfileInstanceConfig,
} from "@/shared/contracts";
import { Input } from "@/renderer/components/common";
import { readBridge } from "@/renderer/bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { currentWslDistros } from "@/renderer/utils/acpRegistryAuth";
import { AgentProfileList } from "./AgentProfileList";
import type {
  NativeAgentProfileSupport,
  NativeAgentSettingsPanelProps,
} from "./agentRegistryNative";
import { CodexProviderSettings } from "./CodexProviderSettings";
import { slugifyProfileName } from "./profileIds";

/**
 * Codex profiles are a second account: each one owns a `CODEX_HOME` with its
 * own `auth.json`, `config.toml`, and `sessions/`. Sign-in happens through the
 * regular Login button on the profile page (the auth method carries the
 * profile's `CODEX_HOME`), so the only per-profile setting is the directory.
 */
export function defaultCodexHomeDir(name: string): string {
  return `~/.poracode/codex-profiles/${slugifyProfileName(name)}`;
}

function refreshCodexProfile(kind?: string): void {
  window.setTimeout(() => {
    void readBridge()
      .refreshAgentStatuses(currentWslDistros(), kind ? { agentKinds: [kind] } : undefined)
      .catch((error) =>
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
  const instance = useSharedSettings((s) => s.agentInstances?.[props.instanceId]);
  if (!instance || instance.driver !== "codex") return null;
  let config: CodexProfileInstanceConfig;
  try {
    config = parseCodexProfileInstanceConfig(instance.config);
  } catch {
    return null;
  }
  return <CodexProfileEditor key={instance.id} instance={instance} config={config} />;
}

function CodexProfileEditor(props: {
  instance: AgentInstanceConfig;
  config: CodexProfileInstanceConfig;
}) {
  const { t } = useLingui();
  const setAgentInstance = useSharedSettings((s) => s.setAgentInstance);
  // Seeded once from props; the editor is keyed by instance id so it re-seeds
  // when a different profile takes its place.
  const [name, setName] = useState(props.instance.displayName ?? props.instance.id);
  const [homeDir, setHomeDir] = useState(props.config.homeDir);

  const displayLabel = props.instance.displayName ?? props.instance.id;
  const trimmedName = name.trim();
  const trimmedHomeDir = homeDir.trim();
  const dirty =
    trimmedName !== (props.instance.displayName ?? props.instance.id) ||
    trimmedHomeDir !== props.config.homeDir;
  const canSave = trimmedName.length > 0 && trimmedHomeDir.length > 0 && dirty;

  const save = () => {
    if (!canSave) return;
    const config: CodexProfileInstanceConfig = { homeDir: trimmedHomeDir };
    setAgentInstance({ ...props.instance, displayName: trimmedName, config });
    refreshCodexProfile(codexProfileKind(props.instance.id));
    toast.success(t`Codex ${trimmedName || displayLabel} profile saved.`);
  };

  return (
    <div className="space-y-4 border-t border-border/10 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            <Trans>Profile home</Trans>
          </p>
          <p className="text-xs text-muted">
            <Trans>
              Codex runs this profile with CODEX_HOME set to the directory below. Use Login above to
              sign this profile in to its own account.
            </Trans>
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
            <Trans>Home directory</Trans>
          </span>
          <Input
            aria-label={t`Codex profile home directory`}
            className="font-mono text-xs"
            value={homeDir}
            onChange={(event) => setHomeDir(event.target.value)}
          />
        </div>
      </section>
    </div>
  );
}

// ── Profile list descriptor (rendered on the base "Codex" page) ──────────────

function CodexProfileHomeDir(props: { instance: AgentInstanceConfig }) {
  let config: CodexProfileInstanceConfig | undefined;
  try {
    config = parseCodexProfileInstanceConfig(props.instance.config);
  } catch {
    // Malformed records are skipped by the supervisor too; show the id only.
    config = undefined;
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
  field: {
    ariaLabel: msg`New Codex profile home directory`,
    // Live default shown as the placeholder and used verbatim when left empty.
    placeholderFor: (name) => defaultCodexHomeDir(name),
  },
  RowSubtitle: CodexProfileHomeDir,
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
  onOpenProfile?: ((profileKind: string) => void) | undefined;
}) {
  return <AgentProfileList profiles={codexProfileSupport} onOpenProfile={props.onOpenProfile} />;
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
      <CodexProviderSettings agentKind={props.agentKind} wslDistros={props.wslDistros} />
      <CodexProfileSettings onOpenProfile={props.onOpenProfile} />
    </>
  );
}
