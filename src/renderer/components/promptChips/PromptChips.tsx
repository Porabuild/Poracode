import type { ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { MessageSquareText, MessagesSquare, Plug, Sparkles, Target } from "lucide-react";
import { PluginIcon } from "@/renderer/components/plugins/PluginIcon";
import { diffCommentTarget, threadMentionLabel } from "@/shared/promptContent";
import { InlineFilePathChip } from "@/renderer/components/thread/ChatPane/parts/items/InlineFilePathChip";
import type { PromptChipSpec, PromptInlinePiece } from "./promptInlinePieces";

interface PromptChipVisual {
  icon: ReactNode;
  label: string;
  title?: string;
  skillName?: string;
  mcpName?: string;
  pluginId?: string;
}

/** The glyph, label and data hooks one chip kind shows, wherever it renders. */
export function promptChipVisual(
  chip: Exclude<PromptChipSpec, { kind: "file" }>,
): PromptChipVisual {
  switch (chip.kind) {
    case "command":
      return {
        icon: chip.skillName ? (
          <Sparkles aria-hidden="true" />
        ) : chip.command === "goal" ? (
          <Target aria-hidden="true" />
        ) : (
          "/"
        ),
        label: chip.command,
        ...(chip.skillName ? { skillName: chip.skillName } : {}),
      };
    case "skill": {
      // Only an @-mention of the whole plugin carries `pluginName`; a skill
      // picked from a plugin keeps the skill glyph and its own name.
      const mentionedPluginId = chip.pluginName ? chip.pluginId : undefined;
      return {
        icon: mentionedPluginId ? (
          <PluginIcon pluginId={mentionedPluginId} />
        ) : (
          <Sparkles aria-hidden="true" />
        ),
        label: chip.pluginName ?? chip.name,
        skillName: chip.name,
        ...(mentionedPluginId ? { pluginId: mentionedPluginId } : {}),
      };
    }
    case "diff_comment":
      return {
        icon: <MessageSquareText aria-hidden="true" />,
        label: diffCommentTarget(chip.block, true),
        title: `${diffCommentTarget(chip.block)}\n${chip.block.body}`,
      };
    case "mcp":
      return { icon: <Plug aria-hidden="true" />, label: chip.name, mcpName: chip.name };
    case "thread":
      return {
        icon: <MessagesSquare aria-hidden="true" />,
        label: threadMentionLabel({ threadId: chip.threadId, title: chip.title }),
      };
  }
}

export function PromptSlashChip({
  icon,
  label,
  skillName,
  title,
  mcpName,
  pluginId,
}: PromptChipVisual) {
  const { t } = useLingui();
  const skill = label;
  const resolvedAriaLabel = pluginId ? label : skillName ? t`Skill: ${skill}` : undefined;
  return (
    <span
      className="poracode-slash-chip mr-1.5"
      title={title ?? label}
      {...(resolvedAriaLabel ? { "aria-label": resolvedAriaLabel } : {})}
      {...(skillName ? { "data-skill-name": skillName } : {})}
      {...(mcpName ? { "data-mcp-name": mcpName } : {})}
      {...(pluginId ? { "data-plugin-id": pluginId } : {})}
    >
      <span className="poracode-slash-chip__slash">{icon}</span>
      <span className="poracode-slash-chip__name">{label}</span>
    </span>
  );
}

/** A chip with no interaction, for places that sit inside a button. */
function StaticPromptChip({ chip }: { chip: PromptChipSpec }) {
  if (chip.kind === "file") return <InlineFilePathChip path={chip.path} isStatic />;
  return <PromptSlashChip {...promptChipVisual(chip)} />;
}

/** Text and non-interactive chips on one line, for compact surfaces. */
export function InlinePromptPieces({ pieces }: { pieces: readonly PromptInlinePiece[] }) {
  return pieces.map((piece) =>
    piece.kind === "text" ? (
      <span key={piece.key}>{piece.text}</span>
    ) : (
      <StaticPromptChip key={piece.key} chip={piece.chip} />
    ),
  );
}
