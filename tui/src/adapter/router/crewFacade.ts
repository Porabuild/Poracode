import {
  MAX_SAVED_CREWS,
  savedCrewSchema,
  threadCrewBinding,
  type CrewMemberSelection,
  type SavedCrew,
  type ThreadCrewBinding,
} from "@/shared/crew";
import type { AgentStatus } from "@/shared/contracts";
import { threadId } from "../ids";
import { guiModels, record, supportsGui } from "./helpers";
import type { RouterContext, SessionRecord } from "./context";
import {
  CREW_PROVIDER_ID,
  NEW_CREW_MODEL_ID,
  crewModelChoices,
  crewModelLabel,
  resolveCrewPick,
  usableCrews,
  type CrewModelChoice,
  type CrewPick,
} from "./crews";

export type CrewState = {
  readonly binding: ThreadCrewBinding | undefined;
  readonly lead: CrewMemberSelection | undefined;
  readonly saved: readonly SavedCrew[];
  readonly savedCrew: SavedCrew | undefined;
  readonly helperChoices: readonly CrewModelChoice[];
  readonly leadChoices: readonly CrewModelChoice[];
};

export type CrewResult = { readonly ok: true } | { readonly error: string };

export type CrewSaveResult =
  | { readonly ok: true; readonly crewId: string }
  | { readonly error: string };

