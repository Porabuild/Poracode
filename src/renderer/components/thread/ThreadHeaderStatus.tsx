import { Tooltip } from "@heroui/react";
import type { Thread, ThreadStatusSource } from "@/shared/contracts";
import { ProviderIcon, getStatusTone } from "@/renderer/components/providers";
import { useThread } from "@/renderer/state/useThread";

export function threadRuntimeStatusLabel(thread: Thread): string {
  const { status, attention } = thread;
  if (status === "launching") return "Launching…";
  if (status === "inactive") return "Inactive";
  if (status === "error") return "Error";
  if (status === "finished") return "Finished";
  if (status === "needs_approval" || attention === "needs_approval") return "Needs approval";
  if (status === "needs_reply" || attention === "needs_reply") return "Needs reply";
  if (status === "working" || attention === "working") return "Working";
  if (status === "idle") return "Idle";
  return status;
}

function activeSupportLabel(source: ThreadStatusSource | undefined): string {
  switch (source) {
    case "cli_hook":
      return "Enhanced (Hooks)";
    case "terminal_parse":
      return "Basic (CLI)";
    case "server":
      return "ACP";
    default:
      return "Basic (CLI)";
  }
}

function threadStatusSupportDetail(source: ThreadStatusSource | undefined): string {
  switch (source) {
    case "cli_hook":
      return "Status updates come from the CLI hook plugin.";
    case "terminal_parse":
      return "Status is inferred from terminal output (L2). Install the hook plugin in settings for structured updates.";
    case "server":
      return "Status is provided by the agent control protocol (ACP).";
    default:
      return "Support mode appears once the session connects.";
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

export function ThreadHeaderStatusTooltipBody(props: { thread: Thread }) {
  const { thread } = props;
  const runtime = threadRuntimeStatusLabel(thread);
  const source = thread.threadStatusSource;
  const isServer = source === "server";
  const errorMessage = thread.status === "error" ? thread.errorMessage?.trim() : undefined;

  return (
    <div className="w-[min(22rem,calc(100vw-2rem))] space-y-3 py-3 pl-2 pr-5 [overflow-wrap:break-word] [word-break:normal] hyphens-none">
      <div className="space-y-2.5">
        <p className="text-sm leading-snug">
          <span className="text-muted">Status: </span>
          <span className="font-semibold text-foreground">{runtime}</span>
        </p>
        {!isServer && (
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-relaxed">
            <span className="text-muted">Support:</span>
            <span
              className={`relative top-px size-1.5 shrink-0 rounded-full ring-1 ring-white/10 ${supportSourceDotClass(source)}`}
              aria-hidden
            />
            <span className="font-semibold text-foreground">{activeSupportLabel(source)}</span>
          </p>
        )}
      </div>
      {errorMessage ? (
        <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words border-t border-border/60 pt-2.5 text-xs leading-snug text-danger">
          {errorMessage}
        </p>
      ) : (
        <p className="border-t border-border/60 pt-2.5 text-xs leading-snug text-muted [overflow-wrap:break-word] [word-break:normal] hyphens-none">
          {threadStatusSupportDetail(source)}
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
  const thread = useThread(props.threadId) ?? props.fallbackThread;

  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>
        <button
          type="button"
          className="lightcode-overlay-header__controls inline-flex shrink-0 rounded-sm p-0.5 outline-offset-2 hover:bg-white/[0.06]"
          aria-label={`${props.agentLabel ?? props.fallbackAgentKind}: ${threadRuntimeStatusLabel(thread)}. Hover for status details.`}
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
