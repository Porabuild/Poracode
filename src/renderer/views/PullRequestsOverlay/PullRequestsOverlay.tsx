import { GitPullRequest } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { PageLayout } from "@/renderer/components/layout/PageLayout";
import { resolvePrKey } from "@/renderer/state/gitSelectors";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { PrAskChatPanel } from "./chat/PrAskChatPanel";
import { PrAskFloatingButton } from "./chat/PrAskFloatingButton";
import { PrAskPageHeaderActions } from "./chat/PrAskPageHeaderActions";
import { PrCompactHeader } from "./compact/PrCompactHeader";
import { PrAskSessionContext } from "./chat/prAskSession";
import { usePrAskChatSession } from "./chat/usePrAskChatSession";
import { PrAskChatContext } from "./detail/prAskChat";
import { PrDetailContent } from "./detail/PrDetailContent";
import { PrDetailHeader } from "./detail/PrDetailHeader";
import { PrDetailNavProvider } from "./detail/prDetailNav";
import { PrDetailScopeProvider } from "./detail/prDetailScope";
import { usePrDetailModel, type PrSelection } from "./detail/usePrDetailModel";
import { PrListPanel } from "./list/PrListPanel";
import { PrListHeaderControls } from "./list/PrListHeaderControls";
import { openPullRequestEntry } from "./list/openPullRequestEntry";
import { pullRequestKey } from "./list/prListModel";
import { usePrListController } from "./list/usePrListController";
import { PrOverlaySidebar } from "./PrOverlaySidebar";

/**
 * Full-window pull-request surface: the review list on the left, the selected
 * review on the right. Selection lives in `prReviewContext`, so the branch
 * review's "Review PR" and the list both open the same detail.
 */
export function PullRequestsOverlay(props: { onClose: () => void }) {
  const { onClose } = props;
  const { t } = useLingui();
  const compact = useCompactLayout();
  const listController = usePrListController();
  const context = usePanelStore((state) => state.prReviewContext);
  const project = useAppStore((state) =>
    context ? state.projects.find((candidate) => candidate.id === context.projectId) : undefined,
  );
  const rowSource = useGitStore((state) =>
    context
      ? state.prData[context.prKey ?? resolvePrKey(context.projectId, context.worktreePath)]?.source
      : undefined,
  );
  const selection: PrSelection | null =
    context && project
      ? {
          project,
          prNumber: context.prNumber,
          prKey: context.prKey ?? resolvePrKey(context.projectId, context.worktreePath),
          worktreePath: context.worktreePath,
          skipLocalSync: context.skipLocalSync,
        }
      : null;
  const scope = usePrDetailModel(selection, () =>
    usePanelStore.getState().closePullRequestsOverlay(),
  );
  const selectedKey =
    context && selection ? pullRequestKey(rowSource, context.projectId, context.prNumber) : null;
  const chat = usePrAskChatSession(scope);
  const chatPanel = scope ? (
    <PrAskChatPanel
      prNumber={scope.prNumber}
      session={chat}
      {...(compact ? { variant: "page" as const } : {})}
    />
  ) : null;
  const chatOpen = scope !== null && chat.open;
  const prNumber = scope?.prNumber;

  // Compact layouts have no room beside the detail, so the chat takes the page. The
  // detail stays mounted underneath (hidden and inert) so its guide, scroll
  // positions and ask draft are still there when the chat is closed.
  const chatCoversDetail = compact && chatOpen;
  const content = scope ? (
    <>
      <div
        className="relative h-full min-h-0"
        hidden={chatCoversDetail}
        aria-hidden={chatCoversDetail || undefined}
        inert={chatCoversDetail}
      >
        <PrDetailContent key={scope.cacheKey} />
        {compact ? null : <PrAskFloatingButton chat={chat} />}
      </div>
      {chatCoversDetail ? (
        <>
          <PrAskPageHeaderActions session={chat} />
          {chatPanel}
        </>
      ) : null}
    </>
  ) : compact ? (
    <PrListPanel
      controller={listController}
      selectedKey={null}
      onOpen={openPullRequestEntry}
      hideTitle
    />
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted">
      <GitPullRequest className="size-8" aria-hidden />
      <p className="text-sm font-medium text-foreground">
        <Trans>Select a pull request</Trans>
      </p>
      <p className="max-w-64 text-xs">
        <Trans>Pick one from the list to read it, review its changes, or merge it.</Trans>
      </p>
    </div>
  );

  return (
    <PrDetailScopeProvider value={scope}>
      <PrDetailNavProvider resetKey={scope?.cacheKey ?? ""}>
        <PrAskChatContext.Provider value={chat}>
          <PrAskSessionContext.Provider value={chat}>
            <PageLayout
              title={t`Pull requests`}
              compactTitle={
                prNumber === undefined
                  ? t`Pull requests`
                  : chatCoversDetail
                    ? t`Ask about PR #${prNumber}`
                    : `#${prNumber}`
              }
              compactBackLabel={scope ? t`Back` : t`Return to app`}
              onCompactBack={
                // From the chat page, back is the review; from a review, the list; from the list, out.
                chatCoversDetail
                  ? () => chat.setOpen(false)
                  : scope
                    ? () => usePanelStore.getState().setPrReviewContext(null)
                    : onClose
              }
              mobileNavigation
              sidebarHeaderChildren={
                compact ? null : <PrListHeaderControls controller={listController} />
              }
              {...(scope && !chatCoversDetail
                ? { compactHeaderChildren: <PrCompactHeader key={scope.cacheKey} /> }
                : {})}
              contentHeaderChildren={scope ? <PrDetailHeader key={scope.cacheKey} /> : null}
              sidebar={
                compact ? null : (
                  <PrOverlaySidebar
                    controller={listController}
                    selectedKey={selectedKey}
                    onClose={onClose}
                  />
                )
              }
              content={content}
              {...(!compact && chatOpen
                ? {
                    rightPanel: chatPanel,
                    rightPanelOpen: true,
                    rightPanelPlacement: "right" as const,
                    rightPanelResizeLabel: t`Resize pull request chat`,
                    onDismissRightOverlay: () => chat.setOpen(false),
                  }
                : {})}
            />
          </PrAskSessionContext.Provider>
        </PrAskChatContext.Provider>
      </PrDetailNavProvider>
    </PrDetailScopeProvider>
  );
}
