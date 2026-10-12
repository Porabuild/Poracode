import { useEffect, useState, type ReactNode } from "react";
import { Button, Input, Modal, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  Check,
  ChevronDown,
  Cloud,
  GitBranch,
  Link2,
  Loader2,
  Pencil,
  Plug,
  PlugZap,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  environmentScopesSatisfied,
  type EnvironmentPublicProjection,
  type EnvironmentRuntimeState,
} from "@/shared/environments";
import type { RemoteAccessScope } from "@/shared/remote";
import type { RemoteEnvironmentCreateBody } from "@/shared/remote/contract/environmentSchemas";
import { useAsyncOperation } from "@/renderer/hooks/useAsyncOperation";
import { BottomSheet } from "@/renderer/components/common/BottomSheet";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import {
  EMPTY_ENVIRONMENT_PARENT_STATE,
  useEnvironmentManagementStore,
} from "@/renderer/state/remoteServers/environmentManagement";
import {
  environmentParentCacheKey,
  environmentParentRefFromCacheKey,
  type EnvironmentParentRef,
} from "@/renderer/state/remoteServers/types";

/**
 * Host-owned environment management (C1, ADR §9 / R4).
 *
 * The mode is always named explicitly ("Host-owned environment"): the child
 * runs on the selected server, credentials stay host-side, and this device
 * never sees a child loopback endpoint. Device-local SSH connections keep
 * their own rows and are never presented as environments.
 *
 * Scope gating uses the ADR §6 operation map on the PARENT record's scopes:
 * read (list/get), use (connect/pair/ticket), manage (create/update/delete/
 * trust/migrate/upgrade). A child host's own environments are intentionally
 * not surfaced here — a second proxy hop is refused by construction (R4).
 */

const INPUT_CLASS =
  "w-full !rounded-xl border border-default-200 bg-default-50 px-2.5 py-1.5 text-sm text-foreground shadow-none outline-none transition-colors placeholder:text-muted/50 focus:border-default-400";

interface EnvironmentDraft {
  label: string;
  target: string;
  port: string;
  credentialRef: string;
}

const EMPTY_DRAFT: EnvironmentDraft = { label: "", target: "", port: "", credentialRef: "" };

function draftFrom(environment: EnvironmentPublicProjection): EnvironmentDraft {
  return {
    label: environment.label,
    target: environment.target,
    port: environment.port !== undefined ? String(environment.port) : "",
    credentialRef: "",
  };
}

function draftCreateBody(draft: EnvironmentDraft): RemoteEnvironmentCreateBody {
  const port = draft.port.trim();
  return {
    label: draft.label.trim(),
    target: draft.target.trim(),
    ...(port ? { port: Number(port) } : {}),
    ...(draft.credentialRef.trim() ? { credentialRef: draft.credentialRef.trim() } : {}),
  };
}

