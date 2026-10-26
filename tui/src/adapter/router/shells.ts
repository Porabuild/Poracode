import { openCodeEvent } from "../events";
import type { RouterContext } from "./context";

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
