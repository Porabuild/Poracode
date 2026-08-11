import { memo, useMemo, useState } from "react";
import { Plural, useLingui } from "@lingui/react/macro";
import { Globe } from "lucide-react";
import type { WebSearchPayload } from "@/shared/contracts";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import { ChatItemAccordion } from "./ChatItemAccordion";
import { ToolCallSections, type ToolCallSection } from "./ToolCallSections";
import { extractAcpArgsPart, extractAcpResultPart } from "./acpToolPayload";
import { deriveWebSearchDisplay } from "./webSearchDisplay";

interface WebSearchItemProps {
  item: RuntimeChatItem;
}

export const WebSearchItem = memo(function WebSearchItem({ item }: WebSearchItemProps) {
  const { t } = useLingui();
  const payload = getRuntimeItemPayload<WebSearchPayload>(item, "web_search");
  const [isExpanded, setIsExpanded] = useState(false);
  const sections = useMemo<ToolCallSection[]>(() => {
    if (!isExpanded || !payload) return [];
    return [
      { label: "query", part: extractAcpArgsPart(payload) },
      { label: "results", part: extractAcpResultPart(payload) },
    ];
  }, [isExpanded, payload]);
  if (!payload) return null;
  const display = deriveWebSearchDisplay(payload, t);
  // Keep the `resultCount` binding: it is the Lingui placeholder name baked
  // into the `{resultCount, plural, …}` msgid across all catalogs.
  const resultCount = display.resultCount;
  const right =
    resultCount != null ? (
      <Plural value={resultCount} one="# result" other="# results" />
    ) : undefined;

  return (
    <ChatItemAccordion
      icon={<Globe className="size-3" />}
      title={display.title}
      {...(display.parts ? { titleParts: display.parts } : {})}
      isRunning={item.state !== "completed"}
      rightLabel={right}
      hasBody={display.hasDetails}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <ToolCallSections sections={sections} />
    </ChatItemAccordion>
  );
});
