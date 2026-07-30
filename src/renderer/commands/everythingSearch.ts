import type { MessageDescriptor } from "@lingui/core";
import type { Project, Thread } from "@/shared/contracts";
import type { AppCommand } from "./registry";

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
): Thread[] {
  const terms = searchTerms(query);
  return threads
    .filter((thread) => {
      if (thread.archived) return false;
      const project = projectsById.get(thread.projectId);
      return matchesTerms(
        [
          thread.title,
          project?.name ?? "",
          thread.worktreeBranch ?? "",
          thread.worktreePath ?? "",
          thread.agentKind,
        ],
        terms,
      );
    })
    .toSorted((a, b) => {
      if (a.starred !== b.starred) return a.starred ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
}

export function filterCommandsForSearch(
  commands: readonly AppCommand[],
  query: string,
  resolve: ResolveMessage,
  kind: "command" | "action",
): AppCommand[] {
  const terms = searchTerms(query);
  return commands.filter((command) => {
    if (command.showInPalette === false) return false;
    if (isProjectActionCommand(command) !== (kind === "action")) return false;
    return matchesTerms(
      [
        command.id,
        resolve(command.title),
        resolve(command.group),
        command.subtitle ? resolve(command.subtitle) : "",
        ...(command.keywords ?? []),
      ],
      terms,
    );
  });
}

export function isProjectActionCommand(command: Pick<AppCommand, "id">): boolean {
  return command.id.startsWith("script.") && command.id.endsWith(".run");
}

function searchTerms(query: string): string[] {
  return query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
}

function matchesTerms(values: readonly string[], terms: readonly string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = values.join(" ").toLocaleLowerCase();
  return terms.every((term) => haystack.includes(term));
}
