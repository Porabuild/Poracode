import { useEffect, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  Check,
  LayoutTemplate,
  Lock,
  LockOpen,
  Plus,
  RotateCcw,
  Save,
  Settings2,
} from "lucide-react";
import { Separator } from "@heroui/react";
import { Button } from "@/renderer/components/common/Button";
import { Input } from "@/renderer/components/common/Input";
import { OptionMenu } from "@/renderer/components/common/OptionMenu";
import { ThreadDockIconButton } from "@/renderer/components/thread/ThreadDockUI";
import { usePanelStore } from "@/renderer/state/panelStore";
import { MAX_CREW_ROLES, crewBindingFromSavedCrew } from "@/shared/crew";
import {
  addRole,
  isCrewEdited,
  isCrewNameValid,
  isLeadEdited,
  isRoleEdited,
  removeRole,
  resetBinding,
  saveAsNewCrew,
  saveToCrew,
  setPolicy,
  updateRole,
} from "./crewComposerModel";
import { CrewMemberRow } from "./CrewMemberRow";
import type { CrewRosterModel } from "./crewComposerModel";
import { CREW_TEMPLATE_DESCRIPTORS, crewRolesFromTemplate } from "./crewTemplates";

const HEADER_ICON_BUTTON_CLASS =
  "size-6 min-h-6 min-w-6 shrink-0 rounded p-0 text-muted/70 hover:bg-foreground/5 hover:text-foreground";

