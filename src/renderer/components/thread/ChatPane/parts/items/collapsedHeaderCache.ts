/**
 * Remount-stable collapsed-header facts for completed chat tool rows.
 *
 * Virtualized scroll remounts rows constantly. React Compiler memo dies with
 * the fiber, so expensive title/diff-summary derivation must live outside
 * render — keyed on the `RuntimeChatItem` object reference. The reducer always
 * replaces the item on mutation, so late payload patches miss the cache
 * automatically. Locale is stored alongside the value so a language switch
 * recomputes without a global clear.
 *
 * Cache plain data only — never JSX. `projectLocation`-derived fetch targets
 * stay live in the component (cheap, not item-derived).
 */

import type {
  CommandExecutionPayload,
  FileChangePayload,
  ToolCallPayload,
} from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import {
  extractAcpAddedFileText,
  extractAcpDiffResultPart,
  extractAcpDiffSummary,
  extractReadFileResultPart,
  readAcpStringField,
  type DiffSummary,
} from "./acpToolPayload";
import {
  commandIntentDisplay,
  summarizeShellCommand,
  type CommandIntentDisplay,
} from "./commandSummary";
import { deriveToolDisplay, type ToolDisplay } from "./toolDisplay";

type CacheEntry<T> = {
  locale: string;
  value: T;
};

const toolCallCache = new WeakMap<RuntimeChatItem, CacheEntry<ToolCallCollapsedHeader>>();
const fileChangeCache = new WeakMap<RuntimeChatItem, CacheEntry<FileChangeCollapsedHeader>>();
const commandCache = new WeakMap<RuntimeChatItem, CacheEntry<CommandExecutionCollapsedHeader>>();

export type ToolCallCollapsedHeader = {
  display: ToolDisplay;
  lazyReadPath: string | undefined;
  hasReadResult: boolean;
  hasDiffText: boolean;
  diffSummary: DiffSummary | undefined;
  hasAuxDetails: boolean;
  payloadStatus: ToolCallPayload["status"] | undefined;
};

export type FileChangeCollapsedHeader = {
  changeKind: FileChangePayload["changeKind"];
  path: string;
  fallbackTitle: string | undefined;
  hasPath: boolean;
  showsFallback: boolean;
  withPath: boolean;
  hasArgContent: boolean;
  hasDiffText: boolean;
  hasAuxFields: boolean;
  diffSummary: DiffSummary | undefined;
  payloadStatus: FileChangePayload["status"] | undefined;
};

export type CommandExecutionCollapsedHeader = {
  display: CommandIntentDisplay;
  displayCommandLine: string;
  fullCommandLine: string;
  exitCode: number | undefined;
  durationMs: number | undefined;
  isPayloadError: boolean;
};

/**
 * Remount-stable, locale-aware memo keyed on `RuntimeChatItem` identity. Only
 * completed rows are cached — running rows still stream, and the reducer
 * replaces the item object on every mutation so a late payload patch keys a
 * fresh entry automatically.
 */
function getCachedHeader<T>(
  cache: WeakMap<RuntimeChatItem, CacheEntry<T>>,
  item: RuntimeChatItem,
  compute: () => T,
): T {
  const locale = i18n.locale;
  if (item.state === "completed") {
    const cached = cache.get(item);
    if (cached && cached.locale === locale) return cached.value;
  }
  const value = compute();
  if (item.state === "completed") {
    cache.set(item, { locale, value });
  }
  return value;
}

export function getToolCallCollapsedHeader(
  item: RuntimeChatItem,
  payload: ToolCallPayload,
): ToolCallCollapsedHeader {
  return getCachedHeader(toolCallCache, item, () => computeToolCallHeader(payload));
}

export function getFileChangeCollapsedHeader(
  item: RuntimeChatItem,
  payload: FileChangePayload,
): FileChangeCollapsedHeader {
  return getCachedHeader(fileChangeCache, item, () => computeFileChangeHeader(payload));
}

export function getCommandExecutionCollapsedHeader(
  item: RuntimeChatItem,
  payload: CommandExecutionPayload,
): CommandExecutionCollapsedHeader {
  return getCachedHeader(commandCache, item, () => computeCommandHeader(payload));
}

function computeToolCallHeader(payload: ToolCallPayload): ToolCallCollapsedHeader {
  const lazyReadPath = pickLazyReadPath(payload);
  const readResultPart =
    isReadLikeToolPayload(payload) && !lazyReadPath
      ? extractReadFileResultPart(payload)
      : undefined;
  const hasReadResult = !!readResultPart && readResultPart.text.length > 0;
  const diffPart = isEditLikeToolPayload(payload) ? extractAcpDiffResultPart(payload) : undefined;
  const hasDiffText = !!diffPart?.text;
  return {
    display: deriveToolDisplay(payload),
    lazyReadPath,
    hasReadResult,
    hasDiffText,
    // Reuse the already-synthesized diff so the fallback summary branch does
    // not rebuild it from the payload a second time.
    diffSummary: hasDiffText ? extractAcpDiffSummary(payload, diffPart) : undefined,
    hasAuxDetails: payload.args !== undefined || payload.result !== undefined,
    payloadStatus: payload.status,
  };
}

