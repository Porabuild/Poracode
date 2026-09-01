import { Surface } from "@heroui/react";
import { ArrowRightLeft } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { ProviderHandoffItemPayload } from "@/shared/contracts";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useThreadAgentStatuses } from "@/renderer/hooks/uiSelectors";
import { chatMessageSurfaceClass } from "./chatMessageSurface";

/**
 * Divider marking where the thread changed provider in place. Everything above
 * it came from one agent; everything below came from another that started with
 * only a handed-off summary, which is what explains the break in continuity.
 */
export function ProviderHandoffRow({
  threadId,
  item,
}: {
  threadId: string;
  item: RuntimeChatItem;
}) {
  const { t } = useLingui();
  const thread = useAppStore((state) => state.threads.find((entry) => entry.id === threadId));
  const projectLocation = useAppStore(
    (state) => state.projects.find((project) => project.id === thread?.projectId)?.location,
  );
  const threadAgentStatuses = useThreadAgentStatuses({
    remoteServerId: thread?.remoteServerId,
    projectLocation,
  });
  const agentStatuses = useAgentStatusesStore((s) => s.agentStatuses);
  // A WSL project's agents are only in the WSL list, so consult both rather
  // than falling back to the bare kind ("copilot") for those threads.
  const wslAgentStatuses = useAgentStatusesStore((s) => s.wslAgentStatuses);
  const payload = getRuntimeItemPayload<ProviderHandoffItemPayload>(item, "provider_handoff");
  if (!payload) return null;

  const labelStatuses = thread?.remoteServerId
    ? threadAgentStatuses
    : [...agentStatuses, ...wslAgentStatuses];
  const labelFor = (kind: string) =>
    labelStatuses.find((status) => status.kind === kind)?.label ?? kind;
  const fromLabel = labelFor(payload.fromAgentKind);
  const toLabel = labelFor(payload.toAgentKind);

  return (
    <Surface variant="transparent" className={chatMessageSurfaceClass}>
      <div className="flex min-w-0 flex-col items-stretch justify-center text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted">
        <span className="inline-flex min-w-0 items-center gap-1.5 self-start leading-none italic opacity-80">
          <ArrowRightLeft className="size-3 shrink-0" />
          {t`Switched from ${fromLabel} to ${toLabel}`}
        </span>
      </div>
    </Surface>
  );
}
