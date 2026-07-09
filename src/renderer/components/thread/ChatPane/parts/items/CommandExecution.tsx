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
import { PixelLoader } from "@/renderer/components/common";
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
  const Icon = iconForCommandIntent(header?.display.kind ?? "command");
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
      rightLabel={status.rightLabel}
      rightLabelClassName={status.textClass}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      {terminalBody.length > 0 ? <CommandOutputViewport text={terminalBody} /> : null}
    </ChatItemAccordion>
  );
});

export function iconForCommandIntent(kind: CommandIntentKind): LucideIcon {
  switch (kind) {
    case "view":
      return Eye;
    case "search":
      return SearchCode;
    case "git":
      return GitBranch;
    case "check":
      return Check;
    case "install":
    case "package":
      return Package;
    case "list":
      return FolderSearch;
    case "command":
      return Terminal;
  }
}

type CommandStatus = { textClass: string; rightLabel: ReactNode };

function resolveCommandStatus(
  isRunning: boolean,
  exitCode: number | undefined,
  durationMs: number | undefined,
  isPayloadError = false,
): CommandStatus {
  if (isRunning) {
    return {
      textClass: "!text-[color:var(--muted)]",
      rightLabel: <PixelLoader size="xxs" className="text-[color:var(--muted)]" />,
    };
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
