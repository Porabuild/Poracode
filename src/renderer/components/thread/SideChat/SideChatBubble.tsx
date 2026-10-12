import { Button, toast, Tooltip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { MessagesSquare } from "lucide-react";
import { friendlyError } from "@/shared/messages";
import {
  floatingGlassBubbleClass,
  floatingGlassBubbleActiveClass,
  floatingGlassSurfaceClass,
} from "@/renderer/components/layout/floatingGlass";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSideChatPanelStore } from "./sideChatPanelStore";
import { showSideChat } from "./sideChatActions";

export function SideChatBubble({ threadId }: { threadId: string }) {
  const { t } = useLingui();
  const exists = useSideChatPanelStore((s) => s.entries[threadId] !== undefined);
  const selected = useSideChatPanelStore((s) => s.entry?.source.id === threadId);
  const open = usePanelStore((s) => s.sideChatPanelOpen && s.rightPanelTab === "sideChat");
  if (!exists) return null;
  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={t`Side chat`}
          className={`${floatingGlassSurfaceClass} ${floatingGlassBubbleClass} ${selected && open ? floatingGlassBubbleActiveClass : ""} size-7 min-h-0 min-w-0 rounded-full p-0 text-muted`}
          onPress={() => {
            if (selected && open) usePanelStore.setState({ sideChatPanelOpen: false });
            else
              void showSideChat(threadId).catch((error: unknown) =>
                toast.danger(friendlyError(error)),
              );
          }}
        >
          <MessagesSquare className="size-3.5" />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content placement="top">{t`Side chat`}</Tooltip.Content>
    </Tooltip>
  );
}