export function CrewRosterPanel(props: {
  model: CrewRosterModel;
  compact: boolean;
  onClose?: (() => void) | undefined;
}) {
  const { t } = useLingui();
  const { model } = props;
  const [editingRoleId, setEditingRoleId] = useState<string | undefined>();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const savedCrew = model.savedCrew;
  const templateOptions = CREW_TEMPLATE_DESCRIPTORS.map((template) => ({
    id: template.id,
    label: t(template.name),
    hint: t(template.description),
  }));

  // A new crew can start from a ready-made template: its roles, instructions
  // and policy replace the draft's helpers, and the lead stays as picked.
  function applyTemplate(templateId: string) {
    const template = CREW_TEMPLATE_DESCRIPTORS.find((entry) => entry.id === templateId);
    const helper = model.defaultHelper;
    if (!template || !helper) return;
    const roles = crewRolesFromTemplate(template, model.roleTemplates, () => helper);
    if (roles.length === 0) return;
    model.onBindingChange({ ...model.binding, policy: template.policy, roles });
  }
  const differs = isCrewEdited(model.binding, model.lead, savedCrew);
  const title = model.binding.name?.trim() || t`Crew`;
  const saveOptions = [
    { id: "save-to", label: t`Save to ${savedCrew?.name ?? title}` },
    { id: "save-as-new", label: t`Save as new crew:` },
  ];

  useEffect(() => {
    if (!editingName) return;
    // The aria-label is localized, so the focus target is marked with a
    // locale-independent attribute.
    document.querySelector<HTMLInputElement>("input[data-crew-name-input]")?.focus();
  }, [editingName]);

  function handleReset() {
    if (!savedCrew) return;
    const next = resetBinding(savedCrew);
    model.onBindingChange(next);
    if (model.isDraft || savedCrew.lead.agentKind === model.lead.agentKind) {
      model.onLeadChange({ ...savedCrew.lead });
    }
    setEditingRoleId(undefined);
  }

  function handleSaveToCrew() {
    if (!savedCrew) return;
    const nextSaved = saveToCrew(savedCrew, model.binding, model.lead);
    model.onSaveToCrew(nextSaved, crewBindingFromSavedCrew(nextSaved));
  }

  function beginSaveAsNew() {
    setNameDraft(savedCrew ? t`${savedCrew.name} copy` : t`My crew`);
    setEditingName(true);
  }

  function commitSaveAsNew() {
    if (!isCrewNameValid(nameDraft)) return;
    const nextSaved = saveAsNewCrew(nameDraft, model.binding, model.lead);
    model.onSaveAsNewCrew(nextSaved, crewBindingFromSavedCrew(nextSaved));
    setEditingName(false);
  }

  function handleAddRole() {
    const defaultHelper = model.defaultHelper;
    if (!defaultHelper || model.binding.roles.length >= MAX_CREW_ROLES) return;
    const result = addRole(model.binding, model.roleTemplates, defaultHelper);
    if (!result.roleId) return;
    model.onBindingChange(result.binding);
    setEditingRoleId(result.roleId);
  }

  return (
    <section className="flex w-full flex-col">
      <header className="flex h-8 shrink-0 items-center gap-1 px-2">
        {editingName ? (
          <>
            <Input
              data-crew-name-input=""
              aria-label={t`Crew name`}
              maxLength={40}
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitSaveAsNew();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setEditingName(false);
                }
              }}
              variant="secondary"
              className="h-6 min-w-0 flex-1 text-xs font-semibold"
            />
            <ThreadDockIconButton
              label={t`Save`}
              isDisabled={!isCrewNameValid(nameDraft)}
              onPress={commitSaveAsNew}
            >
              <Check className="size-3.5" />
            </ThreadDockIconButton>
          </>
        ) : (
          <>
            <h2 className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
              {title}
            </h2>
            <ThreadDockIconButton
              label={t`Edit crews in settings`}
              onPress={() => {
                props.onClose?.();
                usePanelStore
                  .getState()
                  .openSettingsSection(
                    "crews",
                    model.binding.crewId ? `crews.${model.binding.crewId}` : undefined,
                  );
              }}
            >
              <Settings2 className="size-3.5" />
            </ThreadDockIconButton>
            <ThreadDockIconButton
              label={
                model.binding.policy === "crew-only"
                  ? t`Crew only: work goes only to this crew`
                  : t`Crew first: may also use other agents`
              }
              ariaPressed={model.binding.policy === "crew-only"}
              isDisabled={model.isDisabled}
              onPress={() =>
                model.onBindingChange(
                  setPolicy(
                    model.binding,
                    model.binding.policy === "crew-only" ? "crew-first" : "crew-only",
                  ),
                )
              }
            >
              {model.binding.policy === "crew-only" ? (
                <Lock className="size-3.5" />
              ) : (
                <LockOpen className="size-3.5" />
              )}
            </ThreadDockIconButton>
            {savedCrew ? (
              <ThreadDockIconButton
                label={t`Reset to ${savedCrew.name}`}
                isDisabled={model.isDisabled || !differs}
                onPress={handleReset}
              >
                <RotateCcw className="size-3.5" />
              </ThreadDockIconButton>
            ) : null}
            {savedCrew ? (
              <OptionMenu
                value=""
                placeholder={t`Save`}
                tooltip={t`Save`}
                icon={<Save className="size-3.5" />}
                iconOnly
                options={saveOptions}
                buttonVariant="ghost"
                isDisabled={model.isDisabled || !differs}
                className={HEADER_ICON_BUTTON_CLASS}
                onChange={(action) => {
                  if (action === "save-to") handleSaveToCrew();
                  else if (action === "save-as-new") beginSaveAsNew();
                }}
              />
            ) : (
              <>
                <OptionMenu
                  value=""
                  placeholder={t`Start from a template`}
                  tooltip={t`Start from a template`}
                  icon={<LayoutTemplate className="size-3.5" />}
                  iconOnly
                  options={templateOptions}
                  buttonVariant="ghost"
                  isDisabled={model.isDisabled || !model.defaultHelper}
                  className={HEADER_ICON_BUTTON_CLASS}
                  onChange={applyTemplate}
                />
                <ThreadDockIconButton
                  label={t`Save as crew:`}
                  isDisabled={model.isDisabled}
                  onPress={beginSaveAsNew}
                >
                  <Save className="size-3.5" />
                </ThreadDockIconButton>
              </>
            )}
          </>
        )}
      </header>

      {model.helperNote ? (
        <p className="mx-2 mb-1 text-[11px] text-muted">{model.helperNote}</p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
        <CrewMemberRow
          model={model}
          selection={model.lead}
          isLead
          isEdited={isLeadEdited(model.lead, savedCrew)}
          isEditing={false}
          compact={props.compact}
          onEditToggle={() => {}}
          onSelectionChange={model.onLeadChange}
          onRoleChange={() => {}}
          onRemoveRole={() => {}}
        />
        <Separator className="my-1 h-px w-full bg-border/70" />
        {model.binding.roles.map((role) => (
          <CrewMemberRow
            key={role.id}
            model={model}
            selection={role.selection}
            role={role}
            isLead={false}
            isEdited={isRoleEdited(role, savedCrew)}
            isEditing={editingRoleId === role.id}
            compact={props.compact}
            onEditToggle={() =>
              setEditingRoleId((current) => (current === role.id ? undefined : role.id))
            }
            onSelectionChange={(selection) =>
              model.onBindingChange(updateRole(model.binding, role.id, { selection }))
            }
            onRoleChange={(patch) =>
              model.onBindingChange(updateRole(model.binding, role.id, patch))
            }
            onRemoveRole={() => {
              model.onBindingChange(removeRole(model.binding, role.id));
              setEditingRoleId(undefined);
            }}
          />
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="mt-0.5 h-7 w-full justify-start gap-1.5 px-1.5 text-xs text-muted hover:text-foreground"
          isDisabled={
            model.isDisabled || !model.defaultHelper || model.binding.roles.length >= MAX_CREW_ROLES
          }
          onPress={handleAddRole}
        >
          <Plus className="size-3.5" />
          {t`Add role`}
        </Button>
      </div>
    </section>
  );
}
