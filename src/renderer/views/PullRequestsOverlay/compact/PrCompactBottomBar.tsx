import { MessageCircleQuestion } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { LightballTabs, type LightballTab } from "@/renderer/components/common";
import {
  MobilePageBottomAction,
  MobilePageBottomBar,
} from "@/renderer/components/layout/MobilePageBottomActions";
import { MobileCircleButton } from "@/renderer/components/mobileComposer/MobileCircleButton";
import { usePrState, usePrViewerDidAuthor } from "@/renderer/state/gitSelectors";
import { usePrAskChat } from "../detail/prAskChat";
import type { PrTab } from "../detail/prDetailNav";
import { usePrDetailScope } from "../detail/prDetailScope";
import { SubmitReviewPopover } from "../parts/SubmitReviewPopover";
import { PrCompactMergeAction } from "./PrCompactMergeAction";

/**
 * The compact detail's one bottom row, like the workspace page's: Ask on the lower
 * leading side, the tabs between, and the page's primary action on the lower
 * trailing side (Review changes on the Changes tab, Merge on the others).
 * `covered` drops the portaled actions while another page (the chat) covers the detail.
 */
export function PrCompactBottomBar(props: {
  tabs: ReadonlyArray<LightballTab<PrTab>>;
  active: PrTab;
  onChange: (tab: PrTab) => void;
  covered: boolean;
}) {
  const { t } = useLingui();
  const scope = usePrDetailScope();
  const chat = usePrAskChat();
  const state = usePrState(scope.prKey);
  const viewerDidAuthor = usePrViewerDidAuthor(scope.prKey);
  const reviewing = props.active === "changes";
  return (
    <>
      <MobilePageBottomBar className="m-pr-tabbar">
        <LightballTabs
          tabs={props.tabs}
          active={props.active}
          onChange={props.onChange}
          ariaLabel={t`Pull request sections`}
          className="m-floating-selector m-pr-tabs pointer-events-auto w-full"
          equalWidth
          delayActiveText
          shape="pill"
        />
      </MobilePageBottomBar>
      {props.covered ? null : (
        <>
          {chat.available ? (
            <MobilePageBottomAction side="left">
              <MobileCircleButton
                aria-label={t`Ask about this pull request`}
                onPress={() => chat.setOpen(true)}
              >
                <MessageCircleQuestion className="size-4" />
              </MobileCircleButton>
            </MobilePageBottomAction>
          ) : null}
          {reviewing ? (
            <MobilePageBottomAction side="right">
              <SubmitReviewPopover
                projectLocation={scope.location}
                prNumber={scope.prNumber}
                cacheKey={scope.cacheKey}
                prKey={scope.prKey}
                hidden={viewerDidAuthor === true}
                disabled={scope.readOnly}
                onSubmitted={scope.reload}
                triggerLabel={t`Review changes`}
                triggerPresentation="circle"
              />
            </MobilePageBottomAction>
          ) : state === "open" ? (
            <MobilePageBottomAction side="right">
              <PrCompactMergeAction />
            </MobilePageBottomAction>
          ) : null}
        </>
      )}
    </>
  );
}
