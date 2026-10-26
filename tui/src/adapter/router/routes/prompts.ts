import { logAdapterDebug } from "../../diagnostics";
import { openCodeEvent } from "../../events";
import { threadId } from "../../ids";
import { json, record, supportsMode } from "../helpers";
import { isThreadTurnActive } from "@/shared/contracts";
import type { RouteArgs } from "../context";

/** Prompt, compact, command, interrupt, and selection routes. */
export async function handlePromptRoutes({
  ctx,
  method,
  path,
  readBody,
}: RouteArgs): Promise<Response | undefined> {
  const {
    input,
    sessions,
    states,
    pendingSwitches,
    threadCache,
    resolveProject,
    agentStatuses,
    directoryOf,
    cachedThreadById,
    isHiddenThread,
    visibleThread,
    isLiveSubSession,
    sendPrompt,
  } = ctx;

  const promptMatch = path.match(/^\/api\/session\/([^/]+)\/prompt$/u);
  if (promptMatch && method === "POST") {
    const promptSession = decodeURIComponent(promptMatch[1]!);
    if (await isHiddenThread(threadId(promptSession)))
      return json({ error: { code: "not_found", message: "Session not found" } }, 404);
    if (await isLiveSubSession(promptSession)) {
      return json(
        {
          error: {
            code: "read_only",
            message: "Subagent transcripts are read-only; prompt the parent session instead.",
          },
        },
        400,
      );
    }
    const promptResult = await sendPrompt(promptSession, await readBody());
    if ("error" in promptResult)
      return json(
        { error: promptResult.error },
        "status" in promptResult && typeof promptResult.status === "number"
          ? promptResult.status
          : 400,
      );
    return json(promptResult);
  }
  const compactMatch = path.match(/^\/api\/session\/([^/]+)\/compact$/u);
  if (compactMatch && method === "POST") {
    const compactSession = decodeURIComponent(compactMatch[1]!);
    if (await isLiveSubSession(compactSession))
      return json(
        {
          error: {
            code: "read_only",
            message: "Subagent transcripts are read-only; compact the parent session instead.",
          },
        },
        400,
      );
    const compactThread = await visibleThread(threadId(compactSession));
    if (!compactThread)
      return json({ error: { code: "not_found", message: "Session not found" } }, 404);
    const providerID = compactThread.agentKind;
    let compactAvailable = false;
    try {
      const commands = await input.client.agentSlashCommands(providerID);
      compactAvailable = commands.commands.some((command) => command.id === "compact");
    } catch {
      compactAvailable = false;
    }
    if (!compactAvailable)
      return json(
        {
          error: {
            code: "unsupported",
            message: "This provider has no compact command.",
          },
        },
        400,
      );
    const compactResult = await sendPrompt(compactSession, { text: "/compact" });
    if ("error" in compactResult)
      return json({ error: compactResult.error }, compactResult.status ?? 400);
    // session.compact declares 200 + SessionInboxCompaction.
    return json({
      data: {
        id: `msg_${crypto.randomUUID()}`,
        sessionID: compactSession,
        time: { created: Date.now() },
        type: "compaction",
        payload: {},
        delivery: "steer",
      },
    });
  }
  const commandMatch = path.match(/^\/api\/session\/([^/]+)\/command$/u);
  if (commandMatch && method === "POST") {
    const session = decodeURIComponent(commandMatch[1]!);
    if (await isHiddenThread(threadId(session)))
      return json({ error: { code: "not_found", message: "Session not found" } }, 404);
    const body = record(await readBody());
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) throw new Error("A slash command name is required.");
    const args = typeof body.text === "string" ? body.text : "";
    const commandResult = await sendPrompt(session, {
      text: `/${name}${args ? ` ${args}` : ""}`,
    });
    if ("error" in commandResult)
      return json({ error: commandResult.error }, commandResult.status ?? 400);
    return new Response(null, { status: 204 });
  }
  const interruptMatch = path.match(/^\/api\/session\/([^/]+)\/interrupt$/u);
  if (interruptMatch && method === "POST") {
    const interruptSession = decodeURIComponent(interruptMatch[1]!);
    if (await isHiddenThread(threadId(interruptSession)))
      return json({ error: { code: "not_found", message: "Session not found" } }, 404);
    if (await isLiveSubSession(interruptSession)) {
      return json(
        {
          error: {
            code: "read_only",
            message: "Subagent transcripts are read-only; interrupt the parent session instead.",
          },
        },
        400,
      );
    }
    const id = threadId(interruptSession);
    // No-op on an idle thread: interrupting an idle host thread can emit a
    // transient thread-state that never settles, and the vendored undo
    // always interrupts before wait/revert.stage.
    const remoteThread = await cachedThreadById(id);
    const liveStatus = states.get(id) ?? remoteThread?.status;
    const turnActive = liveStatus !== undefined && isThreadTurnActive(liveStatus);
    const runActive = input.hasActiveRun(interruptSession);
    if (ctx.debug)
      await logAdapterDebug(input.bootstrap.home, {
        source: "session.interrupt",
        threadID: id,
        status: String(states.get(id) ?? remoteThread?.status ?? "unknown"),
        turnActive,
        runActive,
        sent: turnActive || runActive,
      });
    // The generated client declares 200 + SessionInterruptResponse — a
    // bare 204 makes the call throw and aborts the vendored undo flow.
    const sent = turnActive || runActive;
    if (sent) await input.client.interruptThread(id);
    return json({ interrupted: sent });
  }
  const selectionMatch = path.match(/^\/api\/session\/([^/]+)\/(agent|model)$/u);
  if (selectionMatch && method === "POST") {
    const id = decodeURIComponent(selectionMatch[1]!);
    const rawThreadID = threadId(id);
    const body = await readBody();
    const currentProject = await resolveProject();
    const current = sessions.get(id) ?? { threadId: rawThreadID, projectId: currentProject.id };
    if (selectionMatch[2] === "agent") {
      const agentID = String(body.agent ?? "build");
      if (agentID === "plan") {
        const status = (await agentStatuses()).find(
          (value) => value.kind === (current.providerID ?? ctx.activeProviderID),
        );
        if (!status || !supportsMode(status, "plan")) {
          return json(
            {
              error: {
                code: "unsupported",
                message: "This provider does not support plan mode.",
              },
            },
            400,
          );
        }
      }
      sessions.set(id, { ...current, agentID });
      if (current.providerID && current.model) {
        input.registerThreadContext(rawThreadID, {
          agent: agentID,
          providerID: current.providerID,
          model: current.model,
          location: { directory: directoryOf(currentProject.location) },
        });
      }
      return new Response(null, { status: 204 });
    }
    const model = record(body.model);
    const providerID = String(model.providerID ?? current.providerID ?? "");
    const modelID = String(model.id ?? current.model ?? "");
    const effort = typeof model.variant === "string" ? model.variant : undefined;
    if (!providerID || !modelID) throw new Error("Choose an installed provider and model");
    // A model from another provider on an existing thread stages an
    // in-place provider switch; the next prompt carries it.
    const remoteThread = threadCache.get(rawThreadID) ?? (await visibleThread(rawThreadID));
    if (remoteThread && remoteThread.agentKind !== providerID) {
      const switchStatus = states.get(rawThreadID) ?? remoteThread.status;
      if (switchStatus === "launching" || switchStatus === "working")
        return json(
          {
            error: {
              code: "busy",
              message: "Wait for the current turn to finish before switching providers.",
            },
          },
          409,
        );
      pendingSwitches.set(id, { providerID, modelID });
      const targetStatus = (await agentStatuses()).find((value) => value.kind === providerID);
      input.events.emit(
        openCodeEvent(
          "tui.toast.show",
          {
            message: `Your next message continues this conversation in ${String(record(targetStatus).label ?? record(targetStatus).name ?? providerID)}.`,
            variant: "info",
          },
          {},
        ),
      );
    } else {
      pendingSwitches.delete(id);
    }
    const updated = {
      ...current,
      providerID,
      model: modelID,
      ...(effort ? { effort } : {}),
    };
    if (current.providerID !== providerID) {
      delete updated.approvalPolicy;
      delete updated.sandboxMode;
    }
    sessions.set(id, updated);
    ctx.activeProviderID = providerID;
    input.registerThreadContext(rawThreadID, {
      agent: current.agentID ?? "build",
      providerID,
      model: modelID,
      location: { directory: directoryOf(currentProject.location) },
    });
    return new Response(null, { status: 204 });
  }
  return undefined;
}
