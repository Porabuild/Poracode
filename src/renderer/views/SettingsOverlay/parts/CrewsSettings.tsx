import { ContentSurface } from "@/renderer/components/common/ContentSurface";
import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Modal, Separator, Tooltip } from "@heroui/react";
import { LightballTabs } from "@/renderer/components/common/LightballTabs";
import { Copy, Info, Lock, LockOpen, Pencil, PencilOff, Plus, Trash2, Zap } from "lucide-react";
import { Button } from "@/renderer/components/common/Button";
import { ConfirmDialog } from "@/renderer/components/common/ConfirmDialog";
import { Input } from "@/renderer/components/common/Input";
import { OptionMenu } from "@/renderer/components/common/OptionMenu";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { defaultFastEnabled } from "@/renderer/components/providers/modelConfig";
import { useCrewHelperOptions } from "@/renderer/components/crew/crewHelperOptions";
import {
  addRole,
  crewModelLabelOf,
  removeRole,
  saveAsNewCrew,
  updateRole,
  type CrewRosterModel,
} from "@/renderer/components/crew/crewComposerModel";
import { CREW_ROLE_TEMPLATE_DESCRIPTORS } from "@/renderer/components/crew/crewRoleTemplates";
import {
  CREW_TEMPLATE_DESCRIPTORS,
  crewRolesFromTemplate,
} from "@/renderer/components/crew/crewTemplates";
import { CrewMemberRow } from "@/renderer/components/crew/CrewMemberRow";
import { CrewRolePill } from "@/renderer/components/crew/CrewRolePill";
import { formatEffortLabel } from "@/renderer/components/thread/threadDraftViewHelpers";
import { ThreadDockIconButton } from "@/renderer/components/thread/ThreadDockUI";
import { useHostAgentStatusPools } from "@/renderer/hooks/useHostAgentStatuses";
import { useCrewLibrary } from "@/renderer/state/crewLibrary";
import { parseMachineKey } from "@/shared/machines";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { buildProviderModelMenuProviders } from "@/renderer/components/thread/buildModelPickerControls";
import { capabilitiesForPresentation, modelSelectionFor } from "@/shared/agentSelection";
import { getSettingsInstalledAgents } from "@/shared/agentStatus";
import {
  CREW_BINDING_VERSION,
  crewBindingFromSavedCrew,
  canLeadCrew,
  MAX_CREW_ROLES,
  MAX_SAVED_CREWS,
  normalizeCrewRoles,
  savedCrewSchema,
  type CrewMemberSelection,
  type SavedCrew,
  type ThreadCrewBinding,
} from "@/shared/crew";
import { SettingsPage } from "./SettingsForm";

function draftBindingOf(draft: SavedCrew): ThreadCrewBinding {
  return {
    version: CREW_BINDING_VERSION,
    crewId: draft.id,
    ...(draft.name ? { name: draft.name } : {}),
    policy: draft.policy,
    roles: draft.roles,
  };
}

function prepareSavedCrew(draft: SavedCrew): SavedCrew | undefined {
  const name = draft.name.trim();
  const roles = normalizeCrewRoles(draft.roles);
  if (roles.length !== draft.roles.length || roles.length === 0) return undefined;
  const parsed = savedCrewSchema.safeParse({ ...draft, name, roles });
  return parsed.success ? parsed.data : undefined;
}

