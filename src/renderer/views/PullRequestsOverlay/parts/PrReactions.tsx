import { useState } from "react";
import { SmilePlus } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import {
  ResponsiveMenuSurface,
  useResponsiveMenu,
} from "@/renderer/components/common/ResponsiveMenuSurface";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { PrReaction } from "@/shared/contracts";

/** Wire names (`PR_REACTION_CONTENTS`) and how they are drawn; unknown names are skipped. */
const REACTION_EMOJI: Readonly<Record<string, { emoji: string; label: MessageDescriptor }>> = {
  "+1": { emoji: "👍", label: msg`Thumbs up` },
  "-1": { emoji: "👎", label: msg`Thumbs down` },
  laugh: { emoji: "😄", label: msg`Laugh` },
  hooray: { emoji: "🎉", label: msg`Hooray` },
  confused: { emoji: "😕", label: msg`Confused` },
  heart: { emoji: "❤️", label: msg`Heart` },
  rocket: { emoji: "🚀", label: msg`Rocket` },
  eyes: { emoji: "👀", label: msg`Eyes` },
};

/** What a reactions control needs; produced by `useSubjectReactions`. */
export interface PrReactionsView {
  reactions: readonly PrReaction[] | undefined;
  supported: readonly string[] | undefined;
  disabled: boolean;
  pending: ReadonlySet<string>;
  onToggle: (content: string, reacted: boolean) => void;
}

/**
 * The reactions that exist, as chips under the subject; nothing at all when there are
 * none (the add button lives in the subject's header, `PrReactionAdd`). A content with a
 * toggle in flight is disabled until it settles.
 */
export function PrReactionChips(props: PrReactionsView) {
  const { reactions, supported, disabled, pending, onToggle } = props;
  const { t } = useLingui();
  const compact = useCompactLayout();
  if (!supported || supported.length === 0) return null;
  const chips = (reactions ?? []).filter(
    (reaction) => reaction.count > 0 && REACTION_EMOJI[reaction.content],
  );
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((reaction) => {
        const meta = REACTION_EMOJI[reaction.content]!;
        const name = t(meta.label);
        const label = t`${name}: ${reaction.count}`;
        return (
          <button
            key={reaction.content}
            type="button"
            aria-label={label}
            aria-pressed={reaction.viewerReacted}
            disabled={disabled || pending.has(reaction.content)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 text-[11px] leading-none disabled:opacity-50 ${
              compact ? "h-8" : "h-6"
            } ${
              reaction.viewerReacted
                ? "border-accent/50 bg-accent/10 text-foreground"
                : "border-[var(--hairline)] bg-default-100/60 text-muted"
            }`}
            onClick={() => onToggle(reaction.content, !reaction.viewerReacted)}
          >
            <span aria-hidden>{meta.emoji}</span>
            <span className="tabular-nums">{reaction.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The "add reaction" button for a subject's header: a small neutral icon that opens a
 * grid of the reactions the host offers (a popover on desktop, the bottom sheet on
 * compact layouts).
 */
export function PrReactionAdd(props: PrReactionsView & { className?: string }) {
  const { reactions, supported, disabled, pending, onToggle } = props;
  const { t } = useLingui();
  const compact = useCompactLayout();
  const { mobile } = useResponsiveMenu();
  const [open, setOpen] = useState(false);
  if (!supported || supported.length === 0) return null;
  const addable = supported.filter((content) => REACTION_EMOJI[content]);
  if (addable.length === 0) return null;
  const label = t`Add reaction`;

  return (
    <ResponsiveMenuSurface
      isOpen={open}
      onOpenChange={setOpen}
      label={label}
      placement="bottom end"
      contentClassName="w-auto max-w-[calc(100vw-2rem)]"
      dialogClassName="p-1.5"
      triggerClassName={props.className ?? "flex shrink-0 items-center"}
      trigger={
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          className={`flex items-center justify-center rounded-full text-muted hover:text-foreground disabled:opacity-50 ${
            compact ? "size-8" : "size-6"
          }`}
          onClick={() => {
            if (mobile) setOpen(true);
          }}
        >
          <SmilePlus className="size-4" />
        </button>
      }
    >
      {/* A grid, not one row: eight emoji must never be wider than a phone screen. */}
      <div
        className={`grid grid-cols-4 gap-1 ${mobile ? "p-3" : ""}`}
        data-testid="reaction-picker-grid"
      >
        {addable.map((content) => {
          const meta = REACTION_EMOJI[content]!;
          const active = reactions?.some((r) => r.content === content && r.viewerReacted);
          return (
            <button
              key={content}
              type="button"
              aria-label={t(meta.label)}
              aria-pressed={active === true}
              disabled={pending.has(content)}
              className={`flex items-center justify-center rounded-lg text-base disabled:opacity-50 hover:bg-default-100 ${
                mobile ? "size-12" : "size-7"
              } ${active ? "bg-accent/10" : ""}`}
              onClick={() => {
                setOpen(false);
                onToggle(content, active !== true);
              }}
            >
              <span aria-hidden>{meta.emoji}</span>
            </button>
          );
        })}
      </div>
    </ResponsiveMenuSurface>
  );
}
