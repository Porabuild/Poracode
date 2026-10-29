import type { Thread, ProjectLocation } from "@/shared/contracts";
import type { RemoteProject } from "@/shared/remote";
import type { ModelSelection } from "@/shared/selectionBinding.schemas";
import { getMiniModelId, resolveUtilityTaskConfig } from "@/shared/utilityTaskConfig";
import { resolveUtilitySelection } from "@/shared/utilitySelection";
import { resolveProjectLocation } from "@/shared/worktree";
import { logAdapterDebug } from "../diagnostics";
import { record } from "./helpers";
import type { RouterContext } from "./context";

/** Follow-up delivery mode and host/AI title generation. */
export function createTitles(ctx: RouterContext) {
  let followUpBehavior: "steer" | "queue" | undefined;
  const followUpDelivery = async () => {
    if (followUpBehavior) return followUpBehavior;
    try {
      const settings = await ctx.input.client.settings();
      followUpBehavior = settings.followUpBehavior === "queue" ? "queue" : "steer";
    } catch {
      followUpBehavior = "steer";
    }
    return followUpBehavior;
  };

  // AI titles: desktop owners title forwarded starts themselves, so the TUI
  // only generates on hosts without a browser panel — plus explicit /rename.
  let hostDescription: { browserPanel?: boolean } | undefined;
  const hostOwnsTitles = async () => {
    if (hostDescription === undefined) {
      hostDescription =
        typeof ctx.input.client.describeHost === "function"
          ? await ctx.input.client.describeHost().catch(() => ({}))
          : {};
    }
    return hostDescription.browserPanel === true;
  };
  let cachedSettings: Record<string, unknown> | undefined;
  const remoteSettings = async () => {
    if (!cachedSettings) {
      try {
        cachedSettings = record(await ctx.input.client.settings());
      } catch {
        cachedSettings = {};
      }
    }
    return cachedSettings;
  };
  const titleGenChoice = async (thread: Thread, location: ProjectLocation) => {
    const settings = await remoteSettings();
    const wsl = location.kind === "wsl";
    const provider = String(settings[wsl ? "wslTitleGenProvider" : "titleGenProvider"] ?? "auto");
    if (provider === "disabled") return { error: "Title generation is disabled in settings." };
    const statuses = await ctx.agentStatuses();
    const specific = statuses.find(
      (value) => value.kind === provider && ctx.hasGuiAuthentication(value),
    );
    const candidate =
      provider === "auto" || !specific
        ? statuses.find((value) => value.kind === thread.agentKind)
        : specific;
    // The host refuses title generation without a concrete model/effort; the
    // desktop derives them through the shared utility-selection helpers.
    const config = resolveUtilityTaskConfig(candidate, "", "", () => undefined, {
      fallbackModelIds: (agent) => [getMiniModelId(agent)],
      fallbackEfforts: (_agent, _defaults, available) => ["low", available[0]],
    });
    const settingsSelection =
      provider !== "auto" && specific
        ? (settings[wsl ? "wslTitleGenSelection" : "titleGenSelection"] as
            | ModelSelection
            | undefined)
        : undefined;
    const selection = resolveUtilitySelection(
      settingsSelection,
      { model: "", effort: "", fast: false },
      () => ({ model: config.model, effort: config.effort, fast: false }),
    );
    return { agentKind: candidate?.kind ?? thread.agentKind, selection };
  };
  const generateTitle = async (thread: Thread, prompt: string, currentProject: RemoteProject) => {
    const location = resolveProjectLocation(currentProject.location, thread.worktreePath);
    const choice = await titleGenChoice(thread, location);
    if ("error" in choice) throw new Error(choice.error);
    const result = record(
      await ctx.input.client.callRemoteProcedure("generateTitle", {
        projectLocation: location,
        agentKind: choice.agentKind,
        prompt,
        selection: choice.selection,
      }),
    );
    const title = String(result.title ?? "");
    if (!title) throw new Error("Title generation returned no title");
    return title;
  };
  const firstPromptText = async (rawThreadId: string) => {
    try {
      const index = await ctx.input.client.threadPromptIndex(rawThreadId);
      // A truncated index is newest-first — its oldest listed prompt is not
      // the thread's first, so fall through to the history scan.
      if (!index.truncated) {
        const oldest = index.prompts.reduce((best, entry) =>
          entry.position < best.position ? entry : best,
        );
        if (oldest?.text) return oldest.text;
      }
    } catch {
      /* older hosts lack the prompt index route */
    }
    const items = await ctx.listThreadItems(rawThreadId);
    const first = items.find((item) => item.type === "user_message");
    const blocks = Array.isArray(record(first?.payload).content)
      ? (record(first?.payload).content as unknown[])
      : [];
    return blocks
      .flatMap((block) => (record(block).kind === "text" ? [String(record(block).text ?? "")] : []))
      .join("");
  };
  const renameThreadTo = async (rawThreadId: string, title: string) => {
    await ctx.input.client.sendThreadCommand({ kind: "rename", threadId: rawThreadId, title });
    const cached = ctx.threadCache.get(rawThreadId);
    if (cached) ctx.threadCache.set(rawThreadId, { ...cached, title });
  };
  // Auto title after a fresh start: background only, never delays the prompt.
  // Renames only while the title still equals the start-time fallback.
  const autoTitle = (rawThreadId: string, prompt: string, currentProject: RemoteProject) => {
    void (async () => {
      if (await hostOwnsTitles()) return;
      const started = (await ctx.listThreads()).find((value) => value.id === rawThreadId);
      if (!started) return;
      const title = await generateTitle(started, prompt, currentProject);
      const current = (await ctx.listThreads()).find((value) => value.id === rawThreadId);
      if (!current || current.title !== started.title) return;
      await renameThreadTo(rawThreadId, title);
    })().catch(async (error) => {
      if (ctx.debug)
        await logAdapterDebug(ctx.input.bootstrap.home, {
          source: "title.auto",
          error: error instanceof Error ? error.message : String(error),
        });
    });
  };
  return {
    followUpDelivery,
    hostOwnsTitles,
    remoteSettings,
    titleGenChoice,
    generateTitle,
    firstPromptText,
    renameThreadTo,
    autoTitle,
  };
}
