import { memo, useState, type ReactNode } from "react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { TranslateFn } from "@/renderer/i18n/i18n";
import { CircleAlert } from "lucide-react";
import type { ToolCallPayload } from "@/shared/contracts";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
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
  extractAcpDiffResultPart,
  extractAcpResultPart,
  extractReadFileResultPart,
  readAcpContentEditTexts,
  type DiffSummary,
} from "./acpToolPayload";
import { getToolCallCollapsedHeader } from "./collapsedHeaderCache";
import { formatDiffSummaryLabel } from "./FileChange";
import { LazyInlineDiffView } from "./LazyInlineDiffView";
import { isSkillTool } from "./toolDisplay";
import { FileContentPlaceholder, useReadAbsoluteFile } from "./useReadAbsoluteFile";

interface ToolCallProps {
  item: RuntimeChatItem;
}

export const ToolCall = memo(function ToolCall({ item }: ToolCallProps) {
  const { t } = useLingui();
  const payload = item.payload as ToolCallPayload | undefined;
  const [isExpanded, setIsExpanded] = useState(false);
  const paneActions = useChatPaneActions();
  // Header cache is only meaningful for normal tool rows. Compaction / plan
  // proposals short-circuit below — still call the hook with a null target so
  // hook order stays stable across those branches.
  const header =
    payload?.name && !isContextCompactionToolCall(item) && !isPlanProposalToolCall(item)
      ? getToolCallCollapsedHeader(item, payload)
      : null;
  const fetchTarget =
    header?.lazyReadPath && paneActions?.projectLocation
      ? { path: header.lazyReadPath, projectLocation: paneActions.projectLocation }
      : null;
  const fetched = useReadAbsoluteFile(isExpanded ? fetchTarget : null);

  if (!payload?.name) return null;
  if (isContextCompactionToolCall(item)) return <ContextCompaction item={item} />;
  if (isPlanProposalToolCall(item)) return <PlanProposal item={item} />;
  if (!header) return null;

  // Body-only extraction — skipped while collapsed so remounts don't re-walk
  // ACP result/diff blobs just to paint the header.
  const readResultPart =
    isExpanded && !header.lazyReadPath && header.hasReadResult
      ? extractReadFileResultPart(payload)
      : undefined;
  const diffText =
    isExpanded && header.hasDiffText ? extractAcpDiffResultPart(payload)?.text : undefined;
  const contentEdit = isExpanded ? readAcpContentEditTexts(payload) : undefined;
  const sections: ToolCallSection[] =
    isExpanded && !header.lazyReadPath && !header.hasReadResult && !header.hasDiffText
      ? [
          { label: "args", part: extractAcpArgsPart(payload) },
          {
            label: "result",
            part: extractAcpResultPart(payload),
            ...(isSkillTool(payload) ? { renderAsMarkdown: true } : {}),
          },
        ]
      : [];
  const hasDetails =
    header.hasAuxDetails || fetchTarget !== null || header.hasDiffText || header.hasReadResult;
  const display = header.display;
  const Icon = display.Icon;
  const status = resolveToolStatus(item, header.payloadStatus, header.diffSummary, t);

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
      ) : readResultPart && header.hasReadResult ? (
        <CommandOutputViewport text={readResultPart.text} language={readResultPart.language} />
      ) : diffText !== undefined ? (
        <LazyInlineDiffView
          diffText={diffText}
          filePath={display.parts?.filePath ? display.parts.path : ""}
          {...(contentEdit ? { oldText: contentEdit.oldText, newText: contentEdit.newText } : {})}
        />
      ) : (
        <ToolCallSections sections={sections} />
      )}
    </ChatItemAccordion>
  );
});

interface ToolStatusDisplay {
  rightLabel: ReactNode;
  rightLabelClassName: string;
}

function resolveToolStatus(
  item: RuntimeChatItem,
  payloadStatus: ToolCallPayload["status"] | undefined,
  diffSummary: DiffSummary | undefined,
  t: TranslateFn,
): ToolStatusDisplay {
  const isRunning = item.state !== "completed" || payloadStatus === "running";
  if (isRunning) {
    return {
      rightLabel: <PixelLoader size="xxs" className="text-[color:var(--muted)]" />,
      rightLabelClassName: "!text-[color:var(--muted)]",
    };
  }
  if (payloadStatus === "error") {
    return {
      rightLabel: <CircleAlert className="size-3 text-danger" aria-label={t(msg`error`)} />,
      rightLabelClassName: "text-danger",
    };
  }
  if (diffSummary) {
    return {
      rightLabel: formatDiffSummaryLabel(diffSummary),
      rightLabelClassName: "!text-[color:var(--muted)]",
    };
  }
  return { rightLabel: null, rightLabelClassName: "!text-[color:var(--muted)]" };
}