function useEnvironmentController(
  parent: EnvironmentParentRef,
  parentScopes: readonly RemoteAccessScope[],
) {
  const { t } = useLingui();
  const parentKey = environmentParentCacheKey(parent);
  // Rebuild from the lossless key so the ref's per-render object identity is
  // never an effect dependency (an inline ref must not refetch forever).
  const parentRef = environmentParentRefFromCacheKey(parentKey) ?? parent;
  const bucket = useEnvironmentManagementStore(
    (state) => state.byParent[parentKey] ?? EMPTY_ENVIRONMENT_PARENT_STATE,
  );
  const refreshEnvironments = useEnvironmentManagementStore((state) => state.refreshEnvironments);
  const createEnvironment = useEnvironmentManagementStore((state) => state.createEnvironment);
  const updateEnvironment = useEnvironmentManagementStore((state) => state.updateEnvironment);
  const deleteEnvironment = useEnvironmentManagementStore((state) => state.deleteEnvironment);
  const connectEnvironment = useEnvironmentManagementStore((state) => state.connectEnvironment);
  const disconnectEnvironment = useEnvironmentManagementStore(
    (state) => state.disconnectEnvironment,
  );
  const upgradeEnvironment = useEnvironmentManagementStore((state) => state.upgradeEnvironment);
  const probeEnvironmentTrust = useEnvironmentManagementStore(
    (state) => state.probeEnvironmentTrust,
  );
  const acceptEnvironmentTrust = useEnvironmentManagementStore(
    (state) => state.acceptEnvironmentTrust,
  );
  const adoptLegacyEnvironment = useEnvironmentManagementStore(
    (state) => state.adoptLegacyEnvironment,
  );
  const pairEnvironmentDevice = useEnvironmentManagementStore(
    (state) => state.pairEnvironmentDevice,
  );

  const canRead = environmentScopesSatisfied(parentScopes, "list");
  const canUse = environmentScopesSatisfied(parentScopes, "connect");
  const canManage = environmentScopesSatisfied(parentScopes, "create");

  useEffect(() => {
    const current = environmentParentRefFromCacheKey(parentKey);
    if (!canRead || !current) return;
    void refreshEnvironments(current).catch(() => undefined);
  }, [canRead, parentKey, refreshEnvironments]);

  const stateLabel = (state: EnvironmentRuntimeState | undefined): string => {
    switch (state) {
      case "connected":
        return t`Connected`;
      case "connecting":
        return t`Connecting…`;
      case "credential-missing":
        return t`Credential missing`;
      case "owner-unverified":
        return t`Owner unverified`;
      case "identity-changed":
        return t`Identity changed`;
      case "hostkey-mismatch":
        return t`Host key mismatch`;
      case "needs-repair":
        return t`Needs repair`;
      case "error":
        return t`Error`;
      default:
        return t`Disconnected`;
    }
  };

  return {
    ...bucket,
    canRead,
    canUse,
    canManage,
    refresh: () => refreshEnvironments(parentRef),
    create: (draft: EnvironmentDraft) => createEnvironment(parentRef, draftCreateBody(draft)),
    update: (environmentId: string, draft: EnvironmentDraft) =>
      updateEnvironment(parentRef, environmentId, {
        label: draft.label.trim(),
        target: draft.target.trim(),
        port: draft.port.trim() ? Number(draft.port.trim()) : null,
        // An empty field means "keep the current credential reference" (as the
        // edit dialog states). The host contract reserves `null` for an
        // explicit clear, so the key is omitted rather than sent as null. This
        // UI deliberately offers no clear action; a metadata-only edit must
        // never wipe the stored reference.
        ...(draft.credentialRef.trim() ? { credentialRef: draft.credentialRef.trim() } : {}),
      }),
    setDesired: (environmentId: string, desired: "enabled" | "disabled") =>
      updateEnvironment(parentRef, environmentId, { desired }),
    remove: (environmentId: string) => deleteEnvironment(parentRef, environmentId),
    connect: (environmentId: string) => connectEnvironment(parentRef, environmentId),
    disconnect: (environmentId: string) => disconnectEnvironment(parentRef, environmentId),
    upgrade: (environmentId: string) => upgradeEnvironment(parentRef, environmentId),
    probeTrust: (environmentId: string) => probeEnvironmentTrust(parentRef, environmentId),
    acceptTrust: (environmentId: string, fingerprint: string) =>
      acceptEnvironmentTrust(parentRef, environmentId, fingerprint),
    adoptLegacy: (environmentId: string, legacyConnectionId: string) =>
      adoptLegacyEnvironment(parentRef, environmentId, legacyConnectionId),
    pairDevice: (environmentId: string) => pairEnvironmentDevice(parentRef, environmentId),
    stateLabel,
  };
}

