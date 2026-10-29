import type { Thread } from "@/shared/contracts";
import { hostSupportsThreadLaunchMetadata } from "@/shared/remote/protocol/threadLaunchMetadata";
import { sideChatLaunchInput } from "@/shared/sideChatLaunchInput";
import { stripAnsiPreservingLayout } from "@/shared/ansi";
import { assistantDisplayText } from "@/shared/assistantMessageText";
import { historyMessagePage } from "../history";
import { parseSubSessionId, sessionId, threadId } from "../ids";
import { record, supportsGui } from "./helpers";
import type { RouterContext } from "./context";

/** Plugin-facing API surface returned to the TUI plugin entry point. */
export function createFacade(ctx: RouterContext) {
  const {
    input,
    sessions,
    threadCache,
    inboxEntry,
    seedInbox,
    resolveProject,
    persistLastModel,
    agentStatuses,
    hasGuiAuthentication,
    toSession,
    listThreadItems,
    isGuiThread,
    guiThreads,
    statusListNow,
    visibleThread,
    threadListPage,
    listThreads,
  } = ctx;
  const sessionOptions = async (session: string) => {
    const current = sessions.get(session);
    const remote = (await listThreads()).find((value) => value.id === threadId(session));
    const status = (await agentStatuses()).find(
      (value) => value.kind === (current?.providerID ?? remote?.agentKind ?? ctx.activeProviderID),
    );
    const caps = status?.capabilities.presentationCapabilities?.gui ?? status?.capabilities;
    const model = current?.model ?? remote?.config.model;
    const fastModels = caps?.fastModels ?? status?.capabilities.fastModels ?? [];
    const thinkingModels = caps?.thinkingModels ?? status?.capabilities.thinkingModels ?? [];
    return {
      approvalPolicies: (caps?.approvalPolicies ??
        status?.capabilities.approvalPolicies ??
        []) as readonly { id: string; label: string }[],
      sandboxModes: (caps?.sandboxModes ?? status?.capabilities.sandboxModes ?? []) as readonly {
        id: string;
        label: string;
      }[],
      fast: {
        offered: model !== undefined && fastModels.includes(model),
        disabledReason: caps?.fastDisabledReason ?? status?.capabilities.fastDisabledReason,
      },
      thinking: { offered: model !== undefined && thinkingModels.includes(model) },
      contextSizes: (caps?.contextSizes ?? status?.capabilities.contextSizes ?? []) as readonly {
        id: string;
        label: string;
      }[],
      defaults: {
        approvalPolicy: caps?.defaultApprovalPolicy ?? status?.capabilities.defaultApprovalPolicy,
        sandboxMode: caps?.defaultSandboxMode ?? status?.capabilities.defaultSandboxMode,
      },
    };
  };

  const setSessionOptions = async (
    session: string,
    choice: {
      approvalPolicy?: string;
      sandboxMode?: string;
      fast?: boolean;
      thinking?: boolean;
      contextSize?: string;
    },
  ) => {
    const current = sessions.get(session);
    const offered = await sessionOptions(session);
    if (
      choice.approvalPolicy &&
      offered.approvalPolicies.length > 0 &&
      !offered.approvalPolicies.some((option) => option.id === choice.approvalPolicy)
    )
      return { error: `Unknown approval policy: ${choice.approvalPolicy}`, status: 400 };
    if (
      choice.sandboxMode &&
      offered.sandboxModes.length > 0 &&
      !offered.sandboxModes.some((option) => option.id === choice.sandboxMode)
    )
      return { error: `Unknown sandbox mode: ${choice.sandboxMode}`, status: 400 };
    if (choice.fast !== undefined && !offered.fast.offered)
      return { error: "Fast mode is not offered for this session's model", status: 400 };
    if (choice.thinking !== undefined && !offered.thinking.offered)
      return {
        error: "Thinking mode is not offered for this session's model",
        status: 400,
      };
    if (
      choice.contextSize &&
      offered.contextSizes.length > 0 &&
      !offered.contextSizes.some((option) => option.id === choice.contextSize)
    )
      return { error: `Unknown context size: ${choice.contextSize}`, status: 400 };
    if (!current) return { error: "Unknown session", status: 404 };
    const updated = {
      ...current,
      ...(choice.approvalPolicy ? { approvalPolicy: choice.approvalPolicy } : {}),
      ...(choice.sandboxMode ? { sandboxMode: choice.sandboxMode } : {}),
      ...(choice.fast !== undefined ? { fast: choice.fast } : {}),
      ...(choice.thinking !== undefined ? { thinking: choice.thinking } : {}),
      ...(choice.contextSize ? { contextSize: choice.contextSize } : {}),
    };
    sessions.set(session, updated);
    await persistLastModel({
      ...(updated.providerID ? { provider: updated.providerID } : {}),
      ...(updated.model ? { model: updated.model } : {}),
      ...(updated.effort ? { effort: updated.effort } : {}),
      ...(updated.fast !== undefined ? { fast: updated.fast } : {}),
      ...(updated.thinking !== undefined ? { thinking: updated.thinking } : {}),
      ...(updated.contextSize ? { contextSize: updated.contextSize } : {}),
      ...(choice.approvalPolicy ? { approvalPolicy: choice.approvalPolicy } : {}),
      ...(choice.sandboxMode ? { sandboxMode: choice.sandboxMode } : {}),
    });
    return { ok: true as const };
  };

  // exportSession assembles a full transcript through the existing history
  // projection — every bounded page — in the SessionTransferData shape the
  // generated client expects.
  const exportSession = async (session: string, remoteThread?: Thread) => {
    const thread =
      remoteThread ?? (await guiThreads()).find((value) => value.id === threadId(session));
    if (!thread) throw new Error(`Unknown session: ${session}`);
    await input.setThreadInterests([thread.id]);
    const messages = [];
    let cursor: string | undefined;
    while (true) {
      const page = await historyMessagePage(thread, 100, cursor, async (beforePosition, pageSize) =>
        input.client.threadRuntimeItemsPage({
          threadId: thread.id,
          ...(beforePosition !== undefined ? { beforePosition } : {}),
          limit: pageSize,
          targetTimelineEntryCount: 100,
        }),
      );
      messages.push(...page.data);
      if (page.cursor.next === null) break;
      cursor = page.cursor.next;
    }
    const currentProject = await resolveProject();
    return { info: toSession(thread, currentProject), messages };
  };

  // offeredProviders lists installed GUI providers with their first enabled
  // model so the plugin's switch command can create a bound session.
  const offeredProviders = async () =>
    (await agentStatuses())
      .filter(supportsGui)
      .filter(
        (status) => (status.presentationAuthStates?.gui ?? status.authState) === "authenticated",
      )
      .map((status) => {
        const caps = status.capabilities.presentationCapabilities?.gui ?? status.capabilities;
        return {
          id: status.kind,
          label: status.label,
          model: caps.models?.[0]?.id ?? status.capabilities.models?.[0]?.id,
        };
      });

  // threadFlags reads the cached thread metadata (star/done) for the plugin's
  // toggle commands; a cache miss refreshes through the thread list once.
  const threadFlags = async (session: string) => {
    const rawId = threadId(session);
    let thread = threadCache.get(rawId);
    if (!thread) thread = (await listThreads()).find((value) => value.id === rawId);
    if (!thread) return undefined;
    return { starred: Boolean(thread.starred), done: Boolean(thread.done) };
  };
  const setStarred = async (session: string, starred: boolean) => {
    await input.client.sendThreadCommand({
      kind: "set-starred",
      threadId: threadId(session),
      starred,
    });
    await listThreads();
    return threadFlags(session);
  };
  const setDone = async (session: string, done: boolean) => {
    await input.client.sendThreadCommand({
      kind: "set-done",
      threadId: threadId(session),
      done,
    });
    await listThreads();
    return threadFlags(session);
  };

  // A paused follow-up queue means a desktop user is editing an item;
  // resumeThreadFollowUps unpauses it. Report whether anything resumed.
  const resumeQueue = async (session: string) => {
    const rawId = threadId(session);
    await seedInbox(rawId);
    const entry = inboxEntry(rawId);
    if (!entry.paused) return { resumed: false as const };
    await input.client.callRemoteProcedure("resumeThreadFollowUps", { threadId: rawId });
    entry.paused = false;
    return { resumed: true as const };
  };

  // Side chat — a hidden GUI child thread that inherits the source thread's
  // project/provider/config, painted with the question only; the transcript
  // rides privately in clientContext.conversationSnapshot.
  const startSideChat = async (sessionID: string, question: string) => {
    const remoteThread = await visibleThread(threadId(sessionID));
    if (!remoteThread) throw new Error("Session not found");
    const currentProject = await resolveProject();
    const tail = (text: string) => {
      const plain = stripAnsiPreservingLayout(text);
      return plain.length > 6000 ? `[output truncated]\n${plain.slice(-6000)}` : plain;
    };
    const rows: string[] = [];
    for (const item of await listThreadItems(remoteThread.id)) {
      if (item.parentItemId) continue; // top-level only
      if (item.type === "user_message") {
        const text = String(record(item.payload).text ?? record(item.payload).prompt ?? "");
        if (text.trim()) rows.push(`User: ${tail(text)}`);
      } else if (item.type === "assistant_message") {
        const text = assistantDisplayText(item) ?? String(record(item.payload).text ?? "");
        if (text.trim()) rows.push(`Assistant: ${tail(text)}`);
      }
    }
    const transcript = rows.join("\n\n");
    const launched = sideChatLaunchInput(
      question,
      [{ kind: "text", content: question }],
      transcript || undefined,
    );
    const host =
      typeof input.client.describeHost === "function"
        ? await input.client.describeHost().catch(() => ({}))
        : {};
    const supportsMetadata = hostSupportsThreadLaunchMetadata(
      record(record(host).capabilities).threadLaunchMetadata as
        | { readonly versions: readonly number[] }
        | undefined,
    );
    const childId = crypto.randomUUID();
    await input.client.startNewThread({
      threadId: childId,
      projectId: currentProject.id,
      agentKind: remoteThread.agentKind,
      config: remoteThread.config,
      prompt: launched.prompt,
      segments: launched.segments,
      presentationMode: "gui",
      title: `Side chat · ${question.slice(0, 40)}`,
      ...(remoteThread.worktreePath ? { worktreePath: remoteThread.worktreePath } : {}),
      ...(remoteThread.worktreeBranch ? { worktreeBranch: remoteThread.worktreeBranch } : {}),
      ...(launched.clientContext ? { clientContext: launched.clientContext } : {}),
      ...(supportsMetadata ? { parentThreadId: remoteThread.id } : {}),
    });
    return sessionId(childId);
  };
  // Installed GUI providers that aren't authenticated — the login hint's
  // candidates. agentStatuses already honors the Windows/WSL selection.
  // Bridged for route modules under router/routes/.
  ctx.sessionOptions = sessionOptions;
  ctx.setSessionOptions = setSessionOptions;
  ctx.exportSession = exportSession;

  const loginCandidates = async () =>
    (await agentStatuses())
      .filter((status) => supportsGui(status) && !hasGuiAuthentication(status))
      .map((status) => ({
        kind: status.kind,
        label: record(status).label ?? status.kind,
        ...(typeof record(status).wslDistro === "string"
          ? { wslDistro: String(record(status).wslDistro) }
          : {}),
      }));
  // Provider usage & limits — the host polls providers on their own cadence;
  // an unsupported host or a failed collect surfaces as undefined.
  const providerUsage = async () => {
    try {
      return await input.client.providerUsage?.();
    } catch {
      return undefined;
    }
  };
  // this project's archived GUI threads — pages through the host list the
  // same way the session list does (archived threads age off the first page).
  const archivedThreads = async () => {
    const currentProject = await resolveProject();
    const statusList = await statusListNow();
    const output: Thread[] = [];
    let continuation: { cursor: string; after: unknown } | undefined;
    for (let page = 0; page < 10; page += 1) {
      const result = await threadListPage(continuation);
      for (const thread of result.threads)
        if (
          isGuiThread(thread, statusList) &&
          thread.projectId === currentProject.id &&
          thread.archived
        )
          output.push(thread);
      continuation = result.next;
      if (!continuation) break;
    }
    return output;
  };
  // Provider session actions — the host exposes per-thread actions a client
  // can invoke (listThreadSessionActions / invokeThreadSessionAction). An
  // unsupported host or error surfaces as an empty list / thrown error.
  const sessionActions = async (sessionID: string) => {
    if (parseSubSessionId(sessionID)) return [];
    const result = await input.client
      .callRemoteProcedure("listThreadSessionActions", { threadId: threadId(sessionID) })
      .catch(() => null);
    const actions = record(result).actions;
    if (!Array.isArray(actions)) return [];
    return actions
      .map((value) => record(value))
      .filter((entry) => typeof entry.id === "string")
      .map((entry) => ({ id: String(entry.id) }));
  };
  const invokeSessionAction = async (sessionID: string, actionId: string) => {
    if (parseSubSessionId(sessionID)) throw new Error("Subagent transcripts are read-only.");
    return input.client.callRemoteProcedure("invokeThreadSessionAction", {
      threadId: threadId(sessionID),
      actionId,
      payload: {},
    });
  };
  return {
    sessionOptions,
    setSessionOptions,
    exportSession,
    offeredProviders,
    threadFlags,
    setStarred,
    setDone,
    resumeQueue,
    startSideChat,
    loginCandidates,
    providerUsage,
    archivedThreads,
    sessionActions,
    invokeSessionAction,
  };
}
