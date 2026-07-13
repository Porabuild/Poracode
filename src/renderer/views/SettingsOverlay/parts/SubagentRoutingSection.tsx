import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { TextArea } from "@/renderer/components/common";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

/**
 * Free-text routing guidance for cross-provider subagents. The text is appended
 * to the subagents MCP server `instructions` so an agent that spawns subagents
 * knows which connected agent/model to prefer for a given kind of task. Stored
 * globally on `sharedSettings.subagentRoutingGuide`; committed on blur (matching
 * the other free-text settings) to avoid a disk write per keystroke.
 */
export function SubagentRoutingSection() {
  const { t } = useLingui();
  const subagentRoutingGuide = useSharedSettings((s) => s.subagentRoutingGuide);
  const setSubagentRoutingGuide = useSharedSettings((s) => s.setSubagentRoutingGuide);
  const [draft, setDraft] = useState(subagentRoutingGuide);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">
        <Trans>Subagent routing guide</Trans>
      </p>
      <p className="text-xs text-muted">
        <Trans>Instructions agents follow when choosing which agent or model to delegate to.</Trans>
      </p>
      <TextArea
        aria-label={t`Subagent routing guide`}
        className="w-full text-xs"
        rows={4}
        placeholder={t`e.g. Codex GPT-5.5 fast for quick lookups, OpenCode GLM for bulk refactors, Claude Opus for anything subtle.`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => setSubagentRoutingGuide(draft.trim())}
      />
    </div>
  );
}