function EnvironmentForm(props: {
  readonly initial: EnvironmentDraft;
  readonly submitLabel: string;
  readonly busy: boolean;
  readonly onSubmit: (draft: EnvironmentDraft) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useLingui();
  const [draft, setDraft] = useState<EnvironmentDraft>(props.initial);
  return (
    <div className="flex flex-col gap-2">
      <Input
        className={INPUT_CLASS}
        aria-label={t`Environment name`}
        placeholder={t`Environment name`}
        value={draft.label}
        onChange={(event) => setDraft({ ...draft, label: event.currentTarget.value })}
      />
      <Input
        className={INPUT_CLASS}
        aria-label={t`SSH target`}
        placeholder={t`user@host`}
        spellCheck={false}
        autoCapitalize="off"
        value={draft.target}
        onChange={(event) => setDraft({ ...draft, target: event.currentTarget.value })}
      />
      <div className="flex gap-2">
        <Input
          className={INPUT_CLASS}
          aria-label={t`SSH port`}
          placeholder={t`Port`}
          inputMode="numeric"
          value={draft.port}
          onChange={(event) => setDraft({ ...draft, port: event.currentTarget.value })}
        />
        <Input
          className={INPUT_CLASS}
          aria-label={t`Host credential reference`}
          placeholder={t`Host credential reference (optional)`}
          spellCheck={false}
          autoCapitalize="off"
          value={draft.credentialRef}
          onChange={(event) => setDraft({ ...draft, credentialRef: event.currentTarget.value })}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="tertiary"
          size="sm"
          isDisabled={props.busy || !draft.label.trim() || !draft.target.trim()}
          onPress={() => props.onSubmit(draft)}
        >
          {props.busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {props.submitLabel}
        </Button>
        <Button variant="ghost" size="sm" isDisabled={props.busy} onPress={props.onCancel}>
          <X className="size-4" />
          <Trans>Cancel</Trans>
        </Button>
      </div>
    </div>
  );
}

function EnvironmentRowActions(props: {
  readonly environment: EnvironmentPublicProjection;
  readonly controller: ReturnType<typeof useEnvironmentController>;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onUpgrade: () => void;
  readonly onAdoptLegacy: () => void;
  readonly compact: boolean;
}) {
  const { t } = useLingui();
  const { environment, controller } = props;
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const { busy, run } = useAsyncOperation();
  const connected = environment.state === "connected";

  const pair = () =>
    run(async () => {
      const record = await controller.pairDevice(environment.environmentId);
      toast.success(t`Paired ${record.label} on this device.`);
    });

  const probe = () =>
    run(async () => {
      const result = await controller.probeTrust(environment.environmentId);
      setFingerprint(result.fingerprint);
    });

  const accept = () =>
    run(async () => {
      if (!fingerprint) return;
      await controller.acceptTrust(environment.environmentId, fingerprint);
      setFingerprint(null);
      toast.success(t`Host key trust accepted.`);
    });

  const items = (
    <>
      {controller.canManage ? (
        <SidebarButton
          icon={<PlugZap className="size-4" />}
          label={environment.desired === "enabled" ? t`Disable on host` : t`Enable on host`}
          isDisabled={busy}
          onPress={() =>
            run(async () => {
              await controller.setDesired(
                environment.environmentId,
                environment.desired === "enabled" ? "disabled" : "enabled",
              );
            })
          }
        />
      ) : null}
      <SidebarButton
        icon={<Pencil className="size-4" />}
        label={t`Edit`}
        isDisabled={busy || !controller.canManage}
        onPress={props.onEdit}
      />
      {controller.canUse ? (
        <SidebarButton
          icon={connected ? <Plug className="size-4" /> : <PlugZap className="size-4" />}
          label={connected ? t`Disconnect` : t`Connect`}
          isDisabled={busy}
          onPress={() =>
            run(async () => {
              if (connected) await controller.disconnect(environment.environmentId);
              else await controller.connect(environment.environmentId);
            })
          }
        />
      ) : null}
      {controller.canUse && !connected ? (
        <SidebarButton
          icon={<Link2 className="size-4" />}
          label={t`Pair this device`}
          isDisabled={busy}
          onPress={pair}
        />
      ) : null}
      {controller.canManage ? (
        <SidebarButton
          icon={<ShieldCheck className="size-4" />}
          label={fingerprint ? t`Accept host key` : t`Probe host key`}
          isDisabled={busy}
          onPress={fingerprint ? accept : probe}
        />
      ) : null}
      {controller.canManage ? (
        <SidebarButton
          icon={<GitBranch className="size-4" />}
          label={t`Adopt legacy connection`}
          isDisabled={busy}
          onPress={props.onAdoptLegacy}
        />
      ) : null}
      {controller.canManage ? (
        <SidebarButton
          icon={<Upload className="size-4" />}
          label={t`Upgrade owner`}
          isDisabled={busy}
          onPress={props.onUpgrade}
        />
      ) : null}
      {controller.canManage ? (
        <SidebarButton
          icon={<Trash2 className="size-4 text-danger" />}
          label={<span className="text-danger">{t`Delete environment`}</span>}
          isDisabled={busy}
          onPress={props.onDelete}
        />
      ) : null}
      {fingerprint ? (
        <p className="break-all px-2 pb-1 text-[11px] text-muted">{fingerprint}</p>
      ) : null}
    </>
  );

  if (props.compact) return <div className="m-sheet-list">{items}</div>;
  return (
    <div className="flex flex-wrap items-center gap-1 border-t border-[var(--hairline)] pt-2">
      {controller.canUse ? (
        <Button
          variant="ghost"
          size="sm"
          isDisabled={busy}
          onPress={() =>
            run(async () => {
              if (connected) await controller.disconnect(environment.environmentId);
              else await controller.connect(environment.environmentId);
            })
          }
        >
          {connected ? <Plug className="size-3.5" /> : <PlugZap className="size-3.5" />}
          {connected ? <Trans>Disconnect</Trans> : <Trans>Connect</Trans>}
        </Button>
      ) : null}
      {controller.canUse && !connected ? (
        <Button variant="ghost" size="sm" isDisabled={busy} onPress={pair}>
          <Link2 className="size-3.5" />
          <Trans>Pair this device</Trans>
        </Button>
      ) : null}
      {controller.canManage ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            isDisabled={busy}
            onPress={() =>
              run(async () => {
                await controller.setDesired(
                  environment.environmentId,
                  environment.desired === "enabled" ? "disabled" : "enabled",
                );
              })
            }
          >
            <PlugZap className="size-3.5" />
            {environment.desired === "enabled" ? (
              <Trans>Disable on host</Trans>
            ) : (
              <Trans>Enable on host</Trans>
            )}
          </Button>
          <Button variant="ghost" size="sm" isDisabled={busy} onPress={props.onEdit}>
            <Pencil className="size-3.5" />
            <Trans>Edit</Trans>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            isDisabled={busy}
            onPress={fingerprint ? accept : probe}
          >
            <ShieldCheck className="size-3.5" />
            {fingerprint ? <Trans>Accept host key</Trans> : <Trans>Probe host key</Trans>}
          </Button>
          <Button variant="ghost" size="sm" isDisabled={busy} onPress={props.onUpgrade}>
            <Upload className="size-3.5" />
            <Trans>Upgrade</Trans>
          </Button>
          <Button variant="ghost" size="sm" isDisabled={busy} onPress={props.onAdoptLegacy}>
            <GitBranch className="size-3.5" />
            <Trans>Adopt legacy</Trans>
          </Button>
          <Button variant="ghost" size="sm" isDisabled={busy} onPress={props.onDelete}>
            <Trash2 className="size-3.5" />
            <span className="text-danger">
              <Trans>Delete</Trans>
            </span>
          </Button>
        </>
      ) : null}
    </div>
  );
}

function EnvironmentListEntry(props: {
  readonly environment: EnvironmentPublicProjection;
  readonly controller: ReturnType<typeof useEnvironmentController>;
  readonly compact: boolean;
  readonly onEdit: (environment: EnvironmentPublicProjection) => void;
  readonly onDelete: (environment: EnvironmentPublicProjection) => void;
  readonly onUpgrade: (environment: EnvironmentPublicProjection) => void;
  readonly onAdoptLegacy: (environment: EnvironmentPublicProjection) => void;
}) {
  const { t } = useLingui();
  const { environment, controller } = props;
  const [detailsOpen, setDetailsOpen] = useState(false);
  if (props.compact) {
    return (
      <>
        <button type="button" className="m-thread-row" onClick={() => setDetailsOpen(true)}>
          <Cloud className="size-4 shrink-0 text-muted" />
          <span className="m-thread-row__body">
            <span className="m-thread-row__title">{environment.label}</span>
            <span className="m-thread-row__meta">
              <span className="m-thread-row__meta-text">{environment.target}</span>
              <span className="m-thread-row__meta-item shrink-0">
                {controller.stateLabel(environment.state)}
              </span>
            </span>
          </span>
        </button>
        {detailsOpen ? (
          <BottomSheet
            label={environment.label}
            closeLabel={t`Close environment actions`}
            onClose={() => setDetailsOpen(false)}
          >
            <div className="m-sheet-head">
              <span className="min-w-0 truncate">{environment.label}</span>
            </div>
            <EnvironmentRowActions
              environment={environment}
              controller={controller}
              compact
              onEdit={() => props.onEdit(environment)}
              onDelete={() => props.onDelete(environment)}
              onUpgrade={() => props.onUpgrade(environment)}
              onAdoptLegacy={() => props.onAdoptLegacy(environment)}
            />
          </BottomSheet>
        ) : null}
      </>
    );
  }
  return (
    <details className="rounded-xl border border-[var(--hairline)] px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm">
        <Cloud className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate text-foreground">{environment.label}</span>
        <span className="truncate text-xs text-muted">{environment.target}</span>
        {environment.port !== undefined ? (
          <span className="text-xs text-muted/70">:{environment.port}</span>
        ) : null}
        <span className="shrink-0 text-xs text-muted">
          {controller.stateLabel(environment.state)}
        </span>
        <span className="shrink-0 text-xs text-muted/70">
          {environment.trust.state === "pinned" ? (
            <Trans>Pinned</Trans>
          ) : environment.trust.state === "observed" ? (
            <Trans>Observed</Trans>
          ) : (
            <Trans>Unverified</Trans>
          )}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted" />
      </summary>
      {environment.lastError ? (
        <p className="pt-2 text-xs text-danger">{environment.lastError.message}</p>
      ) : null}
      <EnvironmentRowActions
        environment={environment}
        controller={controller}
        compact={false}
        onEdit={() => props.onEdit(environment)}
        onDelete={() => props.onDelete(environment)}
        onUpgrade={() => props.onUpgrade(environment)}
        onAdoptLegacy={() => props.onAdoptLegacy(environment)}
      />
    </details>
  );
}

export function EnvironmentSettingsSection(props: {
  readonly parent: EnvironmentParentRef;
  readonly parentScopes: readonly RemoteAccessScope[];
  readonly compact?: boolean;
}) {
  const { t } = useLingui();
  const controller = useEnvironmentController(props.parent, props.parentScopes);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EnvironmentPublicProjection | null>(null);
  const [deleting, setDeleting] = useState<EnvironmentPublicProjection | null>(null);
  const [upgrading, setUpgrading] = useState<EnvironmentPublicProjection | null>(null);
  const [adopting, setAdopting] = useState<EnvironmentPublicProjection | null>(null);
  const [legacyConnectionId, setLegacyConnectionId] = useState("");
  const { busy, error, run } = useAsyncOperation();

  if (!controller.canRead) return null;

  const create = (draft: EnvironmentDraft) =>
    run(async () => {
      await controller.create(draft);
      setCreating(false);
    });

  const saveEdit = (draft: EnvironmentDraft) => {
    if (!editing) return;
    run(async () => {
      await controller.update(editing.environmentId, draft);
      setEditing(null);
    });
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold text-foreground/80">
          <Trans>Host-owned environments</Trans>
        </h3>
        <span className="text-[11px] text-muted/70">
          <Trans>Runs on this server. Credentials stay on the server.</Trans>
        </span>
        <span className="flex-1" />
        {controller.canManage ? (
          <Button variant="ghost" size="sm" isDisabled={busy} onPress={() => setCreating(true)}>
            <Plus className="size-3.5" />
            <Trans>New environment</Trans>
          </Button>
        ) : null}
      </div>

      {controller.status === "loading" && controller.environments.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="size-3.5 animate-spin" />
          <Trans>Loading environments…</Trans>
        </div>
      ) : null}
      {controller.environments.length === 0 && controller.status !== "loading" ? (
        <p className="text-xs text-muted/70">
          <Trans>No host-owned environments on this server yet.</Trans>
        </p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        {controller.environments.map((environment) => (
          <EnvironmentListEntry
            key={environment.environmentId}
            environment={environment}
            controller={controller}
            compact={props.compact === true}
            onEdit={() => setEditing(environment)}
            onDelete={() => setDeleting(environment)}
            onUpgrade={() => setUpgrading(environment)}
            onAdoptLegacy={() => {
              setLegacyConnectionId("");
              setAdopting(environment);
            }}
          />
        ))}
      </div>
      {controller.status === "error" && controller.error ? (
        <p role="alert" className="text-xs text-danger">
          {controller.error}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      {creating && props.compact !== true ? (
        <div className="rounded-xl border border-[var(--hairline)] p-3">
          <EnvironmentForm
            initial={EMPTY_DRAFT}
            submitLabel={t`Create`}
            busy={busy}
            onSubmit={create}
            onCancel={() => setCreating(false)}
          />
        </div>
      ) : null}
      {creating && props.compact === true ? (
        <BottomSheet label={t`New environment`} onClose={() => setCreating(false)}>
          <div className="m-sheet-head">
            <span>{t`New environment`}</span>
          </div>
          <div className="px-0.5 pb-2">
            <EnvironmentForm
              initial={EMPTY_DRAFT}
              submitLabel={t`Create`}
              busy={busy}
              onSubmit={create}
              onCancel={() => setCreating(false)}
            />
          </div>
        </BottomSheet>
      ) : null}

      <Modal.Backdrop isOpen={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <Modal.Container size="md" scroll="inside">
          <Modal.Dialog className="overflow-hidden p-0">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-[var(--hairline)] px-5 py-4">
              <Modal.Heading className="text-sm">
                <Trans>Edit environment</Trans>
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="!m-0 !px-5 !py-4">
              {editing ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted">{editing.environmentId}</p>
                  <p className="text-xs text-muted">
                    <Trans>Leave the credential reference empty to keep the current one.</Trans>
                  </p>
                  <EnvironmentForm
                    initial={draftFrom(editing)}
                    submitLabel={t`Save`}
                    busy={busy}
                    onSubmit={saveEdit}
                    onCancel={() => setEditing(null)}
                  />
                </div>
              ) : null}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <ConfirmDialog
        isOpen={deleting !== null}
        title={t`Delete environment`}
        body={
          <Trans>
            This removes the environment from the host. The server's child workspace is not deleted.
          </Trans>
        }
        confirmLabel={t`Delete`}
        busy={busy}
        onConfirm={() =>
          run(async () => {
            if (deleting) await controller.remove(deleting.environmentId);
            setDeleting(null);
          })
        }
        onCancel={() => setDeleting(null)}
      />

      <ConfirmDialog
        isOpen={upgrading !== null}
        title={t`Upgrade environment owner`}
        body={
          <Trans>
            The host stops and restarts this environment's owner with the bundled runtime. The
            child's data directory is not touched.
          </Trans>
        }
        confirmLabel={t`Upgrade`}
        busy={busy}
        onConfirm={() =>
          run(async () => {
            if (upgrading) await controller.upgrade(upgrading.environmentId);
            setUpgrading(null);
          })
        }
        onCancel={() => setUpgrading(null)}
      />

      <Modal.Backdrop
        isOpen={adopting !== null}
        onOpenChange={(open) => !open && setAdopting(null)}
      >
        <Modal.Container size="sm" scroll="inside">
          <Modal.Dialog className="overflow-hidden p-0">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-[var(--hairline)] px-5 py-4">
              <Modal.Heading className="text-sm">
                <Trans>Adopt legacy connection</Trans>
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="!m-0 flex flex-col gap-2 !px-5 !py-4">
              <p className="text-xs text-muted">
                <Trans>
                  Move an existing device-local SSH connection onto this environment by its
                  connection id. Keys are never uploaded.
                </Trans>
              </p>
              <Input
                className={INPUT_CLASS}
                aria-label={t`Legacy connection id`}
                placeholder={t`Legacy connection id`}
                spellCheck={false}
                value={legacyConnectionId}
                onChange={(event) => setLegacyConnectionId(event.currentTarget.value)}
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="tertiary"
                  size="sm"
                  isDisabled={busy || legacyConnectionId.trim().length === 0}
                  onPress={() =>
                    run(async () => {
                      if (!adopting) return;
                      await controller.adoptLegacy(
                        adopting.environmentId,
                        legacyConnectionId.trim(),
                      );
                      setAdopting(null);
                    })
                  }
                >
                  <Check className="size-4" />
                  <Trans>Adopt</Trans>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  isDisabled={busy}
                  onPress={() => setAdopting(null)}
                >
                  <Trans>Cancel</Trans>
                </Button>
              </div>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </section>
  );
}

function ConfirmDialog(props: {
  readonly isOpen: boolean;
  readonly title: string;
  readonly body: ReactNode;
  readonly confirmLabel: string;
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <Modal.Backdrop isOpen={props.isOpen} onOpenChange={(open) => !open && props.onCancel()}>
      <Modal.Container size="sm" scroll="inside">
        <Modal.Dialog className="overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-[var(--hairline)] px-5 py-4">
            <Modal.Heading className="text-sm">{props.title}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="!m-0 flex flex-col gap-3 !px-5 !py-4">
            <div className="text-xs text-muted">{props.body}</div>
            <div className="flex items-center gap-2">
              <Button variant="danger" size="sm" isDisabled={props.busy} onPress={props.onConfirm}>
                {props.busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {props.confirmLabel}
              </Button>
              <Button variant="ghost" size="sm" isDisabled={props.busy} onPress={props.onCancel}>
                <Trans>Cancel</Trans>
              </Button>
            </div>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
