import { createComponent, createSignal } from "solid-js";
import type { Plugin } from "@opencode/plugin/tui";
import {
  CREW_NAME_MAX_LENGTH,
  CREW_ROLE_BRIEF_MAX_LENGTH,
  CREW_ROLE_LABEL_MAX_LENGTH,
  MAX_CREW_ROLE_PARALLEL,
  MAX_CREW_ROLES,
  nextCrewRoleId,
  type CrewMemberSelection,
  type CrewRole,
  type ThreadCrewBinding,
} from "@/shared/crew";
import type { Adapter } from "../adapter";
import type { CrewState } from "../adapter/router/crewFacade";
import { CrewSidebar } from "./crewSidebar";
import { SlotText } from "./slotText";
import {
  CREW_PROVIDER_ID,
  NEW_CREW_MODEL_ID,
  crewModelLabel,
  defaultHelperSelection,
  type CrewModelChoice,
} from "../adapter/router/crews";

const ROLE_TEMPLATES: readonly { label: string; brief?: string; noEdits?: true }[] = [
  { label: "Builder", brief: "Implements changes and runs tests" },
  { label: "Reviewer", brief: "Reviews diffs and finds bugs" },
  { label: "Scout", brief: "Explores code and docs", noEdits: true },
];

const SEPARATOR = "\u0000";

export function roleName(role: CrewRole): string {
  return (role.parallel ?? 1) > 1 ? `${role.label} ×${role.parallel}` : role.label;
}

