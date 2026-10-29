import { json, record } from "./helpers";
import { resolveProjectLocation } from "@/shared/worktree";
import { stripAnsiPreservingLayout } from "@/shared/ansi";
import { threadId } from "../ids";
import { openCodeEvent } from "../events";
import type { RouteArgs, RouterContext } from "./context";

/**
 * Agent background tasks surfaced to the vendored TUI as shells, plus the
 * `!command` stash buffers (state lives on ctx).
 */
export function createShells(ctx: RouterContext) {
  const shellIdFor = (rawThreadId: string, taskId: string) =>
    `sh_bgt_${rawThreadId.replace(/[^A-Za-z0-9_-]/gu, "_")}__${taskId.replace(/[^A-Za-z0-9_-]/gu, "_")}`;
  const parseShellId = (id: string) => {
    if (!id.startsWith("sh_bgt_")) return undefined;
    const rest = id.slice(7);
    const sep = rest.indexOf("__");
    if (sep <= 0 || sep >= rest.length - 2) return undefined;
    return { rawThreadId: rest.slice(0, sep), taskId: rest.slice(sep + 2) };
  };
  const taskFor = (id: string) => {
    const parsed = parseShellId(id);
    if (!parsed) return undefined;
    const task = (ctx.backgroundTasks.get(parsed.rawThreadId) ?? []).find(
      (value) => String(value.taskId ?? "") === parsed.taskId,
    );
    return task ? { task, rawThreadId: parsed.rawThreadId } : undefined;
  };
  const shellInfoFor = (rawThreadId: string, task: Record<string, unknown>, cwd: string) => ({
    id: shellIdFor(rawThreadId, String(task.taskId ?? "")),
    status: "running" as const,
    command: String(task.description ?? ""),
    cwd,
    shell: "",
    file: "",
    metadata: {},
    time: {
      started:
        typeof task.startedAt === "number"
          ? task.startedAt
          : Date.parse(String(task.startedAt ?? "")) || Date.now(),
    },
  });
  const applyBackgroundTasks = (
    rawThreadId: string,
    tasks: Record<string, unknown>[],
    cwd: string,
  ) => {
    const previous = ctx.backgroundTasks.get(rawThreadId) ?? [];
    const previousIds = new Set(previous.map((value) => String(value.taskId ?? "")));
    const nextIds = new Set(tasks.map((value) => String(value.taskId ?? "")));
    ctx.backgroundTasks.set(rawThreadId, tasks);
    for (const task of tasks) {
      const taskId = String(task.taskId ?? "");
      if (!previousIds.has(taskId))
        ctx.input.events.emit(
          openCodeEvent(
            "shell.created",
            { info: shellInfoFor(rawThreadId, task, cwd) } as never,
            {},
          ),
        );
    }
    for (const oldId of previousIds)
      if (!nextIds.has(oldId))
        ctx.input.events.emit(
          openCodeEvent("shell.deleted", { id: shellIdFor(rawThreadId, oldId) }, {}),
        );
  };
  return { shellIdFor, parseShellId, taskFor, shellInfoFor, applyBackgroundTasks };
}

