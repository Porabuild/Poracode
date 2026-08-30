import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Check, ChevronRight, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { agentProfileKind, type AgentInstanceConfig, type AgentStatus } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { ConfirmDialog, Input, PixelLoader } from "@/renderer/components/common";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { flushSharedSettings, useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { currentWslDistros } from "@/renderer/utils/acpRegistryAuth";
import type { NativeAgentProfileSupport } from "./agentRegistryNative";
import { isDuplicateProfileName, uniqueProfileId } from "./profileIds";

/**
 * The profile list every multi-profile provider renders on its base settings
 * page: add, open, rename-free listing, and confirmed removal.
 *
 * Everything a provider can differ on arrives through its
 * `NativeAgentProfileSupport` descriptor — the second add-form field, the row
 * subtitle, the removal consequence, and how a create turns into a payload. The
 * flow itself (id derivation, duplicate-name guard, Enter-to-submit, sealed
 * create through `createProfile`, pending state, rollback on a failed flush,
 * status refresh) is shared, so adding profiles to a new provider is a
 * descriptor, not another copy of this file.
 */
export function AgentProfileList(props: {
  profiles: NativeAgentProfileSupport;
  /** The base provider's detected statuses, forwarded to `onCreated`. */
  statuses?: readonly AgentStatus[] | undefined;
  onOpenProfile?: ((profileKind: string) => void) | undefined;
}) {
  const { profiles: support } = props;
  const { t } = useLingui();
  const agentInstances = useSharedSettings((state) => state.agentInstances);
  const setAgentInstance = useSharedSettings((state) => state.setAgentInstance);
  const removeAgentInstance = useSharedSettings((state) => state.removeAgentInstance);
  const removeAgentStatus = useAgentStatusesStore((state) => state.removeAgentStatus);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingKind, setPendingKind] = useState<string | undefined>();
  const [removingKind, setRemovingKind] = useState<string | undefined>();
  const [confirmRemoval, setConfirmRemoval] = useState<AgentInstanceConfig | undefined>();
  const [newName, setNewName] = useState("");
  const [newField, setNewField] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const driverInstances = Object.values(agentInstances).filter(
    (instance) => instance.driver === support.driver,
  );
  const listed = driverInstances
    .filter((instance) => instance.enabled !== false)
    .sort((left, right) =>
      (left.displayName ?? left.id).localeCompare(right.displayName ?? right.id),
    );

  const trimmedName = newName.trim();
  const isDuplicate = isDuplicateProfileName(trimmedName, driverInstances);
  const fieldPlaceholder = support.field.placeholderFor
    ? support.field.placeholderFor(newName)
    : support.field.placeholder
      ? t(support.field.placeholder)
      : "";
  const canSubmit =
    trimmedName.length > 0 &&
    !isDuplicate &&
    (support.field.required !== true || newField.trim().length > 0);

  const closeAddForm = () => {
    setIsAdding(false);
    setNewName("");
    setNewField("");
    // The form inputs unmount on close; hand keyboard focus back to the toggle.
    requestAnimationFrame(() => addButtonRef.current?.focus());
  };

  useEffect(() => {
    if (isAdding) nameInputRef.current?.focus();
  }, [isAdding]);

  const refreshProfiles = (kind?: string) =>
    readBridge().refreshAgentStatuses(
      currentWslDistros(),
      kind ? { agentKinds: [kind] } : undefined,
    );

  const addProfile = async () => {
    if (!canSubmit || isSaving) return;
    const displayName = trimmedName;
    const id = uniqueProfileId(displayName, agentInstances);
    const kind = agentProfileKind(support.driver, id);
    setIsSaving(true);
    try {
      // `createProfile` seals the payload in the main process, so a credential
      // entered here never rides the renderer's plaintext settings flush.
      const instance = await readBridge().createProfile(
        support.createPayload({
          id,
          displayName,
          field: support.field.placeholderFor
            ? newField.trim() || fieldPlaceholder
            : newField.trim(),
        }),
      );
      setPendingKind(kind);
      setAgentInstance(instance);
      support.onCreated?.({ profileKind: kind, instance, statuses: props.statuses ?? [] });
      closeAddForm();
      toast.success(t`Profile ${displayName} added.`);
      try {
        // Flush before refreshing so the supervisor's registry rebuild reads
        // any settings the provider pinned in `onCreated`.
        await flushSharedSettings();
        await refreshProfiles(kind);
        props.onOpenProfile?.(kind);
      } catch (error) {
        toast.danger(friendlyError(error));
      } finally {
        setPendingKind(undefined);
      }
    } catch (error) {
      toast.danger(friendlyError(error));
    } finally {
      setIsSaving(false);
    }
  };

  const removeProfile = async (instance: AgentInstanceConfig) => {
    const kind = agentProfileKind(support.driver, instance.id);
    if (removingKind) return;
    setRemovingKind(kind);
    try {
      // `removeAgentInstance` strips the instance plus every profile-scoped
      // slice (`agentSettings`, `providerOrder`, favorites, …) in one store
      // update; snapshot them so a failed flush can restore the exact
      // pre-removal state instead of a half-deleted profile.
      const snapshot = useSharedSettings.getState();
      removeAgentInstance(instance.id);
      try {
        await flushSharedSettings();
      } catch (error) {
        useSharedSettings.setState({
          agentInstances: snapshot.agentInstances,
          providerConfigs: snapshot.providerConfigs,
          providerModelPreferences: snapshot.providerModelPreferences,
          hiddenModels: snapshot.hiddenModels,
          agentSettings: snapshot.agentSettings,
          lastPresentationModeByAgent: snapshot.lastPresentationModeByAgent,
          disabledAgents: snapshot.disabledAgents,
          favoriteModels: snapshot.favoriteModels,
          recentModels: snapshot.recentModels,
          providerOrder: snapshot.providerOrder,
        });
        toast.danger(friendlyError(error));
        return;
      }
      removeAgentStatus(kind);
      try {
        await refreshProfiles();
      } catch {
        toast.danger(t`Profile removed, but statuses could not be refreshed.`);
        return;
      }
      toast.success(t`Profile removed.`);
    } finally {
      setRemovingKind(undefined);
    }
  };

  const submitOnEnter = (event: { key: string; preventDefault: () => void }) => {
    // Pasting a value and then hunting for a 28px icon-only button is the whole
    // friction of this form.
    if (event.key !== "Enter") return;
    event.preventDefault();
    void addProfile();
  };

  return (
    <div className="border-t border-border/10 pt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            <Trans>Profiles</Trans>
          </p>
          <p className="text-xs text-muted">{support.description}</p>
        </div>
        {/* Profiles only appear once detection has seen them, so re-running it
            is the recovery when one is missing from the sidebar. */}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 min-h-7 gap-1 px-2 text-[11px]"
          onPress={() =>
            void refreshProfiles().catch((error) => toast.danger(friendlyError(error)))
          }
        >
          <RefreshCw className="size-3" />
          <Trans>Refresh</Trans>
        </Button>
      </div>

      {listed.length === 0 && !isAdding ? (
        <p className="py-2 text-xs text-muted">
          <Trans>No additional profiles.</Trans>
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {listed.map((instance) => {
          const label = instance.displayName ?? instance.id;
          const kind = agentProfileKind(support.driver, instance.id);
          const isPending = pendingKind === kind || removingKind === kind;
          return (
            <div
              key={instance.id}
              className="flex items-center gap-3 rounded-xl border border-border/15 bg-surface-secondary/30 px-3 py-2"
            >
              <button
                type="button"
                aria-label={t`Open ${label}`}
                className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-50"
                disabled={isPending}
                onClick={() => props.onOpenProfile?.(kind)}
              >
                <span className="flex min-w-0 flex-1 flex-col items-start">
                  <span className="max-w-full truncate text-sm font-medium text-foreground">
                    {label}
                  </span>
                  <span className="max-w-full truncate text-[11px] text-muted">
                    <support.RowSubtitle instance={instance} />
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 min-w-7 items-center justify-center"
                >
                  {/* A greyed-out row with no motion reads as broken; detection
                      and removal both take a supervisor round-trip. */}
                  {isPending ? <PixelLoader size="xs" /> : <ChevronRight className="size-3.5" />}
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  isIconOnly
                  aria-label={t`Remove profile ${label}`}
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 min-w-7 text-danger"
                  isDisabled={isPending}
                  onPress={() => setConfirmRemoval(instance)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          );
        })}

        {isAdding ? (
          <div className="rounded-xl border border-border/15 bg-surface-secondary/30 p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-2">
              <Input
                ref={nameInputRef}
                aria-label={t`New profile name`}
                className="min-w-0"
                placeholder={t`e.g. Work`}
                value={newName}
                disabled={isSaving}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={submitOnEnter}
              />
              <Input
                aria-label={t(support.field.ariaLabel)}
                className={`min-w-0${support.field.secret ? " font-mono text-xs" : ""}`}
                placeholder={fieldPlaceholder}
                value={newField}
                disabled={isSaving}
                onChange={(event) => setNewField(event.target.value)}
                onKeyDown={submitOnEnter}
                {...(support.field.secret
                  ? {
                      type: "password" as const,
                      spellCheck: false,
                      autoCapitalize: "off" as const,
                      autoCorrect: "off" as const,
                    }
                  : {})}
              />
              {/* Icon-only actions matching the saved rows' action pair, so the
                  action column keeps the same width when the draft opens. */}
              <div className="flex shrink-0 items-center gap-1 justify-self-end">
                <Button
                  isIconOnly
                  aria-label={t`Create profile`}
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 min-w-7"
                  isDisabled={!canSubmit}
                  isPending={isSaving}
                  onPress={() => void addProfile()}
                >
                  <Check className="size-3.5" />
                </Button>
                <Button
                  isIconOnly
                  aria-label={t`Cancel new profile`}
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 min-w-7"
                  isDisabled={isSaving}
                  onPress={closeAddForm}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
            {isDuplicate ? (
              <p className="mt-1.5 text-[11px] text-danger">
                <Trans>A profile with this name already exists.</Trans>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {!isAdding ? (
        <Button
          ref={addButtonRef}
          size="sm"
          variant="ghost"
          className="mt-2 h-7 min-h-7 gap-1 px-2 text-[11px]"
          onPress={() => setIsAdding(true)}
        >
          <Plus className="size-3" />
          <Trans>Add profile</Trans>
        </Button>
      ) : null}

      <ConfirmDialog
        isOpen={confirmRemoval !== undefined}
        title={t`Remove profile?`}
        body={support.removalBody(confirmRemoval?.displayName ?? confirmRemoval?.id ?? "")}
        confirmLabel={t`Remove`}
        onConfirm={() => {
          const instance = confirmRemoval;
          setConfirmRemoval(undefined);
          if (instance) void removeProfile(instance);
        }}
        onClose={() => setConfirmRemoval(undefined)}
      />
    </div>
  );
}

/** Convenience wrapper for a provider panel that only renders its list. */
export function agentProfileListFor(
  support: NativeAgentProfileSupport,
): (props: { onOpenProfile?: ((profileKind: string) => void) | undefined }) => ReactNode {
  return (props) => <AgentProfileList profiles={support} onOpenProfile={props.onOpenProfile} />;
}
