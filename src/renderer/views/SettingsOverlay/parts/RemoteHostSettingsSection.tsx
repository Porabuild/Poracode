import { useCallback, useEffect, useRef, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Loader2, Monitor, RefreshCw } from "lucide-react";
import { ToggleButton, ToggleButtonGroup } from "@heroui/react";
import type { RemoteSettings, RemoteSettingsPatch } from "@/shared/remote";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { TuxIcon } from "@/renderer/components/common";
import { Button } from "@/renderer/components/common/Button";
import { friendlyError } from "@/shared/messages";
import {
  getCommitGenCandidates,
  resolveCommitGenConfig,
} from "@/renderer/components/providers/commitGen";
import {
  getConflictResolverCandidates,
  resolveConflictResolverConfig,
} from "@/renderer/components/providers/conflictResolver";
import {
  getTitleGenCandidates,
  resolveTitleGenConfig,
} from "@/renderer/components/providers/titleGen";
import {
  ONE_SHOT_UTILITY_PRESENTATION,
  type UtilityPresetEdit,
} from "@/renderer/utils/utilitySelection";
import { GenConfigSection, PresentationModeToggle } from "./AISettings";
import {
  editUtilityPreset,
  readUtilityPreset,
  utilityPresetFields,
  utilitySettingsKeys,
  type UtilityDomain,
} from "./utilityPreset";

/**
 * WS8 parity: the remote host's AI-helper settings, edited in place through
 * `/api/settings` — the desktop-as-client equivalent of the natives' host
 * settings panes. The document belongs to the host (its supervisor runs title
 * generation, commit messages, and conflict resolution for its projects), so
 * edits patch the host and never touch this desktop's local settings.
 */

type EnvKind = "windows" | "wsl";
const domains = ["titleGen", "commitGen", "conflictResolver"] as const;

function presentationKey(wsl: boolean) {
  return wsl ? "wslConflictResolverPresentationMode" : "conflictResolverPresentationMode";
}

function presentationMode(doc: RemoteSettings, wsl: boolean) {
  return doc[presentationKey(wsl)] ?? "gui";
}

/** Commit each changed preset and its scalar mirrors in one host patch. */
function buildPatch(baseline: RemoteSettings, draft: RemoteSettings): RemoteSettingsPatch {
  const patch: RemoteSettingsPatch = {};
  for (const wsl of [false, true]) {
    for (const domain of domains) {
      const keys = utilitySettingsKeys(domain, wsl);
      const before = readUtilityPreset(baseline, keys);
      const after = readUtilityPreset(draft, keys);
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      patch[keys.provider] = after.provider;
      patch[keys.model] = after.model;
      patch[keys.effort] = after.effort;
      patch[keys.fast] = after.fast;
      if (after.selection !== undefined) patch[keys.canonical] = after.selection;
    }
    const mode = presentationMode(draft, wsl);
    if (mode !== presentationMode(baseline, wsl)) patch[presentationKey(wsl)] = mode;
  }
  return patch;
}

interface RemoteHostSettingsProps {
  readonly desktopId: string;
  readonly isOnline: boolean;
  readonly canRead: boolean;
  readonly canWrite: boolean;
}

export function RemoteHostSettingsSection(props: RemoteHostSettingsProps) {
  if (!props.isOnline || !props.canRead) return null;
  return (
    <ConnectedHostSettings
      key={props.desktopId}
      desktopId={props.desktopId}
      canWrite={props.canWrite}
    />
  );
}