/** Shell routes: list/create/get/output/delete and the composer !-command. */
export async function handleShellRoutes({
  ctx,
  request,
  url,
  method,
  path,
}: RouteArgs): Promise<Response | undefined> {
  const {
    input,
    backgroundTasks,
    shellInfoFor,
    resolveProject,
    requestLocation,
    directoryOf,
    guiThreads,
    states,
    shellStash,
    pendingShellExits,
    pendingShellTimeouts,
    visibleThread,
    isLiveSubSession,
    taskFor,
  } = ctx;

  if (path === "/api/shell" && method === "GET") {
    const currentProject = await resolveProject();
    const cwd = directoryOf(currentProject.location);
    const output: unknown[] = [];
    for (const thread of await guiThreads())
      for (const task of backgroundTasks.get(thread.id) ?? [])
        output.push(shellInfoFor(thread.id, task, cwd));
    return json({ location: requestLocation(url), data: output });
  }
  const sessionShellMatch = path.match(/^\/api\/session\/([^/]+)\/shell$/u);
  if (sessionShellMatch && method === "POST") {
    const shellSession = decodeURIComponent(sessionShellMatch[1]!);
    const body = record(await request.json().catch(() => ({})));
    const command = String(body.command ?? "").trim();
    if (!command)
      return json({ error: { code: "invalid_request", message: "A command is required." } }, 400);
    if (await isLiveSubSession(shellSession))
      return json(
        { error: { code: "read_only", message: "Subagent transcripts are read-only." } },
        400,
      );
    const remoteThread = await visibleThread(threadId(shellSession));
    if (!remoteThread)
      return json({ error: { code: "not_found", message: "Session not found" } }, 404);
    const liveStatus = states.get(remoteThread.id) ?? remoteThread.status;
    if (liveStatus === "launching")
      return json({ error: { code: "conflict", message: "Thread is launching." } }, 409);
    const shellId = crypto.randomUUID();
    const currentProject = await resolveProject();
    const shellLocation = resolveProjectLocation(
      currentProject.location,
      remoteThread.worktreePath,
    );
    let output = "";
    try {
      await input.client.startShell({ shellId, projectLocation: shellLocation });
    } catch (error) {
      return json(
        {
          error: {
            code: "invalid_request",
            message: error instanceof Error ? error.message : String(error),
          },
        },
        400,
      );
    }
    const done = new Promise<void>((resolve) => {
      pendingShellExits.set(shellId, resolve);
    });
    const timer = setTimeout(() => {
      pendingShellTimeouts.add(shellId);
      pendingShellExits.get(shellId)?.();
    }, 120_000);
    try {
      input.watchTerminal?.(shellId, (data) => {
        output += data;
      });
      await input.client.writeTerminal({ threadId: shellId, data: `${command}\r` });
      await input.client.writeTerminal({ threadId: shellId, data: "exit\r" });
      await done;
    } finally {
      clearTimeout(timer);
      pendingShellExits.delete(shellId);
      input.unwatchTerminal?.(shellId);
      input.client.closeShell({ threadId: shellId }).catch(() => {});
    }
    const timedOut = pendingShellTimeouts.has(shellId);
    pendingShellTimeouts.delete(shellId);
    let text = stripAnsiPreservingLayout(output);
    const cap = 64 * 1024;
    if (text.length > cap) text = text.slice(-cap);
    if (timedOut) text += "\n[timed out]";
    // A synthetic completed bash part — TUI-local, the host transcript
    // doesn't get it.
    const messageID = `msg_shell-${crypto.randomUUID()}`;
    input.events.emit(
      openCodeEvent(
        "session.tool.success",
        {
          sessionID: shellSession,
          assistantMessageID: messageID,
          id: `part_${crypto.randomUUID()}`,
          content: [{ type: "text", text }],
          executed: true,
        },
        {
          location: { directory: input.bootstrap.directory },
          durable: { aggregateID: messageID, seq: 1, version: 2 },
        },
      ),
    );
    // One-shot context hand-off: the next real prompt carries the output.
    const stash = shellStash.get(shellSession) ?? [];
    stash.push({ command, output: text });
    shellStash.set(shellSession, stash.slice(-3));
    return new Response(null, { status: 204 });
  }
  if (path === "/api/shell" && method === "POST") {
    return json(
      {
        error: {
          code: "unsupported",
          message: "Start shells from a prompt with !command.",
        },
      },
      501,
    );
  }
  const shellGetMatch = path.match(/^\/api\/shell\/([^/]+)$/u);
  if (shellGetMatch && method === "GET") {
    const hit = taskFor(decodeURIComponent(shellGetMatch[1]!));
    if (!hit) return json({ error: { code: "not_found", message: "Shell not found" } }, 404);
    const currentProject = await resolveProject();
    return json({
      location: requestLocation(url),
      data: shellInfoFor(hit.rawThreadId, hit.task, directoryOf(currentProject.location)),
    });
  }
  const shellOutputMatch = path.match(/^\/api\/shell\/([^/]+)\/output$/u);
  if (shellOutputMatch && method === "GET") {
    const hit = taskFor(decodeURIComponent(shellOutputMatch[1]!));
    if (!hit) return json({ error: { code: "not_found", message: "Shell not found" } }, 404);
    const bytes = new TextEncoder().encode(String(hit.task.progress ?? ""));
    const cursor = Math.max(0, Number(url.searchParams.get("cursor") ?? 0) || 0);
    const limit = Math.max(1, Number(url.searchParams.get("limit") ?? 64 * 1024) || 0);
    const output = bytes.slice(cursor, cursor + limit);
    const end = cursor + output.length;
    return json({
      location: requestLocation(url),
      data: {
        output: new TextDecoder().decode(output),
        cursor: end,
        size: bytes.length,
        truncated: end < bytes.length,
      },
    });
  }
  const shellRemoveMatch = path.match(/^\/api\/shell\/([^/]+)$/u);
  if (shellRemoveMatch && method === "DELETE") {
    const hit = taskFor(decodeURIComponent(shellRemoveMatch[1]!));
    if (!hit) return json({ error: { code: "not_found", message: "Shell not found" } }, 404);
    const stopAction = record(hit.task.stopAction);
    if (typeof stopAction.id !== "string")
      return json(
        {
          error: {
            code: "conflict",
            message: "This background task can't be stopped from the TUI.",
          },
        },
        409,
      );
    await input.client.callRemoteProcedure("invokeThreadSessionAction", {
      threadId: hit.rawThreadId,
      actionId: stopAction.id,
      payload: stopAction.payload,
    });
    return new Response(null, { status: 204 });
  }
  return undefined;
}
