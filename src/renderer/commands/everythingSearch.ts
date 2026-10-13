import type { MessageDescriptor } from "@lingui/core";
import type { Project, Thread } from "@/shared/contracts";
import type { AppCommand } from "./registry";
import {
  createSearchQuery,
  scoreSearchFields,
  type RankedSearchMatch,
  type SearchQuery,
} from "@/shared/searchMatching";

export type EverythingSearchCategory =
  | "all"
  | "threads"
  | "commands"
  | "settings"
  | "files"
  | "actions";

type ResolveMessage = (value: string | MessageDescriptor) => string;

export function filterThreadsForSearch(
  threads: readonly Thread[],
  projectsById: ReadonlyMap<string, Project>,
  query: string,
): RankedSearchMatch<Thread>[] {
  const search = createSearchQuery(query);
  return threads
    .filter((thread) => !thread.archived && projectsById.has(thread.projectId))
    .map((thread) => ({
      item: thread,
      score: scoreThreadForSearch(thread, projectsById.get(thread.projectId), search),
    }))
    .filter((match): match is RankedSearchMatch<Thread> => match.score !== null)
    .toSorted((a, b) => {
      if (a.score !== b.score) return (b.score ?? 0) - (a.score ?? 0);
      if (a.item.starred !== b.item.starred) return a.item.starred ? -1 : 1;
      return new Date(b.item.updatedAt).getTime() - new Date(a.item.updatedAt).getTime();
    });
}

export function scoreThreadForSearch(
  thread: Thread,
  project: Project | undefined,
  query: SearchQuery,
): number | null {
  return scoreSearchFields(
    [
      { text: thread.title, fuzzy: true },
      { text: project?.name ?? "", weight: 0.4 },
      { text: thread.worktreeBranch ?? "", weight: 0.4 },
      { text: thread.worktreePath ?? "", weight: 0.3 },
      { text: thread.agentKind, weight: 0.3 },
    ],
    query,
  );
}

export function filterCommandsForSearch(
  commands: readonly AppCommand[],
  query: string,
  resolve: ResolveMessage,
  kind: "command" | "action",
): RankedSearchMatch<AppCommand>[] {
  const search = createSearchQuery(query);
  return commands
    .filter((command) => {
      if (command.showInPalette === false) return false;
      if (isProjectActionCommand(command) !== (kind === "action")) return false;
      return true;
    })
    .map((command) => ({ item: command, score: scoreCommandForSearch(command, search, resolve) }))
    .filter((match): match is RankedSearchMatch<AppCommand> => match.score !== null)
    .toSorted((a, b) => b.score - a.score);
}

export function scoreCommandForSearch(
  command: AppCommand,
  query: SearchQuery,
  resolve: ResolveMessage,
): number | null {
  return scoreSearchFields(
    [
      { text: resolve(command.title), fuzzy: true },
      { text: resolve(command.group), weight: 0.3 },
      { text: command.subtitle ? resolve(command.subtitle) : "", weight: 0.4 },
      { text: (command.keywords ?? []).join(" "), weight: 0.4 },
      { text: command.id, weight: 0.3 },
    ],
    query,
  );
}

export function isProjectActionCommand(command: Pick<AppCommand, "id">): boolean {
  return command.id.startsWith("script.") && command.id.endsWith(".run");
}