function computeFileChangeHeader(payload: FileChangePayload): FileChangeCollapsedHeader {
  const isCreate = payload.changeKind === "create";
  const hasArgContent = isCreate ? extractCreateContentExists(payload) : false;
  const diffPart = !isCreate ? extractAcpDiffResultPart(payload) : undefined;
  const hasDiffText = !!diffPart?.text;
  const fallbackTitle = readPayloadString(payload, "title") ?? readPayloadString(payload, "name");
  const kindVerb = formatKindVerb(payload.changeKind);
  const hasPath = !!payload.path && payload.path.length > 0;
  const showsFallback =
    !hasPath && !!fallbackTitle && fallbackTitle.toLowerCase() !== kindVerb.toLowerCase();
  return {
    changeKind: payload.changeKind,
    path: payload.path,
    fallbackTitle,
    hasPath,
    showsFallback,
    withPath: hasPath || showsFallback,
    hasArgContent,
    hasDiffText,
    hasAuxFields: hasAuxFields(payload),
    diffSummary: payload.diffSummary ?? extractAcpDiffSummary(payload, diffPart),
    payloadStatus: payload.status,
  };
}

function computeCommandHeader(payload: CommandExecutionPayload): CommandExecutionCollapsedHeader {
  const command =
    payload.command && payload.command.length > 0
      ? payload.command
      : (readAcpStringField(payload, "command") ?? "");
  const cwd = payload.cwd?.trim() ?? readAcpStringField(payload, "cwd")?.trim() ?? undefined;
  const fullCommandLine = formatShellInvocation(cwd, command);
  const displayCommandLine = fullCommandLine ? summarizeShellCommand(fullCommandLine) : "";
  return {
    display: commandIntentDisplay(fullCommandLine),
    displayCommandLine,
    fullCommandLine,
    exitCode: payload.exitCode,
    durationMs: payload.durationMs,
    isPayloadError: payload.status === "error",
  };
}

function pickLazyReadPath(payload: ToolCallPayload): string | undefined {
  if (!isReadLikeToolPayload(payload)) return undefined;
  if (payload.result !== undefined) return undefined;
  return payload.locations?.find((location) => location.path.length > 0)?.path;
}

function isReadLikeToolPayload(payload: ToolCallPayload): boolean {
  if (payload.kind === "read") return true;
  if (payload.name === "Read" || payload.name === "NotebookRead") return true;
  const title = payload.title?.trim() || payload.name.trim();
  return /^(?:view|read)(?:ing)?(?:\s|:|$)/i.test(title);
}

function isEditLikeToolPayload(payload: ToolCallPayload): boolean {
  switch (payload.kind) {
    case "edit":
    case "delete":
    case "move":
      return true;
  }
  if (
    ["Edit", "Write", "MultiEdit", "NotebookEdit", "Patch", "ApplyPatch", "apply_patch"].includes(
      payload.name,
    )
  ) {
    return true;
  }
  const title = payload.title?.trim() || payload.name.trim();
  return /^(?:edit|editing|write|writing|patch|patching|create|creating|delete|deleting|remove|removing)(?:\s|:|$)/i.test(
    title,
  );
}

function extractCreateContentExists(payload: FileChangePayload): boolean {
  if (payload.path) {
    if (extractAcpAddedFileText(payload, payload.path) !== undefined) return true;
  }
  const args = (payload as { args?: unknown }).args;
  if (!args || typeof args !== "object" || Array.isArray(args)) return false;
  const content = (args as Record<string, unknown>).content;
  return typeof content === "string" && content.length > 0;
}

function hasAuxFields(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return p.args !== undefined || p.result !== undefined;
}

function readPayloadString(payload: unknown, key: string): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function formatKindVerb(kind: FileChangePayload["changeKind"]): string {
  switch (kind) {
    case "create":
      return "Create";
    case "delete":
      return "Delete";
    default:
      return "Edit";
  }
}

function formatShellInvocation(cwd: string | undefined, command: string): string {
  const cmd = command.trim();
  if (!cmd) return "";
  if (cwd && cwd.length > 0) {
    const needsCd =
      !cmd.toLowerCase().startsWith("cd ") &&
      !/^(['"]).*\1\s+&&\s+/.test(cmd) &&
      !/^\(\s*cd\s/.test(cmd);
    if (needsCd) {
      const escaped = cwd.includes(" ") ? JSON.stringify(cwd) : cwd;
      return `cd ${escaped} && ${cmd}`;
    }
  }
  return cmd;
}

/** Test helper — peek whether an item is currently cached for the active locale. */
function hasCachedHeader<T>(
  cache: WeakMap<RuntimeChatItem, CacheEntry<T>>,
  item: RuntimeChatItem,
): boolean {
  const cached = cache.get(item);
  return !!cached && cached.locale === i18n.locale;
}

export function hasCachedToolCallHeader(item: RuntimeChatItem): boolean {
  return hasCachedHeader(toolCallCache, item);
}

export function hasCachedFileChangeHeader(item: RuntimeChatItem): boolean {
  return hasCachedHeader(fileChangeCache, item);
}

export function hasCachedCommandHeader(item: RuntimeChatItem): boolean {
  return hasCachedHeader(commandCache, item);
}
