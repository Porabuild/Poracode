import { useCallback, useEffect, useState } from "react";
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
import { GenConfigSection, PresentationModeToggle } from "./AISettings";

/**
 * WS8 parity: the remote host's AI-helper settings, edited in place through
 * `/api/settings` — the desktop-as-client equivalent of the natives' host
 * settings panes. The document belongs to the host (its supervisor runs title
 * generation, commit messages, and conflict resolution for its projects), so
 * edits patch the host and never touch this desktop's local settings.
 */

type EnvKind = "windows" | "wsl";
type GenGroup = "title" | "commit" | "conflict";

interface GenConfigValue {
  readonly provider: string;
  readonly model: string;
  readonly effort: string;
  readonly fast: boolean;
}

function genConfigValue(doc: RemoteSettings, env: EnvKind, group: GenGroup): GenConfigValue {
  if (env === "windows") {
    if (group === "title") {
      return {
        provider: doc.titleGenProvider,
        model: doc.titleGenModel,
        effort: doc.titleGenEffort,
        fast: doc.titleGenFast,
      };
    }
    if (group === "commit") {
      return {
        provider: doc.commitGenProvider,
        model: doc.commitGenModel,
        effort: doc.commitGenEffort,
        fast: doc.commitGenFast,
      };
    }
    return {
      provider: doc.conflictResolverProvider,
      model: doc.conflictResolverModel,
      effort: doc.conflictResolverEffort,
      fast: doc.conflictResolverFast,
    };
  }
  if (group === "title") {
    return {
      provider: doc.wslTitleGenProvider,
      model: doc.wslTitleGenModel,
      effort: doc.wslTitleGenEffort,
      fast: doc.wslTitleGenFast,
    };
  }
  if (group === "commit") {
    return {
      provider: doc.wslCommitGenProvider,
      model: doc.wslCommitGenModel,
      effort: doc.wslCommitGenEffort,
      fast: doc.wslCommitGenFast,
    };
  }
  return {
    provider: doc.wslConflictResolverProvider,
    model: doc.wslConflictResolverModel,
    effort: doc.wslConflictResolverEffort,
    fast: doc.wslConflictResolverFast,
  };
}

function withGenConfig(
  doc: RemoteSettings,
  env: EnvKind,
  group: GenGroup,
  value: GenConfigValue,
): RemoteSettings {
  if (env === "windows") {
    if (group === "title") {
      return {
        ...doc,
        titleGenProvider: value.provider,
        titleGenModel: value.model,
        titleGenEffort: value.effort,
        titleGenFast: value.fast,
      };
    }
    if (group === "commit") {
      return {
        ...doc,
        commitGenProvider: value.provider,
        commitGenModel: value.model,
        commitGenEffort: value.effort,
        commitGenFast: value.fast,
      };
    }
    return {
      ...doc,
      conflictResolverProvider: value.provider,
      conflictResolverModel: value.model,
      conflictResolverEffort: value.effort,
      conflictResolverFast: value.fast,
    };
  }
  if (group === "title") {
    return {
      ...doc,
      wslTitleGenProvider: value.provider,
      wslTitleGenModel: value.model,
      wslTitleGenEffort: value.effort,
      wslTitleGenFast: value.fast,
    };
  }
  if (group === "commit") {
    return {
      ...doc,
      wslCommitGenProvider: value.provider,
      wslCommitGenModel: value.model,
      wslCommitGenEffort: value.effort,
      wslCommitGenFast: value.fast,
    };
  }
  return {
    ...doc,
    wslConflictResolverProvider: value.provider,
    wslConflictResolverModel: value.model,
    wslConflictResolverEffort: value.effort,
    wslConflictResolverFast: value.fast,
  };
}

function presentationMode(doc: RemoteSettings, env: EnvKind): "gui" | "terminal" {
  return env === "windows"
    ? (doc.conflictResolverPresentationMode ?? "gui")
    : (doc.wslConflictResolverPresentationMode ?? "gui");
}

/** Ships only the keys that actually changed, mirroring the PWA diff push. */
function buildPatch(baseline: RemoteSettings, draft: RemoteSettings): RemoteSettingsPatch {
  const patch: Record<string, unknown> = {};
  for (const env of ["windows", "wsl"] as const) {
    for (const group of ["title", "commit", "conflict"] as const) {
      const before = genConfigValue(baseline, env, group);
      const after = genConfigValue(draft, env, group);
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      const base =
        group === "title" ? "TitleGen" : group === "commit" ? "CommitGen" : "ConflictResolver";
      const key = env === "wsl" ? `wsl${base}` : `${base.charAt(0).toLowerCase()}${base.slice(1)}`;
      patch[`${key}Provider`] = after.provider;
      patch[`${key}Model`] = after.model;
      patch[`${key}Effort`] = after.effort;
      patch[`${key}Fast`] = after.fast;
    }
    const modeBefore = presentationMode(baseline, env);
    const modeAfter = presentationMode(draft, env);
    if (modeBefore !== modeAfter) {
      const modeKey =
        env === "wsl" ? "wslConflictResolverPresentationMode" : "conflictResolverPresentationMode";
      patch[modeKey] = modeAfter;
    }
  }
  return patch as RemoteSettingsPatch;
}

