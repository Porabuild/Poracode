import type { MessageDescriptor } from "@lingui/core";
import type { Project, ProjectTreeEntry, Thread } from "@/shared/contracts";
import {
  createSearchQuery,
  scoreFileSearchEntry,
  type RankedSearchMatch,
} from "@/shared/searchMatching";
import type { SettingsSearchResult } from "@/renderer/views/SettingsOverlay/parts/settingsSearchIndex";
import { readBridge } from "@/renderer/bridge";
import { formatCommandShortcut } from "./keybindingMatcher";
import type { KeybindingEntry } from "@/shared/keybindings";
import type { AppCommand } from "./registry";
import type { EverythingSearchCategory } from "./everythingSearch";
import type { ConversationSearchHit } from "./useConversationSearch";

export type EverythingSearchResult = (
  | { kind: "thread"; thread: Thread; project: Project | undefined }
  | { kind: "message"; hit: ConversationSearchHit }
  | {
      kind: "command" | "action";
      command: AppCommand;
      title: string;
      subtitle: string;
      shortcut: string;
    }
  | { kind: "setting"; setting: SettingsSearchResult }
  | { kind: "file"; entry: ProjectTreeEntry }
  | { kind: "more"; category: Exclude<EverythingSearchCategory, "all">; label: string }
) & { key: string; score: number };

export interface EverythingSearchSection {
  category: Exclude<EverythingSearchCategory, "all">;
  label: string;
  results: EverythingSearchResult[];
  total: number;
}

const ALL_LIMITS = {
  threads: 5,
  messages: 5,
  actions: 4,
  commands: 5,
  settings: 5,
  files: 8,
} as const;
export const CATEGORY_RESULT_LIMIT = 200;

export function buildEverythingSearchSections(input: {
  category: EverythingSearchCategory;
  query: string;
  projects: ReadonlyMap<string, Project>;
  threads: RankedSearchMatch<Thread>[];
  messages?: ConversationSearchHit[];
  commands: RankedSearchMatch<AppCommand>[];
  actions: RankedSearchMatch<AppCommand>[];
  settings: SettingsSearchResult[];
  files: ProjectTreeEntry[];
  labels: Record<Exclude<EverythingSearchCategory, "all" | "messages">, string> & {
    messages?: string;
  };
  resolve: (value: string | MessageDescriptor) => string;
  keybindings: readonly KeybindingEntry[];
}): EverythingSearchSection[] {
  const query = createSearchQuery(input.query);
  function buildSection<T>(
    category: EverythingSearchSection["category"],
    items: readonly T[],
    result: (item: T) => EverythingSearchResult,
  ): EverythingSearchSection {
    const limit = input.category === "all" ? ALL_LIMITS[category] : CATEGORY_RESULT_LIMIT;
    const results = items.slice(0, limit).map(result);
    if (input.category === "all" && results.length < items.length) {
      results.push({
        key: `more:${category}`,
        kind: "more",
        category,
        label: input.labels[category] ?? input.labels.threads,
        score: 0,
      });
    }
    return {
      category,
      label: input.labels[category] ?? input.labels.threads,
      results,
      total: items.length,
    };
  }
  function command(
    match: RankedSearchMatch<AppCommand>,
    kind: "command" | "action",
  ): EverythingSearchResult {
    return {
      key: `${kind}:${match.item.id}`,
      kind,
      command: match.item,
      title: input.resolve(match.item.title),
      subtitle: input.resolve(match.item.subtitle ?? match.item.group),
      shortcut: formatCommandShortcut(match.item.id, input.keybindings, readBridge().platform),
      score: match.score,
    };
  }
  const sections = [
    ...(input.messages?.length || input.category === "messages"
      ? [
          buildSection("messages", input.messages ?? [], (hit) => ({
            key: `message:${hit.key}`,
            kind: "message",
            hit,
            score: 100,
          })),
        ]
      : []),
    buildSection("threads", input.threads, ({ item: thread, score }) => ({
      key: `thread:${thread.id}`,
      kind: "thread",
      thread,
      project: input.projects.get(thread.projectId),
      score,
    })),
    buildSection("actions", input.actions, (match) => command(match, "action")),
    buildSection("commands", input.commands, (match) => command(match, "command")),
    buildSection("settings", input.settings, (setting) => ({
      key: `setting:${setting.anchor}`,
      kind: "setting",
      setting,
      score: setting.score ?? 0,
    })),
    buildSection("files", input.files, (entry) => ({
      key: `file:${entry.path}`,
      kind: "file",
      entry,
      score: scoreFileSearchEntry(entry, query) ?? 0,
    })),
  ].filter((section) => input.category === "all" || section.category === input.category);
  return input.category === "all" && query.terms.length > 0
    ? sections.toSorted((a, b) => (b.results[0]?.score ?? 0) - (a.results[0]?.score ?? 0))
    : sections;
}
