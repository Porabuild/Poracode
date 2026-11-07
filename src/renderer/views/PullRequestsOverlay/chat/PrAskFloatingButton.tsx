import { Button, Tooltip } from "@heroui/react";
import { MessageCircleQuestion } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { PrAskChat } from "../detail/prAskChat";

/**
 * The desktop entry to the review chat: a small round button in the corner of
 * its (relatively positioned) parent, so the chat never covers the review until asked for.
 */
export function PrAskFloatingButton(props: { chat: PrAskChat }) {
  const { chat } = props;
  const { t } = useLingui();
  if (!chat.available || chat.open) return null;
  const label = t`Ask about this pull request`;
  return (
    <div className="absolute bottom-4 right-4 z-10">
      <Tooltip>
        <Tooltip.Trigger>
          <Button
            isIconOnly
            size="sm"
            variant="secondary"
            aria-label={label}
            className="size-9 min-h-0 min-w-0 rounded-full border border-[color:var(--border)] text-muted shadow-md hover:text-foreground"
            onPress={() => chat.setOpen(true)}
          >
            <MessageCircleQuestion className="size-4" aria-hidden />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>{label}</Tooltip.Content>
      </Tooltip>
    </div>
  );
}
