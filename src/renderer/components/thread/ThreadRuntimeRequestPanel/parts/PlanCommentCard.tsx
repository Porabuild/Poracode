import { Button, Surface, TextArea } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Pencil, X } from "lucide-react";
import { chatPromptSurfaceClass } from "../../ChatPane/parts/items/chatMessageSurface";

/**
 * A posted plan comment. Shares the chat user-message surface (tertiary fill,
 * soft hairline, rounded) because it is the user's own words; actions appear on
 * hover or keyboard focus like the user-message action strip.
 */
export function PlanComment(props: {
  id: string;
  label: string;
  text: string;
  isDisabled: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { t } = useLingui();
  return (
    <Surface
      id={props.id}
      variant="tertiary"
      className={`${chatPromptSurfaceClass} group/comment scroll-mt-4`}
    >
      <div className="text-[11px] font-medium text-muted">{props.label}</div>
      <div className="mt-0.5 pr-12 text-[13px] leading-snug whitespace-pre-wrap [overflow-wrap:anywhere]">
        {props.text}
      </div>
      <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-full bg-surface-tertiary opacity-0 transition-opacity group-hover/comment:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
        <Button
          size="sm"
          variant="ghost"
          isIconOnly
          className="size-6 min-w-0"
          aria-label={t`Edit comment`}
          isDisabled={props.isDisabled}
          onPress={props.onEdit}
        >
          <Pencil className="size-3" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          isIconOnly
          className="size-6 min-w-0"
          aria-label={t`Remove comment`}
          isDisabled={props.isDisabled}
          onPress={props.onRemove}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </Surface>
  );
}

/**
 * Comment form floating under the selected lines. Uses the menu surface
 * (overlay fill, rounded, overlay shadow, soft hairline) so it reads as a popup
 * over the plan. Escape cancels the form without closing the review dialog.
 */
export function PlanCommentForm(props: {
  label: string;
  value: string;
  isEditing: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const { t } = useLingui();
  const canSubmit = props.value.trim().length > 0;
  return (
    <div
      // Bring the whole form into view when it opens near the bottom of the plan.
      ref={(element) => element?.scrollIntoView({ block: "nearest" })}
      role="group"
      aria-label={props.label}
      className="flex w-[min(26rem,calc(100vw-5rem))] flex-col gap-2 rounded-3xl border border-[var(--hairline)] bg-overlay p-2 shadow-overlay"
    >
      <div className="px-1 text-[11px] font-medium text-muted">{props.label}</div>
      <TextArea
        // Focus once when the form opens (the callback is stable across renders).
        ref={(element) => element?.focus({ preventScroll: true })}
        data-plan-comment-input
        aria-label={t`Comment on the selected lines`}
        className="min-h-20 w-full resize-y text-[13px]"
        placeholder={t`Leave a comment`}
        rows={3}
        value={props.value}
        variant="secondary"
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            // Cancel just this form; the review dialog stays open.
            event.preventDefault();
            event.stopPropagation();
            props.onCancel();
            return;
          }
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            if (canSubmit) props.onSubmit();
          }
        }}
      />
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="ghost" className="text-muted" onPress={props.onCancel}>
          {t`Cancel`}
        </Button>
        <Button size="sm" variant="tertiary" isDisabled={!canSubmit} onPress={props.onSubmit}>
          {props.isEditing ? t`Save` : t`Comment`}
        </Button>
      </div>
    </div>
  );
}
