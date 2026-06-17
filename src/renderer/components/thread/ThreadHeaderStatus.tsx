import { Tooltip } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Thread, ThreadStatusSource } from "@/shared/contracts";
import { ProviderIcon, getStatusTone } from "@/renderer/components/providers";
import { useThread } from "@/renderer/state/useThread";
import type { TranslateFn } from "@/renderer/i18n/i18n";

export function threadRuntimeStatusLabel(thread: Thread, t: TranslateFn): string {
  const { status, attention } = thread;
  if (status === "launching") return t(msg`Launching…`);
  if (status === "inactive") return t(msg`Inactive`);
  if (status === "error") return t(msg`Error`);
  if (status === "finished") return t(msg`Finished`);
  if (status === "needs_approval" || attention === "needs_approval") return t(msg`Needs approval`);
  if (status === "needs_reply" || attention === "needs_reply") return t(msg`Needs reply`);
  if (status === "working" || attention === "working") return t(msg`Working`);
  if (status === "idle") return t(msg`Idle`);
  return status;
}

function activeSupportLabel(source: ThreadStatusSource | undefined, t: TranslateFn): string {
  switch (source) {
    case "cli_hook":
      return t(msg`Enhanced (Hooks)`);
    case "terminal_parse":
      return t(msg`Basic (CLI)`);
    case "server":
      return t(msg`ACP`);
    default:
      return t(msg`Basic (CLI)`);
  }
}

function supportSourceDotClass(source: ThreadStatusSource | undefined): string {
  switch (source) {
    case "cli_hook":
      return "bg-[oklch(0.72_0.12_145)]";
    case "terminal_parse":
      return "bg-[oklch(0.72_0.11_75)]";
    case "server":
      return "bg-[oklch(0.68_0.12_265)]";
    default:
      return "bg-muted/70";
  }
}

function ThreadStatusSupportDetail({ source }: { source: ThreadStatusSource | undefined }) {
  switch (source) {
    case "cli_hook":
      return <Trans>Status updates come from the CLI hook plugin.</Trans>;
    case "terminal_parse":
      return (
        <Trans>
          Status is inferred from terminal output (L2). Install the hook plugin in settings for
          structured updates.
        </Trans>
      );
    case "server":
      return <Trans>Status is provided by the agent control protocol (ACP).</Trans>;
    default:
      return <Trans>Support mode appears once the session connects.</Trans>;
  }
}

export function ThreadHeaderStatusTooltipBody(props: { thread: Thread }) {
  const { thread } = props;
  const { t } = useLingui();
  const runtime = threadRuntimeStatusLabel(thread, t);
  const source = thread.threadStatusSource;
  const isServer = source === "server";
  const errorMessage = thread.status === "error" ? thread.errorMessage?.trim() : undefined;

  return (
    <div className="w-[min(22rem,calc(100vw-2rem))] space-y-3 py-3 pl-2 pr-5 [overflow-wrap:break-word] [word-break:normal] hyphens-none">
      <div className="space-y-2.5">
        <p className="text-sm leading-snug">
          <span className="text-muted">
            <Trans>Status:</Trans>{" "}
          </span>
          <span className="font-semibold text-foreground">{runtime}</span>
        </p>
        {!isServer && (
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-relaxed">
            <span className="text-muted">
              <Trans>Support:</Trans>
            </span>
            <span
              className={`relative top-px size-1.5 shrink-0 rounded-full ring-1 ring-[var(--hairline-strong)] ${supportSourceDotClass(source)}`}
              aria-hidden
            />
            <span className="font-semibold text-foreground">{activeSupportLabel(source, t)}</span>
          </p>
        )}
      </div>
      {errorMessage ? (
        <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words border-t border-border/60 pt-2.5 text-xs leading-snug text-danger">
          {errorMessage}
        </p>
      ) : (
        <p className="border-t border-border/60 pt-2.5 text-xs leading-snug text-muted [overflow-wrap:break-word] [word-break:normal] hyphens-none">
          <ThreadStatusSupportDetail source={source} />
        </p>
      )}
    </div>
  );
}

export function ThreadHeaderStatusButton(props: {
  threadId: string;
  fallbackThread: Thread;
  fallbackAgentKind: string;
  agentLabel?: string | undefined;
  agentIcon?: string | undefined;
}) {
  const { t } = useLingui();
  const thread = useThread(props.threadId) ?? props.fallbackThread;
  const agentLabel = props.agentLabel ?? props.fallbackAgentKind;
  const statusLabel = threadRuntimeStatusLabel(thread, t);

  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>
        <button
          type="button"
          className="lightcode-overlay-header__controls inline-flex shrink-0 rounded-sm p-0.5 outline-offset-2 hover:bg-[var(--row-hover)]"
          aria-label={t`${agentLabel}: ${statusLabel}. Hover for status details.`}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <ProviderIcon
            kind={thread.agentKind}
            {...(props.agentIcon ? { icon: props.agentIcon } : {})}
            fallbackLabel={props.agentLabel}
            tone={getStatusTone(thread)}
            className="size-3.5 shrink-0"
          />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content
        placement="bottom start"
        offset={8}
        showArrow
        className="max-w-[min(22rem,calc(100vw-2rem))] text-left [overflow-wrap:break-word] [word-break:normal] hyphens-none"
      >
        <ThreadHeaderStatusTooltipBody thread={thread} />
      </Tooltip.Content>
    </Tooltip>
  );
}
