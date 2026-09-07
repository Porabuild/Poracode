import { memo, useState, type ReactNode } from "react";
import {
  Check,
  Eye,
  FolderSearch,
  GitBranch,
  Package,
  SearchCode,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import type { CommandExecutionPayload } from "@/shared/contracts";
import { stripAnsiPreservingLayout } from "@/shared/ansi";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import { ChatItemAccordion } from "./ChatItemAccordion";
import { CommandOutputViewport } from "./CommandOutputViewport";
import { getCommandExecutionCollapsedHeader } from "./collapsedHeaderCache";
import { type CommandIntentKind } from "./commandSummary";
import { extractAcpResultText } from "./acpToolPayload";

interface CommandExecutionProps {
  item: RuntimeChatItem;
}

export const CommandExecution = memo(function CommandExecution({ item }: CommandExecutionProps) {
  const payload = getRuntimeItemPayload<CommandExecutionPayload>(item, "command_execution");
  const [isExpanded, setIsExpanded] = useState(false);
  const header = payload ? getCommandExecutionCollapsedHeader(item, payload) : null;
  const isRunning = item.state !== "completed";
  const status = resolveCommandStatus(
    isRunning,
    header?.exitCode,
    header?.durationMs,
    header?.isPayloadError === true,
  );
  const Icon = COMMAND_INTENT_ICONS[header?.display.kind ?? "command"];
  const displayCommandLine = header?.displayCommandLine ?? "";
  const display = header?.display;

  const rawOutput = item.streams.command_output ?? "";
  // Body-only — skip ANSI strip while collapsed.
  const plainOutput = isExpanded ? stripAnsiPreservingLayout(rawOutput) : "";
  const acpResultText = isExpanded && plainOutput.length === 0 ? extractAcpResultText(payload) : "";
  const terminalBody = [
    displayCommandLine ? `$ ${displayCommandLine}` : "$ (command)",
    plainOutput.length > 0 ? plainOutput : acpResultText,
  ]
    .filter((p) => p.length > 0)
    .join("\n\n");

  if (!payload || !header || !display) return null;

  return (
    <ChatItemAccordion
      icon={<Icon className="size-3" />}
      title={display.title}
      {...(display.parts ? { titleParts: display.parts } : {})}
      isRunning={isRunning}
      rightLabel={status.rightLabel}
      rightLabelClassName={status.textClass}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      {terminalBody.length > 0 ? <CommandOutputViewport text={terminalBody} /> : null}
    </ChatItemAccordion>
  );
});

const COMMAND_INTENT_ICONS = {
  view: Eye,
  search: SearchCode,
  git: GitBranch,
  check: Check,
  install: Package,
  package: Package,
  list: FolderSearch,
  command: Terminal,
} as const satisfies Record<CommandIntentKind, LucideIcon>;

export function iconForCommandIntent(kind: CommandIntentKind): LucideIcon {
  return COMMAND_INTENT_ICONS[kind];
}

type CommandStatus = { textClass: string; rightLabel: ReactNode };

function resolveCommandStatus(
  isRunning: boolean,
  exitCode: number | undefined,
  durationMs: number | undefined,
  isPayloadError = false,
): CommandStatus {
  // Running state is signalled by the shimmering title (ChatItemAccordion's
  // `isRunning`), matching grouped tool rows — no spinner on the right.
  if (isRunning) {
    return { textClass: "!text-[color:var(--muted)]", rightLabel: null };
  }
  const dur = durationMs != null ? formatDuration(durationMs) : "";
  if (!isPayloadError && (exitCode === undefined || exitCode === 0)) {
    return { textClass: "!text-[color:var(--muted)]", rightLabel: dur };
  }
  return {
    textClass: "text-danger",
    rightLabel: dur,
  };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