export function CrewsSettings({ machineKey }: { machineKey?: string }) {
  const { t } = useLingui();
  const { crews, saveCrew, deleteCrew, ready } = useCrewLibrary(machineKey);
  const machine = machineKey ? parseMachineKey(machineKey) : undefined;
  const pools = useHostAgentStatusPools(machine?.host === "remote" ? machine.desktopId : undefined);
  const distro = machine?.env.kind === "wsl" ? machine.env.distro : undefined;
  const statuses = distro
    ? pools.wsl.filter((status) => status.envDistro === distro)
    : pools.windows;
  const providerOrder = useSharedSettings((state) => state.providerOrder);
  const helperOptions = useCrewHelperOptions(machineKey);
  const [editorCrew, setEditorCrew] = useState<SavedCrew | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<SavedCrew | undefined>();
  const installed = getSettingsInstalledAgents(statuses, []).sort((left, right) => {
    const leftIndex = providerOrder.indexOf(left.kind);
    const rightIndex = providerOrder.indexOf(right.kind);
    return (
      (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
      (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
    );
  });
  const roleTemplates = CREW_ROLE_TEMPLATE_DESCRIPTORS.map(({ brief, label, ...template }) => ({
    ...template,
    label: t(label),
    ...(brief ? { brief: t(brief) } : {}),
  }));
  const leadProviders = buildProviderModelMenuProviders(installed, {
    presentationMode: "gui",
    filterAgent: (agent) =>
      canLeadCrew(capabilitiesForPresentation(agent.capabilities, "gui"), "gui"),
  });
  const templateOptions = CREW_TEMPLATE_DESCRIPTORS.map((template) => ({
    id: template.id,
    label: t(template.name),
    hint: t(template.description),
  }));

  function defaultLeadSelection(): SavedCrew["lead"] | undefined {
    const provider = leadProviders[0];
    const model = provider?.capabilities.models[0];
    if (!provider || !model) return undefined;
    const selected = modelSelectionFor(provider.capabilities, model.id);
    return {
      agentKind: provider.kind,
      model: model.id,
      ...(selected.reasoning.default ? { effort: selected.reasoning.default } : {}),
      fast: defaultFastEnabled(provider.kind),
    };
  }

  // Computed once per render so the New crew button's enabled state matches
  // what createFromTemplate can build.
  const newCrewLead = defaultLeadSelection();
  const newCrewHelper = newCrewLead ? helperOptions.defaultSelectionFor(newCrewLead) : undefined;
  const canAddCrew = ready && crews.length < MAX_SAVED_CREWS;

  function createFromTemplate(templateId: string) {
    const template = CREW_TEMPLATE_DESCRIPTORS.find((entry) => entry.id === templateId);
    if (!template || !newCrewLead || !newCrewHelper || !canAddCrew) return;
    // Read-only roles default to another provider when one is available, so a
    // review or exploration gets a second model's view. The editor opens next
    // so the user assigns the models they want before saving.
    const otherHelper = helperOptions.providers
      .filter((provider) => provider.kind !== newCrewHelper.agentKind)
      .flatMap((provider) => {
        const model = provider.capabilities.models[0];
        const selection = model ? helperOptions.selectionFor(provider.kind, model.id) : undefined;
        return selection ? [selection] : [];
      })[0];
    const roles = crewRolesFromTemplate(template, roleTemplates, (role) =>
      role.noEdits && otherHelper ? otherHelper : newCrewHelper,
    );
    if (roles.length === 0) return;
    const binding: ThreadCrewBinding = {
      version: CREW_BINDING_VERSION,
      policy: template.policy,
      roles,
    };
    setEditorCrew(saveAsNewCrew(t(template.name), binding, newCrewLead));
  }

  function duplicate(crew: SavedCrew) {
    if (!canAddCrew) return;
    const suffix = " copy";
    const name = `${crew.name.slice(0, 40 - suffix.length).trimEnd()}${suffix}`;
    const copy = saveAsNewCrew(name, crewBindingFromSavedCrew(crew), crew.lead);
    setEditorCrew(copy);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteCrew(deleteTarget.id);
    setDeleteTarget(undefined);
  }

  return (
    <SettingsPage
      title={t`Crews`}
      description={t`Saved crews: a lead and the helpers it hands work to. Pick one under Poracode in any model picker.`}
      actions={
        <OptionMenu
          value=""
          placeholder={t`New crew`}
          icon={<Plus className="size-4" />}
          options={templateOptions}
          buttonVariant="tertiary"
          isDisabled={!canAddCrew || !newCrewHelper}
          onChange={(template) => createFromTemplate(template)}
        />
      }
    >
      <div id="crews.list" data-settings-anchor="crews.list">
        {crews.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--hairline-strong)] px-4 py-7 text-center">
            <p className="text-sm text-foreground">{t`No crews yet`}</p>
            <p className="mt-1 text-xs text-muted">
              {t`Create one from a template, then pick it under Poracode in the model picker.`}
            </p>
          </div>
        ) : (
          <ContentSurface className="overflow-hidden">
            <ul className="divide-y divide-[var(--hairline-soft)]">
              {crews.map((crew) => (
                <li
                  key={crew.id}
                  id={`crews.${crew.id}`}
                  data-settings-anchor={`crews.${crew.id}`}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded text-left"
                    onClick={() => setEditorCrew(crew)}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {crew.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                        {crew.policy === "crew-only" ? (
                          <Lock className="size-3" aria-hidden="true" />
                        ) : (
                          <LockOpen className="size-3" aria-hidden="true" />
                        )}
                        {crew.policy === "crew-only" ? t`Crew only` : t`Crew first`}
                      </span>
                    </span>
                    <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      {[
                        { key: "lead", selection: crew.lead, role: undefined },
                        ...crew.roles.map((role) => ({
                          key: role.id,
                          selection: role.selection,
                          role,
                        })),
                      ].map(({ key, selection, role }) => {
                        const status = installed.find(
                          (entry) => entry.kind === selection.agentKind,
                        );
                        return (
                          <span key={key} className="inline-flex min-w-0 items-center gap-1.5">
                            <ProviderIcon
                              kind={selection.agentKind}
                              {...(status?.icon ? { icon: status.icon } : {})}
                              fallbackLabel={status?.label ?? selection.agentKind}
                              className="size-3.5 shrink-0"
                            />
                            <span className="truncate text-xs text-foreground">
                              {crewModelLabelOf(installed, selection)}
                            </span>
                            {selection.effort ? (
                              <span className="shrink-0 text-xs text-muted">
                                {formatEffortLabel(selection.effort)}
                              </span>
                            ) : null}
                            {selection.fast ? (
                              <Zap
                                className="size-3 shrink-0 fill-current text-muted"
                                aria-hidden="true"
                              />
                            ) : null}
                            {role?.noEdits ? (
                              <PencilOff
                                className="size-3 shrink-0 text-muted"
                                aria-hidden="true"
                              />
                            ) : null}
                            <CrewRolePill
                              role={role}
                              isLead={role === undefined}
                              leadLabel={t`Lead`}
                              wide={false}
                            />
                          </span>
                        );
                      })}
                    </span>
                  </button>
                  <ThreadDockIconButton
                    label={t`Edit ${crew.name}`}
                    onPress={() => setEditorCrew(crew)}
                  >
                    <Pencil className="size-3.5" />
                  </ThreadDockIconButton>
                  <ThreadDockIconButton
                    label={t`Duplicate ${crew.name}`}
                    isDisabled={!canAddCrew}
                    onPress={() => duplicate(crew)}
                  >
                    <Copy className="size-3.5" />
                  </ThreadDockIconButton>
                  <ThreadDockIconButton
                    danger
                    label={t`Delete ${crew.name}`}
                    onPress={() => setDeleteTarget(crew)}
                  >
                    <Trash2 className="size-3.5" />
                  </ThreadDockIconButton>
                </li>
              ))}
            </ul>
          </ContentSurface>
        )}
      </div>
      {editorCrew ? (
        <CrewEditorModal
          key={editorCrew.id}
          crew={editorCrew}
          helperOptions={helperOptions}
          leadProviders={leadProviders}
          roleTemplates={roleTemplates}
          canSave={ready}
          onSave={saveCrew}
          onClose={() => setEditorCrew(undefined)}
        />
      ) : null}
      <ConfirmDialog
        isOpen={deleteTarget !== undefined}
        title={deleteTarget ? t`Delete ${deleteTarget.name}?` : t`Delete crew?`}
        body={t`This cannot be undone.`}
        confirmLabel={t`Delete`}
        onClose={() => setDeleteTarget(undefined)}
        onConfirm={confirmDelete}
      />
    </SettingsPage>
  );
}

