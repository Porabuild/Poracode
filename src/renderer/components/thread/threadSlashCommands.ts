import type { KeyboardEvent, RefObject } from "react";
import type {
  AgentSlashCommand,
  AgentStatus,
  PromptSegment,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { skillSegmentFromSlashCommand } from "@/shared/promptContent";
import { flattenSegments } from "@/renderer/components/composer/serializeMentions";
import type { MentionInputHandle } from "@/renderer/components/composer/MentionInput";
import {
  getGuiSlashCommands,
  type LocalSlashCommandAction,
} from "@/renderer/components/providers/providerSlashCommands";

export type { LocalSlashCommandAction };

const EMPTY_SLASH_COMMANDS: AgentSlashCommand[] = [];

function isSkillCommand(command: AgentSlashCommand): boolean {
  return command.section === "skills";
}

function withoutSkillCommands(
  commands: readonly AgentSlashCommand[] | undefined,
): AgentSlashCommand[] {
  return commands?.filter((command) => !isSkillCommand(command)) ?? EMPTY_SLASH_COMMANDS;
}

/**
 * Providers can report the same command name from several scopes (user,
 * project, plugin), and a name may also resolve to a skill entry. Inserting any
 * of them types the same `/name`, and a typed name binds to the skill when one
 * exists, so only the first occurrence per name survives and skill entries win
 * over plain commands.
 */
function dedupeBaseCommands(
  commands: readonly AgentSlashCommand[] | undefined,
  skills: readonly AgentSlashCommand[],
): AgentSlashCommand[] {
  const seen = new Set(skills.map((skill) => (skill.skillName ?? skill.id).toLowerCase()));
  return withoutSkillCommands(commands).filter((command) => {
    const id = command.id.toLowerCase();
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function mergeSkillCommands(
  ...sources: (readonly AgentSlashCommand[] | undefined)[]
): AgentSlashCommand[] {
  const seen = new Set<string>();
  return sources.flatMap((commands) =>
    (commands ?? []).flatMap((command) => {
      if (!isSkillCommand(command)) return [];
      const name = (command.skillName ?? command.id).toLowerCase();
      if (seen.has(name)) return [];
      seen.add(name);
      return [command];
    }),
  );
}

function resolveSkillCommands(
  threadCommands: readonly AgentSlashCommand[] | undefined,
  capabilityCommands: readonly AgentSlashCommand[] | undefined,
  localSkills: readonly AgentSlashCommand[],
  providerAuthoritative: boolean,
  disabledSkillNames: readonly string[],
): AgentSlashCommand[] {
  const disabled = new Set(disabledSkillNames.map((name) => name.toLowerCase()));
  const filterDisabled = (commands: readonly AgentSlashCommand[] | undefined) =>
    commands?.filter(
      (command) =>
        !isSkillCommand(command) || !disabled.has((command.skillName ?? command.id).toLowerCase()),
    );
  const providerCommands = filterDisabled(threadCommands ?? capabilityCommands);
  const enabledLocalSkills = filterDisabled(localSkills);
  return providerAuthoritative
    ? mergeSkillCommands(providerCommands)
    : mergeSkillCommands(providerCommands, enabledLocalSkills);
}

/**
 * Bind a typed (or seeded) leading skill reference — `/name` or `$name` at the
 * start of the prompt — to a real skill segment, so text-typed invocations get
 * the same provider-agnostic delivery (structured skill items, prompt
 * injection) as chip insertions. No-op when a skill segment is already
 * present, the leading token isn't a known skill, or its command lacks the
 * full skill metadata. Callers must keep local GUI commands (`/model`, …)
 * winning by skipping the bind when the text resolves to a local action.
 */
export function bindLeadingSkillInvocation(
  segments: readonly PromptSegment[],
  commands: readonly AgentSlashCommand[],
): PromptSegment[] {
  if (segments.some((segment) => segment.kind === "skill")) return [...segments];
  const index = segments.findIndex(
    (segment) => segment.kind !== "text" || segment.content.trim().length > 0,
  );
  const leading = index >= 0 ? segments[index] : undefined;
  if (!leading || leading.kind !== "text") return [...segments];
  const match = /^\s*[/$]([a-z0-9][a-z0-9-]*)(\s|$)/iu.exec(leading.content);
  if (!match) return [...segments];
  const name = match[1]!.toLowerCase();
  const command = commands.find(
    (candidate) =>
      isSkillCommand(candidate) && (candidate.skillName ?? candidate.id).toLowerCase() === name,
  );
  const skillSegment = skillSegmentFromSlashCommand(command);
  if (!skillSegment) return [...segments];
  // Keep the whitespace separator with the trailing text so the flattened
  // prompt reads `<invocation> <rest>`.
  const rest = leading.content.slice(match[0].length - (match[2]?.length ?? 0));
  const replacement: PromptSegment[] = [skillSegment];
  if (rest.length > 0) replacement.push({ kind: "text", content: rest });
  const next = [...segments];
  next.splice(index, 1, ...replacement);
  return next;
}

export function rebindSkillSegments(
  segments: readonly PromptSegment[],
  commands: readonly AgentSlashCommand[],
  fallback: (name: string) => string,
): PromptSegment[] {
  const skills = new Map(
    commands
      .filter((command) => isSkillCommand(command))
      .map((command) => [(command.skillName ?? command.id).toLowerCase(), command]),
  );
  return segments.map((segment) => {
    if (segment.kind !== "skill") return segment;
    const command = skills.get(segment.name.toLowerCase());
    return (
      skillSegmentFromSlashCommand(command) ?? {
        kind: "text",
        content: fallback(segment.name),
      }
    );
  });
}

/**
 * Session-scoped commands win over the provider capability fallback so a live
 * thread can narrow or replace the install-time catalog. The renderer treats
 * these as autocomplete suggestions only and never validates typed commands.
 */
export function resolveAvailableSlashCommands(
  threadCommands: readonly AgentSlashCommand[] | undefined,
  capabilityCommands: readonly AgentSlashCommand[] | undefined,
  context?: {
    agentKind?: AgentStatus["kind"] | undefined;
    presentationMode?: ThreadPresentationMode | undefined;
    hasEffort?: boolean | undefined;
    supportsFast?: boolean | undefined;
    skillCommands?: readonly AgentSlashCommand[] | undefined;
    skillCatalogAuthoritative?: boolean | undefined;
    disabledSkillNames?: readonly string[] | undefined;
  },
): readonly AgentSlashCommand[] {
  const localSkills = context?.skillCommands ?? EMPTY_SLASH_COMMANDS;
  const providerSkillsAuthoritative = context?.skillCatalogAuthoritative === true;
  const skills = resolveSkillCommands(
    threadCommands,
    capabilityCommands,
    localSkills,
    providerSkillsAuthoritative,
    context?.disabledSkillNames ?? [],
  );
  if (context?.presentationMode === "terminal") {
    const base = threadCommands ?? capabilityCommands ?? EMPTY_SLASH_COMMANDS;
    return [...dedupeBaseCommands(base, skills), ...skills];
  }
  if (context?.agentKind) {
    const registration = getGuiSlashCommands(context.agentKind);
    if (registration) {
      return [
        ...registration.buildCommands({
          hasEffort: context.hasEffort ?? false,
          supportsFast: context.supportsFast ?? false,
        }),
        ...skills,
      ];
    }
  }
  const base = threadCommands ?? capabilityCommands ?? EMPTY_SLASH_COMMANDS;
  return [...dedupeBaseCommands(base, skills), ...skills];
}

export function resolveLocalSlashCommandAction(
  input: string,
  context: {
    agentKind?: AgentStatus["kind"] | undefined;
    presentationMode?: ThreadPresentationMode | undefined;
  },
): LocalSlashCommandAction | null {
  if (!context.agentKind || context.presentationMode === "terminal") return null;
  const registration = getGuiSlashCommands(context.agentKind);
  return registration ? registration.resolveLocalAction(input) : null;
}

/**
 * Typed `/skill` text becomes a real skill segment (same delivery path as a
 * chip insertion) unless the text resolves to a local GUI command, which keeps
 * `/model`-style commands winning any name collision.
 */
export function bindLeadingSkillUnlessLocalAction(
  segments: PromptSegment[],
  commands: readonly AgentSlashCommand[],
  context: {
    agentKind?: AgentStatus["kind"] | undefined;
    presentationMode?: ThreadPresentationMode | undefined;
  },
): PromptSegment[] {
  return resolveLocalSlashCommandAction(flattenSegments(segments), context)
    ? segments
    : bindLeadingSkillInvocation(segments, commands);
}

/**
 * A bound skill segment wins any residual local-command collision, so only fall
 * back to a local GUI action when the prompt carries no skill segment.
 */
export function resolveLocalActionUnlessSkill(
  segments: readonly PromptSegment[],
  input: string,
  context: {
    agentKind?: AgentStatus["kind"] | undefined;
    presentationMode?: ThreadPresentationMode | undefined;
  },
): LocalSlashCommandAction | null {
  return segments.some((segment) => segment.kind === "skill")
    ? null
    : resolveLocalSlashCommandAction(input, context);
}

export function filterSlashCommands(
  commands: readonly AgentSlashCommand[],
  query: string | null,
): AgentSlashCommand[] {
  if (query === null) {
    return EMPTY_SLASH_COMMANDS;
  }

  const normalizedQuery = query.toLowerCase();
  return commands.filter((command) => command.id.toLowerCase().startsWith(normalizedQuery));
}

export interface SlashCommandPanelKeyDownContext {
  slashQuery: string | null;
  filteredCommands: readonly AgentSlashCommand[];
  slashActiveIndex: number;
  setSlashActiveIndex: (updater: (prev: number) => number) => void;
  setSlashQuery: (value: string | null) => void;
  mentionRef: RefObject<MentionInputHandle | null>;
}

export function handleSlashCommandPanelKeyDown(
  e: KeyboardEvent,
  ctx: SlashCommandPanelKeyDownContext,
): boolean {
  const { filteredCommands, mentionRef, setSlashActiveIndex, setSlashQuery } = ctx;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    setSlashActiveIndex((prev) => (prev + 1) % filteredCommands.length);
    return true;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    setSlashActiveIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
    return true;
  }
  if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) {
    const selected = filteredCommands[ctx.slashActiveIndex];
    if (selected) {
      e.preventDefault();
      mentionRef.current?.insertSlashCommand(selected);
      setSlashQuery(null);
      return true;
    }
  }
  if (e.key === " " && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const typed = (ctx.slashQuery ?? "").toLowerCase();
    const exact = filteredCommands.find((cmd) => cmd.id.toLowerCase() === typed);
    if (exact) {
      e.preventDefault();
      mentionRef.current?.insertSlashCommand(exact);
      setSlashQuery(null);
      return true;
    }
  }
  if (e.key === "Escape") {
    e.preventDefault();
    setSlashQuery(null);
    return true;
  }
  return false;
}
