import { ContentSurface } from "@/renderer/components/common/ContentSurface";
import { useState } from "react";
import { Button, toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { TriangleAlert } from "lucide-react";
import {
  extractGeminiProfileInstanceId,
  geminiProfileKind,
  parseGeminiProfileInstanceConfig,
  type AgentInstanceConfig,
  type GeminiProfileInstanceConfig,
} from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { ConfirmDialog, Input } from "@/renderer/components/common";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { flushSharedSettings, useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { currentWslDistros } from "@/renderer/utils/acpRegistryAuth";
import { useAgentSettingsHost } from "@/renderer/components/providers/settings/AgentSettingsHostContext";
import { AgentProfileList } from "@/renderer/views/SettingsOverlay/parts/AgentProfileList";
import type {
  NativeAgentProfileSupport,
  NativeAgentSettingsPanelProps,
} from "@/renderer/views/SettingsOverlay/parts/agentRegistryNative";

/**
 * Gemini profiles represent separate accounts or isolated setups: each one
 * owns a `GEMINI_CLI_HOME` whose `.gemini/` holds its own OAuth credentials,
 * `settings.json`, skills, and `tmp/` chats. Sign-in happens through the
 * regular Login button on the profile page (the auth command carries the
 * profile's `GEMINI_CLI_HOME`), so the only per-profile setting is the
 * directory.
 */
export function defaultGeminiHomeDir(profileId: string): string {
  return `~/.poracode/gemini-profiles/${profileId}`;
}

// ── Per-profile page ─────────────────────────────────────────────────────────

/**
 * Settings body for one Gemini profile (`gemini:<id>`). Renders nothing for an
 * unknown / non-Gemini id — the generic page chrome still shows install/auth.
 */
export function GeminiProfileProviderSettings(props: { instanceId: string }) {
  const { canManageProfiles } = useAgentSettingsHost();
  const instance = useSharedSettings((s) =>
    canManageProfiles ? s.agentInstances?.[props.instanceId] : undefined,
  );
  if (!canManageProfiles || !instance || instance.driver !== "gemini") return null;
  let parsedConfig: GeminiProfileInstanceConfig | undefined;
  let invalidConfig = false;
  try {
    parsedConfig = parseGeminiProfileInstanceConfig(instance.config);
  } catch {
    invalidConfig = true;
  }
  const config = parsedConfig ?? { homeDir: defaultGeminiHomeDir(instance.id) };
  return (
    <GeminiProfileEditor
      key={instance.id}
      instance={instance}
      config={config}
      invalidConfig={invalidConfig}
    />
  );
}

function GeminiProfileEditor(props: {
  instance: AgentInstanceConfig;
  config: GeminiProfileInstanceConfig;
  invalidConfig: boolean;
}) {
  const { t } = useLingui();
  const setAgentInstance = useSharedSettings((s) => s.setAgentInstance);
  const profileKind = geminiProfileKind(props.instance.id);
  const hasThreads = useAppStore((s) =>
    s.threads.some((thread) => thread.agentKind === profileKind),
  );
  const [name, setName] = useState(props.instance.displayName ?? props.instance.id);
  const [homeDir, setHomeDir] = useState(props.config.homeDir);
  const [confirmHomeChange, setConfirmHomeChange] = useState(false);
  const [saving, setSaving] = useState(false);

  const displayLabel = props.instance.displayName ?? props.instance.id;
  const trimmedName = name.trim();
  const trimmedHomeDir = homeDir.trim();
  const dirty =
    props.invalidConfig ||
    trimmedName !== (props.instance.displayName ?? props.instance.id) ||
    trimmedHomeDir !== props.config.homeDir;
  const canSave = trimmedName.length > 0 && trimmedHomeDir.length > 0 && dirty && !saving;
  const strandsThreads =
    !props.invalidConfig && hasThreads && trimmedHomeDir !== props.config.homeDir;

  const commit = () => {
    if (!canSave) return;
    setSaving(true);
    const previous = props.instance;
    const candidate: AgentInstanceConfig = {
      ...props.instance,
      displayName: trimmedName,
      config: { homeDir: trimmedHomeDir },
    };
    const persist = async () => {
      setAgentInstance(candidate);
      await flushSharedSettings({ requireSuccess: true });
      await readBridge().refreshAgentStatuses(currentWslDistros(), {
        agentKinds: [profileKind],
      });
      toast.success(t`Gemini ${trimmedName || displayLabel} profile saved.`);
    };
    void persist()
      .catch(async (error: unknown) => {
        setAgentInstance(previous);
        await flushSharedSettings().catch(() => undefined);
        toast.danger(friendlyError(error));
      })
      .finally(() => setSaving(false));
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
    <form
      className="space-y-4 border-t border-border/10 pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            <Trans>Profile home</Trans>
          </p>
          <p className="text-xs text-muted">
            <Trans>
              Gemini runs this profile with GEMINI_CLI_HOME set to the directory below. Use Login
              above to sign this profile in to its own account.
            </Trans>
          </p>
        </div>
        <Button
          size="sm"
          variant="tertiary"
          aria-label={t`Save Gemini profile`}
          className="h-7 min-h-7 px-3 text-[11px]"
          isDisabled={!canSave}
          isPending={saving}
          onPress={save}
        >
          <Trans>Save</Trans>
        </Button>
      </div>

      {props.invalidConfig ? (
        <ContentSurface variant="row" className="flex items-start gap-2 px-3 py-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="text-xs text-muted">
            <Trans>
              The stored configuration is invalid. Saving below replaces it with what this form
              holds.
            </Trans>
          </p>
        </ContentSurface>
      ) : null}

      <section className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted">
            <Trans>Name</Trans>
          </span>
          <Input
            aria-label={t`Gemini profile name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted">
            <Trans>Home directory</Trans>
          </span>
          <Input
            aria-label={t`Gemini profile home directory`}
            className="font-mono text-xs"
            value={homeDir}
            onChange={(event) => setHomeDir(event.target.value)}
          />
        </div>
      </section>
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
    </form>
  );
}

// ── Profile list descriptor (rendered on the base "Gemini" page) ─────────────

function GeminiProfileHomeDir(props: { instance: AgentInstanceConfig }) {
  let config: GeminiProfileInstanceConfig | undefined;
  try {
    config = parseGeminiProfileInstanceConfig(props.instance.config);
  } catch {
    config = undefined;
  }
  return <span className="truncate font-mono">{config?.homeDir ?? props.instance.id}</span>;
}

export const geminiProfileSupport: NativeAgentProfileSupport = {
  driver: "gemini",
  description: (
    <Trans>
      Run a second Gemini account from its own GEMINI_CLI_HOME. Each profile signs in separately and
      keeps its own sessions.
    </Trans>
  ),
  field: {
    ariaLabel: msg`New Gemini profile home directory`,
    placeholderFor: (_name, id) => defaultGeminiHomeDir(id),
  },
  RowSubtitle: GeminiProfileHomeDir,
  removalBody: (profileName) => (
    <Trans>
      Removing {profileName} drops it from Poracode. Its home directory and the Gemini credentials
      inside it stay on disk.
    </Trans>
  ),
  createPayload: ({ id, displayName, field }) => ({
    driver: "gemini",
    id,
    displayName,
    config: { homeDir: field },
  }),
};

export function GeminiProfileSettings(props: {
  onOpenProfile?: ((profileKind: string) => void) | undefined;
}) {
  return <AgentProfileList profiles={geminiProfileSupport} onOpenProfile={props.onOpenProfile} />;
}

/**
 * Registry-driven settings panel for the Gemini family: the base agent page
 * manages the profile list; a profile page shows that profile's own home
 * directory settings. Wired via
 * `NATIVE_AGENT_REGISTRY_ENTRIES[gemini].settingsPanel`.
 */
export function GeminiAgentSettingsPanel(props: NativeAgentSettingsPanelProps) {
  const instanceId = extractGeminiProfileInstanceId(props.agentKind);
  if (instanceId !== undefined) {
    return <GeminiProfileProviderSettings key={props.agentKind} instanceId={instanceId} />;
  }
  return <GeminiProfileSettings onOpenProfile={props.onOpenProfile} />;
}
