import { memo, useMemo, useState, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import type { ToolCallPayload } from "@/shared/contracts";
import { PixelLoader } from "@/renderer/components/common";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { ChatItemAccordion } from "./ChatItemAccordion";
import { CommandOutputViewport } from "./CommandOutputViewport";
import { ContextCompaction, isContextCompactionToolCall } from "./ContextCompaction";
import { detectLanguageFromPath } from "./languageDetect";
import { PlanProposal, isPlanProposalToolCall } from "./PlanProposal";
import { ToolCallSections, type ToolCallSection } from "./ToolCallSections";
import {
  extractAcpArgsPart,
  extractAcpResultPart,
  extractReadFileResultPart,
} from "./acpToolPayload";
import { deriveToolDisplay, isSkillTool } from "./toolDisplay";
import { FileContentPlaceholder, useReadAbsoluteFile } from "./useReadAbsoluteFile";

interface ToolCallProps {
  item: RuntimeChatItem;
}

export const ToolCall = memo(function ToolCall({ item }: ToolCallProps) {
  const payload = item.payload as ToolCallPayload | undefined;
  const [isExpanded, setIsExpanded] = useState(false);
  const paneActions = useChatPaneActions();
  const lazyReadPath = pickLazyReadPath(payload);
  const fetchTarget =
    lazyReadPath && paneActions?.projectLocation
      ? { path: lazyReadPath, projectLocation: paneActions.projectLocation }
      : null;
  const fetched = useReadAbsoluteFile(isExpanded ? fetchTarget : null);
  const readResultPart =
    payload?.kind === "read" && !lazyReadPath ? extractReadFileResultPart(payload) : undefined;
  const hasReadResult = !!readResultPart && readResultPart.text.length > 0;
  const sections = useMemo<ToolCallSection[]>(() => {
    if (!isExpanded || !payload) return [];
    if (lazyReadPath || hasReadResult) return [];
    const isSkill = isSkillTool(payload);
    return [
      { label: "args", part: extractAcpArgsPart(payload) },
      {
        label: "result",
        part: extractAcpResultPart(payload),
        ...(isSkill ? { renderAsMarkdown: true } : {}),
      },
    ];
  }, [isExpanded, payload, lazyReadPath, hasReadResult]);
  if (!payload?.name) return null;
  if (isContextCompactionToolCall(item)) return <ContextCompaction item={item} />;
  if (isPlanProposalToolCall(item)) return <PlanProposal item={item} />;
  const hasDetails =
    payload.args !== undefined || payload.result !== undefined || fetchTarget !== null;
  const display = deriveToolDisplay(payload);
  const Icon = display.Icon;
  const status = resolveToolStatus(item, payload);

  return (
    <ChatItemAccordion
      icon={<Icon className="size-3" />}
      title={display.title}
      {...(display.parts ? { titleParts: display.parts } : {})}
      rightLabel={status.rightLabel}
      rightLabelClassName={status.rightLabelClassName}
      hasBody={hasDetails}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      {fetchTarget ? (
        fetched.content !== undefined ? (
          <CommandOutputViewport
            text={fetched.content}
            language={detectLanguageFromPath(fetchTarget.path)}
          />
        ) : (
          <FileContentPlaceholder state={fetched.state} reason={fetched.reason} />
        )
      ) : readResultPart && hasReadResult ? (
        <CommandOutputViewport text={readResultPart.text} language={readResultPart.language} />
      ) : (
        <ToolCallSections sections={sections} />
      )}
    </ChatItemAccordion>
  );
});

/**
 * For ACP read tools that didn't carry the file content in the result (e.g.
 * Gemini's `read_file` only reports `locations[]`), pick a path so the
 * accordion body can lazy-fetch from disk with syntax highlighting. Returns
 * undefined when the result is already populated — those use the existing
 * read-file result extractor instead.
 */
function pickLazyReadPath(payload: ToolCallPayload | undefined): string | undefined {
  if (!payload || payload.kind !== "read") return undefined;
  if (payload.result !== undefined) return undefined;
  return payload.locations?.find((location) => location.path.length > 0)?.path;
}

interface ToolStatusDisplay {
  rightLabel: ReactNode;
  rightLabelClassName: string;
}

function resolveToolStatus(item: RuntimeChatItem, payload: ToolCallPayload): ToolStatusDisplay {
  const isRunning = item.state !== "completed" || payload.status === "running";
  if (isRunning) {
    return {
      rightLabel: <PixelLoader size="xxs" className="text-[color:var(--muted)]" />,
      rightLabelClassName: "!text-[color:var(--muted)]",
    };
  }
  if (payload.status === "error") {
    return {
      rightLabel: <CircleAlert className="size-3 text-danger" aria-label="error" />,
      rightLabelClassName: "text-danger",
    };
  }
  return { rightLabel: null, rightLabelClassName: "!text-[color:var(--muted)]" };
}