export function RemoteHostSettingsSection(props: {
  readonly desktopId: string;
  readonly isOnline: boolean;
  readonly canRead: boolean;
  readonly canWrite: boolean;
}) {
  const { t } = useLingui();
  const { desktopId, isOnline, canRead, canWrite } = props;
  const withClient = useRemoteServersStore((s) => s.withClient);
  const agentStatuses = useRemoteServersStore((s) => s.runtime[desktopId]?.agentStatuses);

  const [baseline, setBaseline] = useState<RemoteSettings | null>(null);
  /** Which host the loaded baseline belongs to — a stale one renders as loading. */
  const [baselineKey, setBaselineKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<RemoteSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [envKind, setEnvKind] = useState<EnvKind>("windows");

  const load = useCallback(() => {
    void withClient(desktopId, (client) => client.settings())
      .then((document) => {
        setBaseline(document);
        setBaselineKey(desktopId);
        setDraft(document);
        setSaveError(null);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        setLoadError(friendlyError(error));
      })
      .finally(() => setReloading(false));
  }, [desktopId, withClient]);

  useEffect(() => {
    if (!isOnline || !canRead) return;
    load();
  }, [isOnline, canRead, load]);

  if (!isOnline || !canRead) return null;

  const windowsStatuses = agentStatuses?.windows ?? [];
  const wslStatuses = agentStatuses?.wsl ?? [];
  const hasWsl = wslStatuses.length > 0;
  const activeStatuses = envKind === "wsl" ? wslStatuses : windowsStatuses;
  const documentReady = baselineKey === desktopId && baseline !== null && draft !== null;
  const dirty =
    baseline !== null && draft !== null && Object.keys(buildPatch(baseline, draft)).length > 0;

  function setConfig(
    env: EnvKind,
    group: GenGroup,
    provider: string,
    model: string,
    effort: string,
    fast: boolean,
  ): void {
    setDraft((current) =>
      current === null
        ? current
        : withGenConfig(current, env, group, { provider, model, effort, fast }),
    );
  }

  function save(): void {
    if (baseline === null || draft === null || !dirty || saving) return;
    const patch = buildPatch(baseline, draft);
    setSaving(true);
    setSaveError(null);
    void withClient(desktopId, (client) => client.updateSettings(patch))
      .then((document) => {
        setBaseline(document);
        setDraft(document);
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
            provider={genConfigValue(draft, envKind, "title").provider}
            model={genConfigValue(draft, envKind, "title").model}
            effort={genConfigValue(draft, envKind, "title").effort}
            fast={genConfigValue(draft, envKind, "title").fast}
            resolve={resolveTitleGenConfig}
            getCandidates={getTitleGenCandidates}
            onConfigChange={(provider, model, effort, fast) =>
              setConfig(envKind, "title", provider, model, effort, fast)
            }
          />
          <GenConfigSection
            heading={t`Commit Message Generation`}
            requireOneShot
            description={t`Generates commit messages from staged changes.`}
            agentStatuses={activeStatuses}
            provider={genConfigValue(draft, envKind, "commit").provider}
            model={genConfigValue(draft, envKind, "commit").model}
            effort={genConfigValue(draft, envKind, "commit").effort}
            fast={genConfigValue(draft, envKind, "commit").fast}
            resolve={resolveCommitGenConfig}
            getCandidates={getCommitGenCandidates}
            onConfigChange={(provider, model, effort, fast) =>
              setConfig(envKind, "commit", provider, model, effort, fast)
            }
          />
          <GenConfigSection
            heading={t`Conflict Resolver`}
            description={t`Resolves merge conflicts during rebase or merge.`}
            agentStatuses={activeStatuses}
            provider={genConfigValue(draft, envKind, "conflict").provider}
            model={genConfigValue(draft, envKind, "conflict").model}
            effort={genConfigValue(draft, envKind, "conflict").effort}
            fast={genConfigValue(draft, envKind, "conflict").fast}
            resolve={resolveConflictResolverConfig}
            getCandidates={getConflictResolverCandidates}
            onConfigChange={(provider, model, effort, fast) =>
              setConfig(envKind, "conflict", provider, model, effort, fast)
            }
            presentationMode={presentationMode(draft, envKind)}
            extraControls={
              canWrite ? (
                <PresentationModeToggle
                  ariaLabel={t`Open conflict resolver in`}
                  value={presentationMode(draft, envKind)}
                  onChange={(value) =>
                    setDraft((current) =>
                      current === null
                        ? current
                        : envKind === "windows"
                          ? { ...current, conflictResolverPresentationMode: value }
                          : { ...current, wslConflictResolverPresentationMode: value },
                    )
                  }
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