export function createCrews(ctx: RouterContext) {
  const listeners = new Set<() => void>();
  let lastChoices: readonly CrewModelChoice[] = [];
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const usable = (status: AgentStatus) =>
    status.installed &&
    supportsGui(status) &&
    ctx.hasGuiAuthentication(status) &&
    guiModels(status).length > 0;

  const crewChoices = async () => {
    const statuses = await ctx.agentStatuses();
    const helperChoices = crewModelChoices(statuses, usable);
    lastChoices = helperChoices;
    return {
      statuses,
      helperChoices,
      leadChoices: crewModelChoices(statuses, usable, { leadsOnly: true }),
    };
  };

  const freshSettings = () =>
    Promise.resolve()
      .then(() => ctx.input.client.settings())
      .catch(() => undefined);

  const savedCrews = async (statuses?: readonly AgentStatus[]) => {
    const settings = await freshSettings();
    return usableCrews(record(settings).crews, statuses ?? (await ctx.agentStatuses()), usable);
  };

  const crewCatalog = async (): Promise<{ id: string; name: string }[]> => {
    const { statuses, leadChoices } = await crewChoices();
    const crews = (await savedCrews(statuses)).map((crew) => ({
      id: crew.id,
      name: crew.name,
    }));
    return leadChoices.length > 0 ? [...crews, { id: NEW_CREW_MODEL_ID, name: "New crew" }] : crews;
  };

  const sessionLead = (session: string): CrewMemberSelection | undefined => {
    const current = ctx.sessions.get(session);
    const remote = ctx.threadCache.get(threadId(session));
    // A stale record can hold the crew pseudo provider — never lead with it.
    const isCrewPick = current?.providerID === CREW_PROVIDER_ID;
    const agentKind =
      (isCrewPick ? undefined : current?.providerID) ??
      remote?.agentKind ??
      ctx.defaultModel?.providerID;
    const model =
      (isCrewPick ? undefined : current?.model) ?? remote?.config.model ?? ctx.defaultModel?.model;
    if (!agentKind || !model) return undefined;
    const effort = current?.effort ?? remote?.config.effort;
    const fast = current?.fast ?? remote?.config.fast;
    return {
      agentKind,
      model,
      ...(effort ? { effort } : {}),
      ...(fast !== undefined ? { fast } : {}),
    };
  };

  const sessionCrew = (session: string): ThreadCrewBinding | undefined => {
    const current = ctx.sessions.get(session);
    if (current?.crew !== undefined) return current.crew ?? undefined;
    return threadCrewBinding(ctx.threadCache.get(threadId(session))?.config);
  };

  const crewSessionModel = (session: string): { providerID: string; id: string } | undefined => {
    const binding = sessionCrew(session);
    if (!binding) return undefined;
    return { providerID: CREW_PROVIDER_ID, id: binding.crewId ?? NEW_CREW_MODEL_ID };
  };

  const crewState = async (session: string): Promise<CrewState> => {
    const { statuses, helperChoices, leadChoices } = await crewChoices();
    const saved = await savedCrews(statuses);
    const binding = sessionCrew(session);
    return {
      binding,
      lead: sessionLead(session),
      saved,
      savedCrew: binding?.crewId ? saved.find((crew) => crew.id === binding.crewId) : undefined,
      helperChoices,
      leadChoices,
    };
  };

  // Crew edits need a session record — create the selection-route shape when
  // the remote thread exists but nothing local recorded it yet.
  const ensureRecord = async (session: string): Promise<SessionRecord | undefined> => {
    const current = ctx.sessions.get(session);
    if (current) return current;
    const rawId = threadId(session);
    const remote = ctx.threadCache.get(rawId) ?? (await ctx.visibleThread(rawId));
    if (!remote) return undefined;
    const created: SessionRecord = {
      threadId: rawId,
      projectId: (await ctx.resolveProject()).id,
    };
    ctx.sessions.set(session, created);
    return created;
  };

  const applyCrewPick = (session: string, pick: CrewPick) => {
    const current = ctx.sessions.get(session);
    if (!current) return;
    ctx.sessions.set(session, {
      ...current,
      providerID: pick.lead.agentKind,
      model: pick.lead.model,
      ...(pick.lead.effort ? { effort: pick.lead.effort } : {}),
      ...(pick.lead.fast !== undefined ? { fast: pick.lead.fast } : {}),
      crew: pick.binding,
    });
    notify();
  };

  const updateCrew = async (
    session: string,
    binding: ThreadCrewBinding | null,
  ): Promise<CrewResult> => {
    const current = await ensureRecord(session);
    if (!current) return { error: "Open a thread first." };
    ctx.sessions.set(session, { ...current, crew: binding });
    notify();
    return { ok: true };
  };

  const startNewCrew = async (session: string): Promise<CrewResult> => {
    if (!(await ensureRecord(session))) return { error: "Open a thread first." };
    const { helperChoices, leadChoices } = await crewChoices();
    const pick = resolveCrewPick({
      pickedModel: NEW_CREW_MODEL_ID,
      sessionCrew: undefined,
      sessionLead: sessionLead(session),
      saved: [],
      leadChoices,
      helperChoices,
    });
    if ("error" in pick) return pick;
    applyCrewPick(session, pick);
    return { ok: true };
  };

  const setCrewLead = async (session: string, lead: CrewMemberSelection): Promise<CrewResult> => {
    const current = await ensureRecord(session);
    if (!current) return { error: "Open a thread first." };
    const { leadChoices } = await crewChoices();
    if (
      !leadChoices.some(
        (choice) => choice.agentKind === lead.agentKind && choice.model === lead.model,
      )
    )
      return { error: "That model can't lead a crew." };
    const remote = ctx.threadCache.get(threadId(session));
    if (remote && remote.agentKind !== lead.agentKind) {
      const status = ctx.states.get(remote.id) ?? remote.status;
      if (status === "launching" || status === "working")
        return { error: "Wait for the current turn to finish before switching the lead." };
      ctx.pendingSwitches.set(session, { providerID: lead.agentKind, modelID: lead.model });
    } else {
      ctx.pendingSwitches.delete(session);
    }
    const updated = {
      ...current,
      providerID: lead.agentKind,
      model: lead.model,
      ...(lead.effort ? { effort: lead.effort } : {}),
      ...(lead.fast !== undefined ? { fast: lead.fast } : {}),
    };
    if (!lead.effort) delete updated.effort;
    if (current.providerID !== lead.agentKind) {
      delete updated.approvalPolicy;
      delete updated.sandboxMode;
    }
    ctx.sessions.set(session, updated);
    ctx.activeProviderID = lead.agentKind;
    notify();
    return { ok: true };
  };

  const saveCrew = async (
    session: string,
    input: { readonly mode: "update" } | { readonly mode: "new"; readonly name: string },
  ): Promise<CrewSaveResult> => {
    const binding = sessionCrew(session);
    const lead = sessionLead(session);
    if (!binding || !lead) return { error: "This thread has no crew to save." };
    const settings = record(await freshSettings());
    const existing = (Array.isArray(settings.crews) ? settings.crews : []).flatMap((value) => {
      const parsed = savedCrewSchema.safeParse(value);
      return parsed.success ? [parsed.data] : [];
    });
    const updating = input.mode === "update" && binding.crewId !== undefined;
    if (!updating && existing.length >= MAX_SAVED_CREWS)
      return { error: `You can save up to ${MAX_SAVED_CREWS} crews.` };
    const id = updating ? binding.crewId! : `crew-${crypto.randomUUID().slice(0, 8)}`;
    const name =
      input.mode === "new"
        ? input.name.trim()
        : (binding.name ?? existing.find((crew) => crew.id === id)?.name ?? "Crew");
    if (!name) return { error: "Give the crew a name." };
    const crew: SavedCrew = {
      id,
      name,
      lead,
      roles: binding.roles,
      policy: binding.policy,
      updatedAt: Date.now(),
    };
    await ctx.input.client.updateSettings({
      crews: [...existing.filter((candidate) => candidate.id !== id), crew],
    });
    const updated = await updateCrew(session, { ...binding, crewId: id, name });
    return "error" in updated ? updated : { ok: true, crewId: id };
  };

  const crewLine = (session: string): string | undefined => {
    const binding = sessionCrew(session);
    if (!binding) return undefined;
    const policy = binding.policy === "crew-only" ? "Crew only" : "Crew first";
    const lead = sessionLead(session);
    const leadLabel = lead ? crewModelLabel(lastChoices, lead) : "unknown";
    const roles = binding.roles
      .map((role) => ((role.parallel ?? 1) > 1 ? `${role.label} ×${role.parallel}` : role.label))
      .join(", ");
    return `Lead ${leadLabel} · ${roles} · ${policy}`;
  };

  const crewSidebar = (
    session: string,
  ): { title: string; members: { label: string; detail: string }[] } | undefined => {
    const binding = sessionCrew(session);
    if (!binding) return undefined;
    const lead = sessionLead(session);
    const policy = binding.policy === "crew-only" ? "Crew only" : "Crew first";
    const labelOf = (selection: CrewMemberSelection) => crewModelLabel(lastChoices, selection);
    const detail = (selection: CrewMemberSelection, readOnly?: boolean) =>
      [selection.effort, selection.fast ? "fast" : undefined, readOnly ? "read-only" : undefined]
        .filter((part): part is string => Boolean(part))
        .join(" · ");
    return {
      title: `${binding.name ?? "Crew"} · ${policy}`,
      members: [
        ...(lead ? [{ label: `Lead · ${labelOf(lead)}`, detail: detail(lead) }] : []),
        ...binding.roles.map((role) => {
          const name = (role.parallel ?? 1) > 1 ? `${role.label} ×${role.parallel}` : role.label;
          return {
            label: `${name} · ${labelOf(role.selection)}`,
            detail: detail(role.selection, role.noEdits),
          };
        }),
      ],
    };
  };

  const subscribeCrew = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return {
    crewChoices,
    savedCrews,
    crewCatalog,
    sessionLead,
    sessionCrew,
    crewSessionModel,
    applyCrewPick,
    crewState,
    updateCrew,
    startNewCrew,
    setCrewLead,
    saveCrew,
    crewLine,
    crewSidebar,
    subscribeCrew,
    notifyCrew: notify,
  };
}
