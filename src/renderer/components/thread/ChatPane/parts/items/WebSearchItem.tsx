import { memo, useMemo, useState } from "react";
import { Globe } from "lucide-react";
import type { WebSearchPayload } from "@/shared/contracts";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import { ChatItemAccordion } from "./ChatItemAccordion";
import { ToolCallSections, type ToolCallSection } from "./ToolCallSections";
import { extractAcpArgsPart, extractAcpResultPart } from "./acpToolPayload";

interface WebSearchItemProps {
  item: RuntimeChatItem;
}

export const WebSearchItem = memo(function WebSearchItem({ item }: WebSearchItemProps) {
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
  const title = payload.query || formatWebSearchName(readPayloadString(payload, "name"));
  const hasDetails = hasAuxFields(payload);
  const resultCount = payload.resultCount ?? deriveResultCount(payload);
  const right =
    resultCount != null ? `${resultCount} result${resultCount === 1 ? "" : "s"}` : undefined;

  return (
    <ChatItemAccordion
      icon={<Globe className="size-3" />}
      title={title}
      rightLabel={right}
      hasBody={hasDetails}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <ToolCallSections sections={sections} />
    </ChatItemAccordion>
  );
});

function hasAuxFields(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return p.args !== undefined || p.result !== undefined;
}

function readPayloadString(payload: unknown, key: string): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function formatWebSearchName(name: string | undefined): string {
  return name === "WebSearch" || !name ? "Web search" : name;
}

/**
 * When a structured `resultCount` isn't present (codex doesn't surface it,
 * older ACP servers may not), derive it from the tool's `result.contents`
 * array — both ACP and codex put per-result blocks there.
 */
function deriveResultCount(payload: unknown): number | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const result = (payload as Record<string, unknown>).result;
  if (!result || typeof result !== "object") return undefined;
  const contents = (result as Record<string, unknown>).contents;
  if (Array.isArray(contents)) return contents.length;
  return undefined;
}
