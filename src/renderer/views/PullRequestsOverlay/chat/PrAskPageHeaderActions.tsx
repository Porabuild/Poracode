import { ExternalLink } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { MobilePageHeaderActions } from "@/renderer/components/layout/MobilePageHeaderActions";
import { MobileCircleButton } from "@/renderer/components/mobileComposer/MobileCircleButton";
import type { PrAskChatSession } from "./prAskSession";

/**
 * The compact chat page's header action: the page header already shows Back and
 * the title, so the only thing the chat adds is moving the conversation to a thread.
 */
export function PrAskPageHeaderActions(props: { session: PrAskChatSession }) {
  const { session } = props;
  const { t } = useLingui();
  return (
    <MobilePageHeaderActions>
      <MobileCircleButton
        aria-label={t`Open as thread`}
        isDisabled={!session.threadId || session.starting}
        onPress={session.openAsThread}
      >
        <ExternalLink className="size-4" aria-hidden />
      </MobileCircleButton>
    </MobilePageHeaderActions>
  );
}