function ConnectedHostSettings({
  desktopId,
  canWrite,
}: Pick<RemoteHostSettingsProps, "desktopId" | "canWrite">) {
  const { t } = useLingui();
  const withClient = useRemoteServersStore((s) => s.withClient);
  const agentStatuses = useRemoteServersStore((s) => s.runtime[desktopId]?.agentStatuses);

  const [baseline, setBaseline] = useState<RemoteSettings | null>(null);
  const [draft, setDraft] = useState<RemoteSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [envKind, setEnvKind] = useState<EnvKind>("windows");

  const readRevision = useRef(0);
  const invalidateReads = useCallback(() => {
    readRevision.current++;
  }, []);
  const load = useCallback(() => {
    const revision = ++readRevision.current;
    void withClient(desktopId, (client) => client.settings())
      .then((document) => {
        if (revision !== readRevision.current) return;
        setBaseline(document);
        setDraft(document);
        setSaveError(null);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (revision === readRevision.current) setLoadError(friendlyError(error));
      })
      .finally(() => {
        if (revision === readRevision.current) setReloading(false);
      });
  }, [desktopId, withClient]);

  useEffect(() => {
    load();
    return invalidateReads;
  }, [invalidateReads, load]);

  const windowsStatuses = agentStatuses?.windows ?? [];
  const wslStatuses = agentStatuses?.wsl ?? [];
  const hasWsl = wslStatuses.length > 0;
  const wsl = envKind === "wsl";
  const activeStatuses = wsl ? wslStatuses : windowsStatuses;
  const documentReady = baseline !== null && draft !== null;
  const dirty =
    baseline !== null && draft !== null && Object.keys(buildPatch(baseline, draft)).length > 0;
  const canEdit = canWrite && !saving;

  function setConfig(
    domain: UtilityDomain,
    provider: string,
    model: string,
    effort: string,
    fast: boolean,
    edit: UtilityPresetEdit,
  ): void {
    if (!canEdit) return;
    const keys = utilitySettingsKeys(domain, wsl);
    setDraft((current) => {
      if (!current) return current;
      const stored = readUtilityPreset(current, keys);
      const mode =
        domain === "conflictResolver"
          ? presentationMode(current, wsl)
          : ONE_SHOT_UTILITY_PRESENTATION;
      const selection = editUtilityPreset(stored, { provider, model, effort, fast }, edit, mode);
      if (!selection) return current;
      return { ...current, ...utilityPresetFields(keys, provider, selection) };
    });
  }

  function setPresentation(mode: "gui" | "terminal"): void {
    if (!canEdit) return;
    const keys = utilitySettingsKeys("conflictResolver", wsl);
    setDraft((current) => {
      if (!current || presentationMode(current, wsl) === mode) return current;
      const stored = readUtilityPreset(current, keys);
      const selection = editUtilityPreset(stored, stored, { kind: "presentation" }, mode);
      if (!selection) return current;
      return {
        ...current,
        ...utilityPresetFields(keys, stored.provider, selection),
        [presentationKey(wsl)]: mode,
      };
    });
  }

  function save(): void {
    if (baseline === null || draft === null || !dirty || !canEdit) return;
    const patch = buildPatch(baseline, draft);
    setSaving(true);
    setSaveError(null);
    void withClient(desktopId, (client) => client.updateSettings(patch))
      .then((document) => {
        invalidateReads();
        setBaseline(document);
        setDraft(document);
        setLoadError(null);
        setReloading(false);
      })
      .catch((error: unknown) => {
        setSaveError(friendlyError(error));
      })
      .finally(() => setSaving(false));
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-foreground/80">
          <Trans>Host settings</Trans>
        </h3>
        {hasWsl ? (
          <ToggleButtonGroup
            aria-label={t`Environment`}
            className="h-7 [&_button]:h-7 [&_button]:min-h-0 [&_button]:min-w-0 [&_button]:px-2"
            selectionMode="single"
            disallowEmptySelection
            size="sm"
            selectedKeys={[envKind]}
            onSelectionChange={(keys) => {
              const next = [...keys][0] as EnvKind | undefined;
              if (next) setEnvKind(next);
            }}
          >
            <ToggleButton isIconOnly id="windows" aria-label={t`Windows`}>
              <Monitor className="size-3.5" />
            </ToggleButton>
            <ToggleButton isIconOnly id="wsl" aria-label={t`WSL`}>
              <ToggleButtonGroup.Separator />
              <TuxIcon className="size-7" />
            </ToggleButton>
          </ToggleButtonGroup>
        ) : null}
      </div>
      <p className="mb-3 text-xs text-muted">
        <Trans>
          These AI helpers run on this host for its projects. Changes apply to the host, not this
          desktop.
        </Trans>
      </p>

      {!documentReady && loadError === null ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted">
          <Loader2 className="size-4 animate-spin" aria-label={t`Loading`} />
          <Trans>Loading host settings…</Trans>
        </div>
      ) : null}

      {loadError !== null ? (
        <div className="flex items-center gap-2 py-2 text-xs text-danger">
          <span role="alert" className="min-w-0 flex-1">
            {loadError}
          </span>
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            aria-label={t`Retry`}
            isDisabled={reloading}
            onPress={() => {
              setReloading(true);
              load();
            }}
          >
            {reloading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </Button>
        </div>
      ) : null}

      {documentReady && draft !== null ? (
        <div className="space-y-6">
          <GenConfigSection
            heading={t`Title Generation`}
            allowDisabled
            requireOneShot
            description={t`Generates short titles for new threads.`}
            agentStatuses={activeStatuses}
            {...readUtilityPreset(draft, utilitySettingsKeys("titleGen", wsl))}
            isReadOnly={!canEdit}
            resolve={resolveTitleGenConfig}
            getCandidates={getTitleGenCandidates}
            onConfigChange={(provider, model, effort, fast, edit) =>
              setConfig("titleGen", provider, model, effort, fast, edit)
            }
          />
          <GenConfigSection
            heading={t`Commit Message Generation`}
            requireOneShot
            description={t`Generates commit messages from staged changes.`}
            agentStatuses={activeStatuses}
            {...readUtilityPreset(draft, utilitySettingsKeys("commitGen", wsl))}
            isReadOnly={!canEdit}
            resolve={resolveCommitGenConfig}
            getCandidates={getCommitGenCandidates}
            onConfigChange={(provider, model, effort, fast, edit) =>
              setConfig("commitGen", provider, model, effort, fast, edit)
            }
          />
          <GenConfigSection
            heading={t`Conflict Resolver`}
            description={t`Resolves merge conflicts during rebase or merge.`}
            agentStatuses={activeStatuses}
            {...readUtilityPreset(draft, utilitySettingsKeys("conflictResolver", wsl))}
            isReadOnly={!canEdit}
            resolve={resolveConflictResolverConfig}
            getCandidates={getConflictResolverCandidates}
            onConfigChange={(provider, model, effort, fast, edit) =>
              setConfig("conflictResolver", provider, model, effort, fast, edit)
            }
            presentationMode={presentationMode(draft, wsl)}
            extraControls={
              canWrite ? (
                <PresentationModeToggle
                  ariaLabel={t`Open conflict resolver in`}
                  value={presentationMode(draft, wsl)}
                  isDisabled={!canEdit}
                  onChange={setPresentation}
                />
              ) : null
            }
          />

          {canWrite ? (
            <div className="flex items-center gap-2">
              <Button variant="tertiary" size="sm" isDisabled={!dirty || saving} onPress={save}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                <Trans>Save changes</Trans>
              </Button>
              {saveError ? (
                <span role="alert" className="min-w-0 truncate text-xs text-danger">
                  {saveError}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted/70">
              <Trans>View-only — this connection can't change host settings.</Trans>
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
