import { ContentSurface } from "@/renderer/components/common/ContentSurface";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Check, ChevronRight, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { agentProfileKind, type AgentInstanceConfig, type AgentStatus } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { ConfirmDialog, Input, PixelLoader } from "@/renderer/components/common";
import {
  useAgentSettingsHost,
  useHostAgentInstances,
} from "@/renderer/components/providers/settings/AgentSettingsHostContext";
import { usePairedHostProfiles } from "@/renderer/state/pairedHostProfiles";
import { flushSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { NativeAgentProfileSupport } from "./agentRegistryNative";
import { AgentProfileDialog } from "./AgentProfileDialog";
import { refreshAgentProfiles } from "./agentProfileCreate";
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
  /** Host/env-wide statuses for local-model suggestions across providers. */
  suggestionStatuses?: readonly AgentStatus[] | undefined;
  workspaceIsClientDevice?: boolean | undefined;
  onOpenProfile?: ((profileKind: string) => void) | undefined;
}) {
  if (!useAgentSettingsHost().canManageProfiles) return null;
  return <AgentProfileListBody {...props} />;
}

function AgentProfileListBody(props: {
  profiles: NativeAgentProfileSupport;
  statuses?: readonly AgentStatus[] | undefined;
  suggestionStatuses?: readonly AgentStatus[] | undefined;
  workspaceIsClientDevice?: boolean | undefined;
  onOpenProfile?: ((profileKind: string) => void) | undefined;
}) {
  const { profiles: support } = props;
  const { t } = useLingui();
  const settingsHost = useAgentSettingsHost();
  const agentInstances = useHostAgentInstances();
  const remoteProfiles = usePairedHostProfiles(
    settingsHost.isRemote ? settingsHost.connectionKey : undefined,
  );
  const profilesUnavailable = settingsHost.isRemote && remoteProfiles?.error !== undefined;
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
  // The id `addProfile` will allocate, so a derived default matches what is
  // actually persisted.
  const draftId = uniqueProfileId(trimmedName, agentInstances);
  const fieldPlaceholder = support.field?.placeholderFor
    ? support.field.placeholderFor(newName, draftId)
    : support.field?.placeholder
      ? t(support.field.placeholder)
      : "";
  const canSubmit =
    settingsHost.isOnline &&
    !profilesUnavailable &&
    trimmedName.length > 0 &&
    !isDuplicate &&
    (support.field?.required !== true || newField.trim().length > 0);

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

  const refreshProfiles = (kind?: string) => {
    return refreshAgentProfiles(settingsHost, kind);
  };

  const addProfile = async () => {
    if (!canSubmit || isSaving) return;
    const displayName = trimmedName;
    const id = uniqueProfileId(displayName, agentInstances);
    const kind = agentProfileKind(support.driver, id);
    setIsSaving(true);
    setPendingKind(kind);
    try {
      // `createProfile` seals the payload on the host, so a credential
      // entered here never rides a plaintext settings flush.
      const instance = await settingsHost.createProfile(
        support.createPayload({
          id,
          displayName,
          field: support.field?.placeholderFor
            ? newField.trim() || support.field.placeholderFor(displayName, id)
            : newField.trim(),
        }),
      );
      const onCreatedResult = support.onCreated?.({
        profileKind: kind,
        instance,
        statuses: props.statuses ?? [],
        settingsHost,
      });
      if (onCreatedResult) await onCreatedResult;
      closeAddForm();
      toast.success(t`Profile ${displayName} added.`);
      try {
        // Flush local settings before refreshing so the supervisor's registry
        // rebuild reads any settings the provider pinned in `onCreated`.
        if (!settingsHost.isRemote) await flushSharedSettings();
        await refreshProfiles(kind);
        props.onOpenProfile?.(kind);
      } catch (error) {
        toast.danger(friendlyError(error));
      } finally {
        setPendingKind(undefined);
      }
    } catch (error) {
      setPendingKind(undefined);
      toast.danger(friendlyError(error));
    } finally {
      setIsSaving(false);
    }
  };

  const removeProfile = async (instance: AgentInstanceConfig) => {
    const kind = agentProfileKind(support.driver, instance.id);
    if (removingKind || !settingsHost.isOnline) return;
    setRemovingKind(kind);
    try {
      try {
        await settingsHost.removeProfile(instance.id);
      } catch (error) {
        toast.danger(friendlyError(error));
        return;
      }
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
          isDisabled={!settingsHost.isOnline}
          onPress={() =>
            void refreshProfiles().catch((error) => toast.danger(friendlyError(error)))
          }
        >
          <RefreshCw className="size-3" />
          <Trans>Refresh</Trans>
        </Button>
      </div>

      {profilesUnavailable ? (
        <p role="status" className="py-2 text-xs text-muted">
          <Trans>Settings unavailable</Trans>
        </p>
      ) : listed.length === 0 && !isAdding ? (
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
            <ContentSurface
              variant="row"
              key={instance.id}
              className="flex items-center gap-3 px-3 py-2"
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
                  isDisabled={isPending || !settingsHost.isOnline || profilesUnavailable}
                  onPress={() => setConfirmRemoval(instance)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </ContentSurface>
          );
        })}

        {isAdding && support.addProfile ? (
          <AgentProfileDialog
            harnesses={[{ driver: support.driver, label: support.addProfile.label, support }]}
            initialDriver={support.driver}
            settingsHost={settingsHost}
            agentInstances={agentInstances}
            statuses={props.suggestionStatuses ?? props.statuses ?? []}
            workspaceIsClientDevice={props.workspaceIsClientDevice}
            onDismiss={closeAddForm}
            onCreated={(kind) => {
              void refreshProfiles(kind)
                .then(() => props.onOpenProfile?.(kind))
                .catch((error) => toast.danger(friendlyError(error)));
            }}
          />
        ) : null}

        {isAdding && !support.addProfile ? (
          <ContentSurface className="p-3">
            <div
              className={`grid items-center gap-2 ${support.field ? "grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"}`}
            >
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
              {support.field ? (
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
              ) : null}
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
          </ContentSurface>
        ) : null}
      </div>

      {!isAdding || support.addProfile ? (
        <Button
          ref={addButtonRef}
          size="sm"
          variant="ghost"
          className="mt-2 h-7 min-h-7 gap-1 px-2 text-[11px]"
          isDisabled={!settingsHost.isOnline || profilesUnavailable}
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