export function memberDetail(selection: CrewMemberSelection, readOnly?: boolean): string {
  return [selection.effort, selection.fast ? "fast" : undefined, readOnly ? "read-only" : undefined]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

export function withModel(
  selection: CrewMemberSelection,
  choice: CrewModelChoice,
): CrewMemberSelection {
  return {
    agentKind: choice.agentKind,
    model: choice.model,
    ...(selection.effort && choice.efforts.includes(selection.effort)
      ? { effort: selection.effort }
      : {}),
    ...(selection.fast && choice.supportsFast ? { fast: true } : {}),
  };
}

export function withRole(
  binding: ThreadCrewBinding,
  roleId: string,
  update: (role: CrewRole) => CrewRole | undefined,
): ThreadCrewBinding {
  return {
    ...binding,
    roles: binding.roles.flatMap((role) => {
      if (role.id !== roleId) return [role];
      const next = update(role);
      return next ? [next] : [];
    }),
  };
}

export function registerCrewUi(context: Plugin.Context, adapter: Adapter) {
  const [crewTick, setCrewTick] = createSignal(0);
  adapter.subscribeCrew(() => setCrewTick((value) => value + 1));

  context.ui.slot({
    append: "prompt.footer.status",
    render: (input) =>
      input.sessionID
        ? createComponent(SlotText, {
            value: () => {
              crewTick();
              const line = adapter.crewLine(input.sessionID!);
              return line ? `Crew · ${line}` : null;
            },
          })
        : null,
  });
  context.ui.slot({
    append: "sidebar.content",
    render: (input) =>
      input.sessionID
        ? createComponent(CrewSidebar, {
            context,
            adapter,
            sessionID: input.sessionID,
            tick: crewTick,
          })
        : null,
  });

  const currentSession = () => {
    const route = context.ui.router.current();
    return route.type === "session" ? route.sessionID : undefined;
  };
  const alert = (message: string) => context.ui.dialog.alert({ title: "Crew", message });
  const done = async (result: { readonly ok: true } | { readonly error: string }) => {
    if ("error" in result) {
      await alert(result.error);
      return false;
    }
    return true;
  };

  const pickModel = async (
    title: string,
    choices: readonly CrewModelChoice[],
    current: CrewMemberSelection,
  ) => {
    const value = await context.ui.dialog.select<string>({
      title,
      placeholder: "Search models",
      current: `${current.agentKind}${SEPARATOR}${current.model}`,
      options: choices.map((choice) => ({
        title: choice.label,
        value: `${choice.agentKind}${SEPARATOR}${choice.model}`,
        category: choice.providerLabel,
      })),
    });
    if (!value) return undefined;
    return choices.find((choice) => `${choice.agentKind}${SEPARATOR}${choice.model}` === value);
  };

  const pickEffort = async (efforts: readonly string[], current: string | undefined) => {
    const value = await context.ui.dialog.select<string>({
      title: "Reasoning",
      current: current ?? "",
      options: [
        { title: "Default", value: "" },
        ...efforts.map((effort) => ({ title: effort, value: effort })),
      ],
    });
    return value;
  };

  const choiceFor = (choices: readonly CrewModelChoice[], selection: CrewMemberSelection) =>
    choices.find(
      (choice) => choice.agentKind === selection.agentKind && choice.model === selection.model,
    );

  const leadMenu = async (sessionID: string, state: CrewState, lead: CrewMemberSelection) => {
    const current = choiceFor(state.leadChoices, lead);
    const action = await context.ui.dialog.select<string>({
      title: `Lead · ${crewModelLabel(state.leadChoices, lead)}`,
      options: [
        { title: "Model…", value: "model" },
        ...(current?.efforts.length ? [{ title: "Reasoning…", value: "effort" }] : []),
        ...(current?.supportsFast
          ? [{ title: lead.fast ? "Turn Fast off" : "Turn Fast on", value: "fast" }]
          : []),
      ],
    });
    if (action === "model") {
      const choice = await pickModel("Lead model", state.leadChoices, lead);
      if (choice) await done(await adapter.setCrewLead(sessionID, withModel(lead, choice)));
    } else if (action === "effort" && current) {
      const effort = await pickEffort(current.efforts, lead.effort);
      if (effort === undefined) return;
      const { effort: _previous, ...rest } = lead;
      await done(await adapter.setCrewLead(sessionID, effort ? { ...rest, effort } : rest));
    } else if (action === "fast") {
      const { fast: _previous, ...rest } = lead;
      await done(await adapter.setCrewLead(sessionID, lead.fast ? rest : { ...rest, fast: true }));
    }
  };

  const roleMenu = async (
    sessionID: string,
    state: CrewState,
    binding: ThreadCrewBinding,
    role: CrewRole,
  ) => {
    const current = choiceFor(state.helperChoices, role.selection);
    const action = await context.ui.dialog.select<string>({
      title: `${roleName(role)} · ${crewModelLabel(state.helperChoices, role.selection)}`,
      options: [
        { title: "Model…", value: "model" },
        ...(current?.efforts.length ? [{ title: "Reasoning…", value: "effort" }] : []),
        ...(current?.supportsFast
          ? [{ title: role.selection.fast ? "Turn Fast off" : "Turn Fast on", value: "fast" }]
          : []),
        {
          title: role.noEdits ? "Allow edits" : "Make read-only",
          value: "read-only",
          description: "Told not to edit files. Not enforced.",
        },
        { title: "Rename…", value: "rename" },
        { title: "When to use…", value: "brief" },
        { title: `At once: ${role.parallel ?? 1}…`, value: "parallel" },
        { title: "Remove role", value: "remove" },
      ],
    });
    let next: ThreadCrewBinding | undefined;
    if (action === "model") {
      const choice = await pickModel(`${role.label} model`, state.helperChoices, role.selection);
      if (choice)
        next = withRole(binding, role.id, (value) => ({
          ...value,
          selection: withModel(value.selection, choice),
        }));
    } else if (action === "effort" && current) {
      const effort = await pickEffort(current.efforts, role.selection.effort);
      if (effort !== undefined)
        next = withRole(binding, role.id, (value) => {
          const { effort: _previous, ...selection } = value.selection;
          return { ...value, selection: effort ? { ...selection, effort } : selection };
        });
    } else if (action === "fast") {
      next = withRole(binding, role.id, (value) => {
        const { fast: _previous, ...selection } = value.selection;
        return {
          ...value,
          selection: value.selection.fast ? selection : { ...selection, fast: true },
        };
      });
    } else if (action === "read-only") {
      next = withRole(binding, role.id, (value) => {
        const { noEdits: _previous, ...rest } = value;
        return value.noEdits ? rest : { ...rest, noEdits: true };
      });
    } else if (action === "rename") {
      const label = (
        await context.ui.dialog.prompt({ title: "Role name", value: role.label })
      )?.trim();
      if (label && label.length <= CREW_ROLE_LABEL_MAX_LENGTH)
        next = withRole(binding, role.id, (value) => ({ ...value, label }));
      else if (label) await alert(`Keep role names to ${CREW_ROLE_LABEL_MAX_LENGTH} characters.`);
    } else if (action === "brief") {
      const brief = await context.ui.dialog.prompt({
        title: "When to use",
        placeholder: "Leave empty for no brief",
        value: role.brief ?? "",
      });
      if (brief !== undefined) {
        const trimmed = brief.trim();
        if (trimmed.length > CREW_ROLE_BRIEF_MAX_LENGTH)
          await alert(`Keep briefs to ${CREW_ROLE_BRIEF_MAX_LENGTH} characters.`);
        else
          next = withRole(binding, role.id, (value) => {
            const { brief: _previous, ...rest } = value;
            return trimmed ? { ...rest, brief: trimmed } : rest;
          });
      }
    } else if (action === "parallel") {
      const value = await context.ui.dialog.select<number>({
        title: "At once",
        current: role.parallel ?? 1,
        options: Array.from({ length: MAX_CREW_ROLE_PARALLEL }, (_, index) => ({
          title: String(index + 1),
          value: index + 1,
        })),
      });
      if (value !== undefined)
        next = withRole(binding, role.id, (target) => {
          const { parallel: _previous, ...rest } = target;
          return value > 1 ? { ...rest, parallel: value } : rest;
        });
    } else if (action === "remove") {
      if (binding.roles.length === 1) {
        await alert("A crew needs at least one helper. Remove the crew instead.");
        return;
      }
      next = withRole(binding, role.id, () => undefined);
    }
    if (next) await done(await adapter.updateCrew(sessionID, next));
  };

  const addRole = async (sessionID: string, state: CrewState, binding: ThreadCrewBinding) => {
    const lead = state.lead;
    const helper = lead ? defaultHelperSelection(state.helperChoices, lead.agentKind) : undefined;
    if (!helper) return void (await alert("No helper models are available."));
    const pickedTemplate = await context.ui.dialog.select<number>({
      title: "Add role",
      options: [
        ...ROLE_TEMPLATES.map((template, index) => ({
          title: template.label,
          value: index,
          ...(template.brief ? { description: template.brief } : {}),
        })),
        { title: "Custom…", value: -1 },
      ],
    });
    if (pickedTemplate === undefined) return;
    const template =
      pickedTemplate >= 0
        ? ROLE_TEMPLATES[pickedTemplate]
        : { label: (await context.ui.dialog.prompt({ title: "Role name" }))?.trim() ?? "" };
    if (!template?.label) return;
    if (template.label.length > CREW_ROLE_LABEL_MAX_LENGTH)
      return void (await alert(`Keep role names to ${CREW_ROLE_LABEL_MAX_LENGTH} characters.`));
    const role: CrewRole = {
      id: nextCrewRoleId(
        binding.roles.map((value) => value.id),
        template.label,
      ),
      label: template.label,
      ...("brief" in template && template.brief ? { brief: template.brief } : {}),
      ...("noEdits" in template && template.noEdits ? { noEdits: true as const } : {}),
      selection: helper,
    };
    await done(
      await adapter.updateCrew(sessionID, { ...binding, roles: [...binding.roles, role] }),
    );
  };

  const crewMenu = async (sessionID: string) => {
    for (;;) {
      const state = await adapter.crewState(sessionID);
      const { binding, lead } = state;
      if (!binding || !lead) return;
      const labelOf = (selection: CrewMemberSelection) =>
        crewModelLabel(state.helperChoices, selection);
      const choice = await context.ui.dialog.select<string>({
        title: `${binding.name ?? "Crew"} · ${binding.policy === "crew-only" ? "Crew only" : "Crew first"}`,
        options: [
          {
            title: `Lead · ${labelOf(lead)}`,
            value: "lead",
            description: memberDetail(lead),
            category: "Members",
          },
          ...binding.roles.map((role) => ({
            title: `${roleName(role)} · ${labelOf(role.selection)}`,
            value: `role:${role.id}`,
            description: memberDetail(role.selection, role.noEdits),
            category: "Members",
          })),
          ...(binding.roles.length < MAX_CREW_ROLES
            ? [{ title: "Add role…", value: "add", category: "Crew" }]
            : []),
          {
            title:
              binding.policy === "crew-only"
                ? "Let the lead use other agents too (Crew first)"
                : "Only use this crew (Crew only)",
            value: "policy",
            category: "Crew",
          },
          ...(binding.crewId
            ? [{ title: `Save to "${binding.name ?? "crew"}"`, value: "save", category: "Crew" }]
            : []),
          { title: "Save as new crew…", value: "save-new", category: "Crew" },
          { title: "Remove crew", value: "remove", category: "Crew" },
        ],
      });
      if (!choice) return;
      if (choice === "lead") await leadMenu(sessionID, state, lead);
      else if (choice.startsWith("role:")) {
        const role = binding.roles.find((value) => `role:${value.id}` === choice);
        if (role) await roleMenu(sessionID, state, binding, role);
      } else if (choice === "add") await addRole(sessionID, state, binding);
      else if (choice === "policy")
        await done(
          await adapter.updateCrew(sessionID, {
            ...binding,
            policy: binding.policy === "crew-only" ? "crew-first" : "crew-only",
          }),
        );
      else if (choice === "save") {
        if (await done(await adapter.saveCrew(sessionID, { mode: "update" })))
          context.ui.toast.show({
            message: `Saved "${binding.name ?? "crew"}".`,
            variant: "success",
          });
      } else if (choice === "save-new") {
        const name = (
          await context.ui.dialog.prompt({ title: "Crew name", value: binding.name ?? "" })
        )?.trim();
        if (!name) continue;
        if (name.length > CREW_NAME_MAX_LENGTH) {
          await alert(`Keep crew names to ${CREW_NAME_MAX_LENGTH} characters.`);
          continue;
        }
        const result = await adapter.saveCrew(sessionID, { mode: "new", name });
        if ("error" in result) {
          await alert(result.error);
          continue;
        }
        context.data.location.model.invalidate();
        context.data.location.provider.invalidate();
        await Promise.all([
          context.data.location.model.sync(),
          context.data.location.provider.sync(),
        ]);
        context.ui.model.set({ providerID: CREW_PROVIDER_ID, modelID: result.crewId });
        context.ui.toast.show({ message: `Saved "${name}".`, variant: "success" });
      } else if (choice === "remove") {
        if (await done(await adapter.updateCrew(sessionID, null))) {
          const removed = context.ui.model.set({
            providerID: lead.agentKind,
            modelID: lead.model,
            ...(lead.effort ? { variant: lead.effort } : {}),
          });
          if (!removed) {
            await alert("Crew removed. Pick a model for your next message.");
            context.keymap.dispatch("model.list");
          }
          return;
        }
      }
    }
  };

  const openCrew = async () => {
    const sessionID = currentSession();
    if (!sessionID) {
      context.keymap.dispatch("model.list");
      context.ui.toast.show({
        message: "Pick a crew under Poracode, then send your first message.",
        variant: "info",
      });
      return;
    }
    const state = await adapter.crewState(sessionID);
    if (!state.binding) {
      const choice = await context.ui.dialog.select<string>({
        title: "Crew",
        options: [
          ...(state.saved.length > 0
            ? [
                {
                  title: "Use a saved crew…",
                  value: "picker",
                  description: "Opens the model picker; saved crews are under Poracode",
                },
              ]
            : []),
          {
            title: "New crew",
            value: "new",
            description: "Your current model leads, plus one Builder",
          },
        ],
      });
      if (choice === "picker") return context.keymap.dispatch("model.list");
      if (choice !== "new" || !(await done(await adapter.startNewCrew(sessionID)))) return;
      if (!context.ui.model.set({ providerID: CREW_PROVIDER_ID, modelID: NEW_CREW_MODEL_ID })) {
        await adapter.updateCrew(sessionID, null);
        await alert("Couldn't select the new crew. Pick it under Poracode in the model list.");
        return;
      }
    }
    await crewMenu(sessionID);
  };

  context.keymap.layer(() => ({
    mode: "global",
    commands: [
      {
        id: "poracode.crew",
        title: "Crew",
        description: "Pick, edit, or save this thread's crew",
        group: "Crew",
        palette: true,
        slash: { name: "crew" },
        run: () => openCrew(),
      },
    ],
  }));
}
