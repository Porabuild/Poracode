import { useState } from "react";
import { Button, toast } from "@heroui/react";
import { CircleAlert, LogIn, TriangleAlert } from "lucide-react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  extractAgentProfileInstanceId,
  type AgentInstanceConfig,
  type AgentStatus,
} from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { friendlyError } from "@/shared/messages";
import { Input, Select } from "@/renderer/components/common";
import { runAgentLoginCommand } from "@/renderer/actions/agentLoginActions";
import { flushSharedSettings, useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { currentWslDistros } from "@/renderer/utils/acpRegistryAuth";
import { AgentProfileList } from "../../../views/SettingsOverlay/parts/AgentProfileList";
import type { NativeAgentProfileSupport } from "../../../views/SettingsOverlay/parts/agentRegistryNative";
import {
  devinCloudDefaultsFormFromConfig,
  devinCloudFormIssues,
  devinProfileAuthKind,
  devinProfileConfigFingerprint,
  devinProfileConfigPatch,
  devinProfileConfigView,
  devinProfileOwnerCandidates,
  devinProfileOwnerRef,
  DEVIN_PROFILE_DRIVER,
  emptyDevinCloudDefaultsForm,
  emptyDevinProfileConfig,
  findDevinProfileDependents,
  type DevinCloudDefaultsForm,
  type DevinProfileConfigForm,
  type DevinProfileConfigView,
} from "./profileConfigUi";
import { DevinCloudChatSetup } from "./cloudProfileSettings";

function refreshDevinProfile(kind?: string): void {
  window.setTimeout(() => {
    void readBridge()
      .refreshAgentStatuses(currentWslDistros(), kind ? { agentKinds: [kind] } : undefined)
      .catch((error) => toast.danger(friendlyError(error)));
  }, 50);
}

// ── Profile list descriptor (rendered on the base "Devin" page) ──────────────

/**
 * Second line under a profile's name: how it logs in, plus the cloud target
 * and root agent type when the profile overrides them. An unusable config is
 * named as such instead of silently looking native.
 */
function DevinProfileRowSubtitle(props: { instance: AgentInstanceConfig }) {
  const { t } = useLingui();
  const instances = useSharedSettings((s) => s.agentInstances);
  const view = devinProfileConfigView(props.instance.config);
  if (view.status === "unsupported-format") {
    return (
      <span className="flex items-center gap-1.5">
        <CircleAlert className="size-3 shrink-0 text-warning" />
        <Trans>Stored in a newer Poracode format — kept, but disabled</Trans>
      </span>
    );
  }
  if (view.status === "invalid") {
    return (
      <span className="flex items-center gap-1.5">
        <CircleAlert className="size-3 shrink-0 text-warning" />
        <Trans>Invalid configuration — kept, but disabled</Trans>
      </span>
    );
  }
  const auth = view.config.auth;
  let authLabel: string;
  if (auth.kind === "native-default") {
    authLabel = t`Same login as Devin`;
  } else if (auth.kind === "isolated-owner") {
    authLabel = t`Own isolated login`;
  } else {
    const owner = instances[auth.ownerId];
    authLabel = owner
      ? t`Shares ${owner.displayName ?? owner.id}`
      : t`Shares missing owner ${auth.ownerId}`;
  }
  const extras = [
    ...(view.config.runtimeTarget === "cloud" ? [t`Cloud`] : []),
    ...(view.config.agentType ? [view.config.agentType] : []),
  ];
  return (
    <span>
      {authLabel}
      {extras.length > 0 ? ` · ${extras.join(" · ")}` : ""}
    </span>
  );
}

/**
 * Devin profiles are configurations under one login by default: native
 * credentials stay where the CLI put them and no key is copied. The optional
 * second field points at a native user-config file (`devin --config`) that
 * differentiates the profile; auth source and the rest are edited on the
 * profile's own page.
 */
export const devinProfileSupport: NativeAgentProfileSupport = {
  driver: DEVIN_PROFILE_DRIVER,
  description: (
    <Trans>
      Multiple Devin configurations under one login — different config files, organizations, or
      approval defaults — or an isolated second login. Native credentials are never copied.
    </Trans>
  ),
  field: {
    ariaLabel: msg`New Devin profile config file (optional)`,
    placeholder: msg`Config file path (optional)`,
  },
  RowSubtitle: DevinProfileRowSubtitle,
  removalBody: (profileName) => (
    <Trans>
      Removing {profileName} drops its Poracode settings only. Devin's own credentials, config
      files, and session history stay on disk, and other profiles are unaffected.
    </Trans>
  ),
  createPayload: ({ id, displayName, field }) => ({
    driver: DEVIN_PROFILE_DRIVER,
    id,
    displayName,
    config: devinProfileConfigPatch(emptyDevinProfileConfig(), {
      authKind: "native-default",
      ownerId: undefined,
      configPath: field,
      orgId: "",
      runtimeTarget: undefined,
      agentType: undefined,
      cloud: emptyDevinCloudDefaultsForm(),
    }),
  }),
};

/**
 * Removal consequence beyond the generic body: profiles that share this
 * profile's isolated login lose their auth source. Rendered by the parent's
 * removal confirmation once `NativeAgentProfileSupport` grows a per-instance
 * notes hook (reported to the integrator — `removalBody` only receives a
 * name, so this component cannot be reached from the descriptor today).
 */
export function DevinProfileRemovalWarning(props: { dependents: readonly AgentInstanceConfig[] }) {
  if (props.dependents.length === 0) return null;
  const names = props.dependents.map((instance) => instance.displayName ?? instance.id);
  return (
    <p className="text-xs text-warning">
      <Trans>
        {names.join(", ")} share this profile's isolated login and will lose their sign-in until
        they pick another owner.
      </Trans>
    </p>
  );
}

// ── Profile editor (rendered on the profile's own settings page) ─────────────

/**
 * The per-profile sign-in slot. Isolated-owner profiles authenticate through
 * the per-environment login rows for this profile kind, which the settings
 * page renders above this panel whenever the profile is installed — this slot
 * stays out of the way there. When the page renders without those rows (the
 * not-installed fallback renders only this panel), the detected per-env
 * sign-in commands are offered here directly — the same commands the generic
 * rows run, never a custom credential store.
 */
function DevinProfileSignInRow(props: {
  authKind: "native-default" | "isolated-owner" | "owner-reference";
  ownerName?: string | undefined;
  statuses: readonly AgentStatus[];
}) {
  const { t } = useLingui();
  const [pendingKind, setPendingKind] = useState<string | undefined>();
  if (props.authKind === "native-default") {
    return (
      <p className="text-[11px] text-muted">
        <Trans>
          Uses Devin's own login on this machine. Sign in or out from the base Devin page — it stays
          the single global login.
        </Trans>
      </p>
    );
  }
  if (props.authKind === "owner-reference") {
    return (
      <p className="text-[11px] text-muted">
        {props.ownerName ? (
          <Trans>
            Shares {props.ownerName}'s isolated login. Manage sign-in on that profile's page.
          </Trans>
        ) : (
          <Trans>
            Shares another profile's isolated login. Manage sign-in on that profile's page.
          </Trans>
        )}
      </p>
    );
  }
  // Installed profiles already get one login row per environment from the
  // generic settings page (it passes this panel only installed statuses);
  // a second sign-in button here would duplicate those. This slot is the
  // fallback for the not-installed page, where the generic rows are absent.
  if (props.statuses.some((status) => status.installed)) return null;
  const pending = props.statuses.filter(
    (status) => typeof status.loginCommand === "string" && status.authState !== "authenticated",
  );
  if (pending.length === 0) return null;
  const signIn = (status: AgentStatus) => {
    if (!status.loginCommand || pendingKind) return;
    setPendingKind(status.kind);
    const opened = runAgentLoginCommand({
      label: status.label,
      command: status.loginCommand,
      onCommandComplete: () => {
        setPendingKind(undefined);
        refreshDevinProfile(status.kind);
      },
    });
    if (!opened) setPendingKind(undefined);
  };
  return (
    <div className="flex flex-col gap-1.5">
      {pending.map((status) => (
        <div key={`${status.kind}-${status.envKind ?? ""}`} className="flex items-center gap-2">
          <Button
            size="sm"
            variant="tertiary"
            className="h-7 min-h-7 gap-1 px-2 text-[11px]"
            aria-label={t`Sign in to ${status.label}`}
            isPending={pendingKind === status.kind}
            onPress={() => signIn(status)}
          >
            <LogIn className="size-3" />
            <Trans>Sign in</Trans>
          </Button>
          <span className="text-[11px] text-muted">
            {t`This profile's isolated login (${status.label}).`}
          </span>
        </div>
      ))}
    </div>
  );
}

const AUTH_KINDS = ["native-default", "isolated-owner", "owner-reference"] as const;
type AuthKind = (typeof AUTH_KINDS)[number];

/**
 * The editor for one Devin profile. Owns the whole instance (name, auth
 * source, config file, org, runtime target, agent type) so there is a single
 * source of truth and a single Save. Unknown future config keys are preserved
 * on save; a config stored by a newer Poracode format renders read-only
 * instead of offering a Save that would drop data.
 */
export function DevinProfileProviderSettings(props: {
  instanceId: string;
  statuses: readonly AgentStatus[];
}) {
  const instance = useSharedSettings((s) => s.agentInstances?.[props.instanceId]);
  if (!instance || instance.driver !== DEVIN_PROFILE_DRIVER) return null;
  const view = devinProfileConfigView(instance.config);
  return (
    <DevinProfileEditor
      key={instance.id}
      instance={instance}
      view={view}
      statuses={props.statuses}
    />
  );
}

function DevinProfileEditor(props: {
  instance: AgentInstanceConfig;
  view: DevinProfileConfigView;
  statuses: readonly AgentStatus[];
}) {
  const { t } = useLingui();
  const setAgentInstance = useSharedSettings((s) => s.setAgentInstance);
  const instances = useSharedSettings((s) => s.agentInstances);
  const profileKind = `${DEVIN_PROFILE_DRIVER}:${props.instance.id}`;
  const raw = props.view.raw;
  const storedAuthKind: AuthKind =
    props.view.status === "usable" ? devinProfileAuthKind(props.view.config) : "native-default";
  const storedOwnerRef =
    props.view.status === "usable" ? devinProfileOwnerRef(props.view.config) : undefined;

  // Local editor state is seeded once from props; the editor is keyed by
  // instance id so it re-seeds when a different profile takes its place.
  const [name, setName] = useState(props.instance.displayName ?? props.instance.id);
  const [authKind, setAuthKind] = useState<AuthKind>(storedAuthKind);
  const [ownerId, setOwnerId] = useState(storedOwnerRef ?? "");
  const [configPath, setConfigPath] = useState(
    typeof raw.configPath === "string" ? raw.configPath : "",
  );
  const [orgId, setOrgId] = useState(typeof raw.orgId === "string" ? raw.orgId : "");
  const [runtimeTarget, setRuntimeTarget] = useState(
    props.view.status === "usable" ? props.view.config.runtimeTarget : undefined,
  );
  const [agentType, setAgentType] = useState(
    props.view.status === "usable" ? props.view.config.agentType : undefined,
  );
  // Cloud chat setup seeds from the stored choices even when the profile is
  // currently local: the choices are dormant cloud scope and a save that
  // never opened the section must not wipe them.
  const [cloud, setCloud] = useState<DevinCloudDefaultsForm>(
    props.view.status === "usable"
      ? devinCloudDefaultsFormFromConfig(props.view.config)
      : emptyDevinCloudDefaultsForm(),
  );
  const [saving, setSaving] = useState(false);

  const displayLabel = props.instance.displayName ?? props.instance.id;
  const trimmedName = name.trim();
  // The reference must point at a current, usable isolated owner; a stored id
  // whose owner disappeared (removed, disabled, or now unusable) blocks Save
  // until the user picks another owner — the stored config itself stays put.
  const ownerCandidates = devinProfileOwnerCandidates(instances, props.instance.id);
  // The reference must point at a current, usable isolated owner; a stored id
  // whose owner disappeared (removed, disabled, or now unusable) blocks Save
  // until the user picks another owner — the stored config itself stays put.
  const ownerSelected =
    authKind === "owner-reference" &&
    ownerId.length > 0 &&
    ownerCandidates.some((candidate) => candidate.id === ownerId);
  const selectedOwnerKnown = authKind !== "owner-reference" || ownerSelected;
  // The stored reference itself is broken until the user resolves it by
  // picking a valid owner or leaving owner-reference auth.
  const ownerReferenceUnresolved =
    authKind === "owner-reference" && storedOwnerRef !== undefined && !ownerSelected;
  // Host-enforced invariant, surfaced before the write: the shared-settings
  // persistence guard (`assertAgentProfileDependencies`) rejects any write
  // that stops this profile from being a usable isolated owner while other
  // profiles still reference it as their login. Disabling Save here shows the
  // consequence up front instead of failing the flush after the fact.
  const loginDependents = findDevinProfileDependents(props.instance.id, instances);
  const wouldBreakLoginDependents =
    props.view.status === "usable" &&
    storedAuthKind === "isolated-owner" &&
    loginDependents.length > 0 &&
    authKind !== "isolated-owner";
  // Cloud chat setup choices are validated only while they are being edited
  // (cloud target); dormant choices on a local profile were valid when stored
  // and are carried untouched.
  const cloudSetupInvalid = runtimeTarget === "cloud" && devinCloudFormIssues(cloud).length > 0;
  const canSave =
    trimmedName.length > 0 &&
    selectedOwnerKnown &&
    !ownerReferenceUnresolved &&
    !wouldBreakLoginDependents &&
    !cloudSetupInvalid &&
    !saving &&
    props.view.status !== "unsupported-format";

  const authOptions: ReadonlyArray<{ id: string; label: string }> = [
    { id: "native-default", label: t`Devin's own login (default)` },
    { id: "isolated-owner", label: t`Own isolated login` },
    { id: "owner-reference", label: t`Share another profile's isolated login` },
  ];
  const ownerName = storedOwnerRef
    ? (instances[storedOwnerRef]?.displayName ?? storedOwnerRef)
    : undefined;

  const form: DevinProfileConfigForm =
    props.view.status === "unsupported-format"
      ? {
          authKind: "native-default",
          ownerId: undefined,
          configPath: "",
          orgId: "",
          runtimeTarget: undefined,
          agentType: undefined,
          cloud: emptyDevinCloudDefaultsForm(),
        }
      : {
          authKind,
          ownerId: authKind === "owner-reference" ? ownerId : undefined,
          configPath,
          orgId,
          runtimeTarget,
          // Cloud ignores the root agent type; the patch removes it on save.
          agentType: runtimeTarget === "cloud" ? undefined : agentType,
          cloud,
        };

  const save = () => {
    if (!canSave) return;
    setSaving(true);
    const previous = props.instance;
    const candidate: AgentInstanceConfig = {
      ...props.instance,
      displayName: trimmedName,
      config: devinProfileConfigPatch(raw, form),
    };
    const persist = async () => {
      setAgentInstance(candidate);
      // Required flush: the store's write queue swallows host rejections, so
      // the flush must fail loudly when the host refused the write (the
      // shared-login dependency guard, a validation error, an IPC failure)
      // instead of resolving into fake saved state.
      await flushSharedSettings({ requireSuccess: true });
      // Read-back stays as extra proof on top: compare what the host actually
      // holds — the display name plus a collision-free canonical fingerprint
      // of both configs parsed through the authoritative shared parser
      // (unknown fields included, key order irrelevant). Anything that does
      // not compare exactly rolls the candidate back.
      const persisted = await readBridge().getSharedSettings();
      const savedInstance = persisted.agentInstances?.[props.instance.id];
      const savedView =
        savedInstance !== undefined ? devinProfileConfigView(savedInstance.config) : undefined;
      const candidateView = devinProfileConfigView(candidate.config);
      const confirmed =
        savedView !== undefined &&
        savedInstance !== undefined &&
        savedInstance.displayName === candidate.displayName &&
        savedView.status === "usable" &&
        candidateView.status === "usable" &&
        devinProfileConfigFingerprint(savedView.config) ===
          devinProfileConfigFingerprint(candidateView.config);
      if (!confirmed) {
        throw new Error(
          t`Devin profile changes were not confirmed by the host; the editor rolled back to the stored settings.`,
        );
      }
      // Status refresh only after the save is actually confirmed: the
      // supervisor rebuilds its registry from the settings file on flush.
      await readBridge().refreshAgentStatuses(currentWslDistros(), {
        agentKinds: [profileKind],
      });
      toast.success(t`Devin ${trimmedName || displayLabel} profile saved.`);
    };
    void persist()
      .catch(async (error: unknown) => {
        setAgentInstance(previous);
        // The rollback write re-queues the stored instance; drain it
        // best-effort so store and host converge even if this flush fails too.
        await flushSharedSettings().catch(() => undefined);
        toast.danger(friendlyError(error));
      })
      .finally(() => setSaving(false));
  };

  if (props.view.status === "unsupported-format") {
    return (
      <div className="space-y-3 border-t border-border/10 pt-4">
        <div className="flex items-start gap-2 rounded-xl border border-border/15 bg-surface-secondary/30 px-3 py-2">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-foreground">
              <Trans>Configuration from a newer Poracode</Trans>
            </p>
            <p className="mt-1 text-xs text-muted">
              <Trans>
                This profile's settings were written by a newer Poracode version (config format{" "}
                {String(props.view.formatVersion)}). They are preserved exactly and the profile
                stays disabled until Poracode learns that format. Nothing is overwritten here.
              </Trans>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 border-t border-border/10 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            <Trans>Devin profile</Trans>
          </p>
          <p className="text-xs text-muted">
            <Trans>
              Login source, config file, organization, and runtime for this configuration. Thread
              knobs like model and approvals stay on the composer.
            </Trans>
          </p>
        </div>
        <Button
          size="sm"
          variant="tertiary"
          aria-label={t`Save Devin profile`}
          className="h-7 min-h-7 px-3 text-[11px]"
          isDisabled={!canSave}
          isPending={saving}
          onPress={save}
        >
          <Trans>Save</Trans>
        </Button>
      </div>

      {props.view.status === "invalid" ? (
        <div className="flex items-start gap-2 rounded-xl border border-border/15 bg-surface-secondary/30 px-3 py-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="text-xs text-muted">
            <Trans>
              The stored configuration is invalid. The stored values are kept; saving below replaces
              them with what this form holds.
            </Trans>
          </p>
        </div>
      ) : null}

      {/* Profile basics */}
      <section className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted">
          <Trans>Name</Trans>
        </span>
        <Input
          aria-label={t`Devin profile name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </section>

      {/* Auth source */}
      <section className="flex flex-col gap-2">
        <p className="text-xs font-medium text-foreground">
          <Trans>Login</Trans>
        </p>
        <div className="max-w-sm">
          <Select
            aria-label={t`Login source`}
            options={authOptions}
            value={authKind}
            onChange={(value) => {
              if (AUTH_KINDS.includes(value as AuthKind)) setAuthKind(value as AuthKind);
            }}
          />
        </div>
        <DevinProfileSignInRow
          authKind={authKind}
          {...(authKind === "owner-reference"
            ? { ownerName: ownerId ? (instances[ownerId]?.displayName ?? ownerId) : ownerName }
            : {})}
          statuses={props.statuses}
        />
        {authKind === "owner-reference" ? (
          ownerCandidates.length === 0 ? (
            <p className="text-[11px] text-warning">
              <Trans>
                No profile with its own isolated login exists yet. Set a profile to "Own isolated
                login" and sign in there first; it then appears here.
              </Trans>
            </p>
          ) : (
            <div className="max-w-sm">
              <Select
                aria-label={t`Shared login owner`}
                options={ownerCandidates.map((candidate) => ({
                  id: candidate.id,
                  label: candidate.displayName,
                }))}
                value={ownerId || null}
                onChange={setOwnerId}
                placeholder={t`Pick the profile whose login to share`}
              />
            </div>
          )
        ) : null}
        {ownerReferenceUnresolved ? (
          <p className="text-[11px] text-warning">
            <Trans>
              The profile this profile shared a login with ({ownerName}) no longer exists or is not
              usable. Pick another owner or switch the login source — nothing is lost until you
              save.
            </Trans>
          </p>
        ) : null}
        {wouldBreakLoginDependents ? (
          <p className="text-[11px] text-warning">
            <Trans>
              {loginDependents.map((dependent) => dependent.displayName ?? dependent.id).join(", ")}{" "}
              share this profile's isolated login. Move them to another owner first — the host
              refuses changes that leave them without a login.
            </Trans>
          </p>
        ) : null}
      </section>

      {/* Native config file */}
      <section className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted">
          <Trans>Config file (optional)</Trans>
        </span>
        <Input
          aria-label={t`Devin profile config file`}
          className="font-mono text-xs"
          placeholder={t`~/.config/devin/config.json`}
          value={configPath}
          onChange={(event) => setConfigPath(event.target.value)}
        />
        <p className="text-[11px] text-muted">
          <Trans>
            Passed to Devin as its user config for this profile only. It does not isolate
            credentials, skills, MCP servers, or plugins — those stay shared with the login.
          </Trans>
        </p>
      </section>

      {/* Organization */}
      <section className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted">
          <Trans>Organization (optional)</Trans>
        </span>
        <Input
          aria-label={t`Devin organization id`}
          className="font-mono text-xs"
          placeholder="org-…"
          value={orgId}
          onChange={(event) => setOrgId(event.target.value)}
        />
        <p className="text-[11px] text-muted">
          <Trans>
            Applied to this profile's config view (devin.org_id). Poracode cannot list the
            organizations a login belongs to; Devin validates the id at launch and an unauthorized
            org fails visibly.
          </Trans>
        </p>
      </section>

      {/* Runtime target + agent type */}
      <section className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted">
            <Trans>Runs on</Trans>
          </span>
          <div className="max-w-56">
            <Select
              aria-label={t`Runtime target`}
              options={[
                { id: "local", label: t`This machine (local)` },
                { id: "cloud", label: t`Devin cloud` },
              ]}
              value={runtimeTarget ?? "local"}
              onChange={(value) => {
                if (value === "cloud") {
                  setRuntimeTarget("cloud");
                  // Cloud chats ignore the root agent type; drop the stored
                  // choice up front so Save removes it instead of the select
                  // silently keeping a value that no longer applies.
                  setAgentType(undefined);
                } else if (value === "local") {
                  setRuntimeTarget("local");
                }
              }}
            />
          </div>
        </div>
        {runtimeTarget === "cloud" ? null : (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted">
              <Trans>Agent type</Trans>
            </span>
            <div className="max-w-56">
              <Select
                aria-label={t`Agent type`}
                options={[
                  { id: "default", label: t`Default coding agent` },
                  { id: "review", label: t`Review` },
                  { id: "summarizer", label: t`Summarizer` },
                ]}
                value={agentType ?? "default"}
                onChange={(value) =>
                  setAgentType(
                    value === "default"
                      ? undefined
                      : value === "review" || value === "summarizer"
                        ? value
                        : undefined,
                  )
                }
              />
            </div>
          </div>
        )}
      </section>
      {runtimeTarget === "cloud" ? (
        <>
          <p className="text-[11px] text-muted">
            <Trans>
              Cloud sessions use their own workspace. Local files and local MCP processes are
              unavailable.
            </Trans>
          </p>
          <DevinCloudChatSetup form={cloud} onChange={setCloud} />
        </>
      ) : null}
      {runtimeTarget !== "cloud" && agentType ? (
        <p className="text-[11px] text-muted">
          <Trans>
            Review and Summarizer are the only root agent types Devin's CLI accepts. Custom native
            personas are subagent definitions configured in Devin's own files — they cannot be
            selected here.
          </Trans>
        </p>
      ) : null}
    </div>
  );
}

// ── Registry wiring ──────────────────────────────────────────────────────────

function DevinProfileList(props: { onOpenProfile?: ((profileKind: string) => void) | undefined }) {
  return <AgentProfileList profiles={devinProfileSupport} onOpenProfile={props.onOpenProfile} />;
}

/**
 * Registry-driven settings panel for the Devin family: the base agent page
 * manages the profile list; a profile page shows that profile's own settings.
 * Wired via `NATIVE_AGENT_REGISTRY_ENTRIES[devin].settingsPanel` (integrator).
 */
export function DevinAgentSettingsPanel(props: {
  agentKind: string;
  statuses: readonly AgentStatus[];
  wslDistros: string[];
  onOpenProfile?: ((profileKind: string) => void) | undefined;
}) {
  const instanceId = extractAgentProfileInstanceId(props.agentKind);
  if (instanceId !== undefined) {
    return (
      <DevinProfileProviderSettings
        key={props.agentKind}
        instanceId={instanceId}
        statuses={props.statuses}
      />
    );
  }
  return <DevinProfileList onOpenProfile={props.onOpenProfile} />;
}
