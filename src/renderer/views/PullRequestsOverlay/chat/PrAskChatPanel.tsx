import { Button, Tooltip } from "@heroui/react";
import { ExternalLink, MessageCircleQuestion, X } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  AgentPanelTitleRow,
  agentPanelTitleTextClass,
} from "@/renderer/components/layout/AgentPanelTitleRow";
import { panelHeaderIconButtonClass } from "@/renderer/components/layout/sidebarChrome";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { CompactDndProvider } from "@/renderer/dnd";
import { ThreadPane } from "@/renderer/views/MainView/parts/AppContent/parts/ThreadPane";
import { PrAskChatComposer } from "./PrAskChatComposer";
import type { PrAskChatSession } from "./prAskSession";

const headerButtonClass = `poracode-overlay-header__controls ${panelHeaderIconButtonClass} h-auto w-auto min-h-0 min-w-0`;

function PrAskChatHeader(props: { prNumber: number; session: PrAskChatSession }) {
  const { prNumber, session } = props;
  const { t } = useLingui();
  const openLabel = t`Open as thread`;
  const closeLabel = t`Close chat`;
  return (
    <AgentPanelTitleRow
      title={
        <h2 className={agentPanelTitleTextClass}>
          <Trans>Ask about PR #{prNumber}</Trans>
        </h2>
      }
      actions={
        <>
          <Tooltip>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                className={headerButtonClass}
                aria-label={openLabel}
                isDisabled={!session.threadId || session.starting}
                onPress={session.openAsThread}
              >
                <ExternalLink className="size-3.5" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>{openLabel}</Tooltip.Content>
          </Tooltip>
          <Tooltip>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                className={headerButtonClass}
                aria-label={closeLabel}
                onPress={() => session.setOpen(false)}
              >
                <X className="size-3.5" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>{closeLabel}</Tooltip.Content>
          </Tooltip>
        </>
      }
    />
  );
}

/**
 * The chat of a review. Before its thread runs: an intro (or the failed launch with
 * its Retry) above the app's ordinary composer. Afterwards the review's chat thread
 * rendered by the chat-only thread pane, with its own transcript and composer.
 *
 * `variant="page"` is the compact full page whose shell header already carries Back,
 * the title and the actions (`PrAskPageHeaderActions`), so it adds no header of its own.
 */
export function PrAskChatPanel(props: {
  prNumber: number;
  session: PrAskChatSession;
  variant?: "panel" | "page";
}) {
  const { prNumber, session, variant = "panel" } = props;
  const { threadId, starting, error } = session;
  const showThread = threadId !== undefined && !error;
  return (
    <div
      className="flex h-full min-h-0 flex-col bg-[var(--content-background)] text-foreground"
      data-pr-ask-chat
    >
      {variant === "panel" ? <PrAskChatHeader prNumber={prNumber} session={session} /> : null}
      {showThread ? (
        <CompactDndProvider>
          <ThreadPane
            threadId={threadId}
            paneCount={1}
            paneAlign="center"
            chatOnly
            onClose={() => {}}
          />
        </CompactDndProvider>
      ) : (
        <>
          {error ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <p role="alert" className="text-sm text-danger">
                {error.message}
              </p>
              <Button size="sm" variant="secondary" isDisabled={starting} onPress={session.retry}>
                <Trans>Retry</Trans>
              </Button>
            </div>
          ) : starting ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <PixelLoader size="sm" />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-muted">
              <MessageCircleQuestion className="size-6" aria-hidden />
              <p className="text-sm font-medium text-foreground">
                <Trans>Ask about this pull request</Trans>
              </p>
              <p className="max-w-64 text-xs">
                <Trans>
                  An agent can read the description and changes and answer your questions.
                </Trans>
              </p>
            </div>
          )}
          <PrAskChatComposer session={session} focusOnMount={variant === "panel"} />
        </>
      )}
    </div>
  );
}