function CrewEditorModal(props: {
  crew: SavedCrew;
  helperOptions: ReturnType<typeof useCrewHelperOptions>;
  leadProviders: CrewRosterModel["leadProviders"];
  roleTemplates: CrewRosterModel["roleTemplates"];
  canSave: boolean;
  /** Resolves true once the machine that owns the crew library holds the saved crew. */
  onSave: (crew: SavedCrew) => Promise<boolean>;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const { helperOptions } = props;
  const [draft, setDraft] = useState<SavedCrew>(props.crew);
  const [saving, setSaving] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | undefined>();
  const [infoOpen, setInfoOpen] = useState(false);
  const binding = draftBindingOf(draft);
  const defaultHelper = helperOptions.defaultSelectionFor(draft.lead);
  const preparedCrew = prepareSavedCrew(draft);
  const model: CrewRosterModel = {
    binding,
    lead: draft.lead,
    savedCrew: draft,
    helperOptions,
    roleTemplates: props.roleTemplates,
    leadProviders: props.leadProviders,
    ...(defaultHelper ? { defaultHelper } : {}),
    summary: "",
    isDraft: true,
    isDisabled: false,
    showFallbacks: true,
    onBindingChange: (next: ThreadCrewBinding) =>
      setDraft((current) => ({ ...current, policy: next.policy, roles: next.roles })),
    onLeadChange: (lead: CrewMemberSelection) => setDraft((current) => ({ ...current, lead })),
    onSaveToCrew: (next: SavedCrew) => setDraft(next),
    onSaveAsNewCrew: (next: SavedCrew) => setDraft(next),
  };

  function handleSave() {
    if (!props.canSave || !preparedCrew || saving) return;
    setSaving(true);
    // A paired host takes the write asynchronously. Close only once it holds the
    // crew, so a refused write leaves the draft here to fix and save again.
    void props.onSave(preparedCrew).then((saved) => {
      if (saved) props.onClose();
      else setSaving(false);
    });
  }

  // While a paired host takes the write, no close route can drop the draft. Once
  // that host is gone its answer never comes, so the user may leave.
  const waitingForHost = saving && props.canSave;

  return (
    <Modal.Backdrop isOpen onOpenChange={(open) => !open && !waitingForHost && props.onClose()}>
      <Modal.Container placement="center" scroll="inside" size="md">
        <Modal.Dialog className="sm:max-w-xl">
          <Modal.CloseTrigger isDisabled={waitingForHost} aria-label={t`Close`} />
          <Modal.Header>
            <div className="flex items-center gap-1">
              <Modal.Heading>{t`Edit crew`}</Modal.Heading>
              <Tooltip
                delay={300}
                isOpen={infoOpen}
                onOpenChange={setInfoOpen}
                shouldCloseOnPress={false}
              >
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={t`How crews work`}
                  aria-expanded={infoOpen}
                  className="size-7 min-h-7 min-w-7 text-muted"
                  onPress={() => setInfoOpen((open) => !open)}
                >
                  <Info className="size-3.5" aria-hidden />
                </Button>
                <Tooltip.Content
                  placement="bottom"
                  className="max-w-72 space-y-1.5 text-xs leading-relaxed"
                >
                  <p>
                    <Trans>
                      If a role's agent is unavailable, its fallbacks run. Crew first may also use
                      the next ranked agent.
                    </Trans>
                  </p>
                  <p>
                    <Trans>
                      The pencil-off icon marks a role told not to edit files: an instruction in its
                      brief, not a permission.
                    </Trans>
                  </p>
                </Tooltip.Content>
              </Tooltip>
            </div>
          </Modal.Header>
          <Modal.Body className="space-y-3 p-4">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] text-muted">{t`Name`}</span>
              <Input
                aria-label={t`Crew name`}
                value={draft.name}
                maxLength={40}
                variant="secondary"
                className="h-8 min-w-0 text-sm font-semibold"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
              />
            </div>
            <LightballTabs
              tabs={[
                { id: "crew-only", label: t`Crew only`, icon: <Lock className="size-3.5" /> },
                {
                  id: "crew-first",
                  label: t`Crew first`,
                  icon: <LockOpen className="size-3.5" />,
                },
              ]}
              active={draft.policy}
              onChange={(policy) => setDraft((current) => ({ ...current, policy }))}
              ariaLabel={t`Crew policy`}
              className="w-fit"
              shape="rounded"
            />
            <ContentSurface className="overflow-hidden px-1.5 py-1">
              <CrewMemberRow
                model={model}
                selection={draft.lead}
                isLead
                isEdited={false}
                isEditing={false}
                onEditToggle={() => {}}
                onSelectionChange={(lead) => setDraft((current) => ({ ...current, lead }))}
                onRoleChange={() => {}}
                onRemoveRole={() => {}}
              />
              <Separator className="my-1 h-px w-full bg-border/70" />
              {draft.roles.map((role) => (
                <CrewMemberRow
                  key={role.id}
                  model={model}
                  role={role}
                  selection={role.selection}
                  isLead={false}
                  isEdited={false}
                  isEditing={editingRoleId === role.id}
                  onEditToggle={() =>
                    setEditingRoleId((current) => (current === role.id ? undefined : role.id))
                  }
                  onSelectionChange={(selection) =>
                    setDraft((current) => ({
                      ...current,
                      roles: current.roles.map((entry) =>
                        entry.id === role.id ? { ...entry, selection } : entry,
                      ),
                    }))
                  }
                  onRoleChange={(patch) =>
                    setDraft((current) => {
                      const next = updateRole(draftBindingOf(current), role.id, patch);
                      return { ...current, roles: next.roles };
                    })
                  }
                  onRemoveRole={() => {
                    setDraft((current) => ({
                      ...current,
                      roles: removeRole(draftBindingOf(current), role.id).roles,
                    }));
                    setEditingRoleId((current) => (current === role.id ? undefined : current));
                  }}
                />
              ))}
              <Button
                size="sm"
                variant="ghost"
                className="mt-0.5 h-7 w-full justify-start gap-1.5 px-1.5 text-xs text-muted hover:text-foreground"
                isDisabled={!model.defaultHelper || draft.roles.length >= MAX_CREW_ROLES}
                onPress={() => {
                  if (!model.defaultHelper) return;
                  const result = addRole(binding, model.roleTemplates, model.defaultHelper);
                  setDraft((current) => ({ ...current, roles: result.binding.roles }));
                  if (result.roleId) setEditingRoleId(result.roleId);
                }}
              >
                <Plus className="size-3.5" />
                <Trans>Add role</Trans>
              </Button>
            </ContentSurface>
          </Modal.Body>
          <Modal.Footer>
            <Button slot="close" variant="ghost" className="text-muted" isDisabled={waitingForHost}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              variant="tertiary"
              isPending={saving}
              isDisabled={!props.canSave || !preparedCrew}
              onPress={handleSave}
            >
              <Trans>Save</Trans>
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
