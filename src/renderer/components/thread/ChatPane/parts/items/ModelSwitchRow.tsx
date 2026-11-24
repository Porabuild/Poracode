import { Surface } from "@heroui/react";
import { ArrowRightLeft } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { ModelSwitchItemPayload } from "@/shared/contracts";
import { capabilitiesForPresentation } from "@/shared/agentSelection";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import { useAppStore } from "@/renderer/state/appStore";
import { useHostAgentStatusPools } from "@/renderer/hooks/useHostAgentStatuses";
import { chatMessageSurfaceClass } from "./chatMessageSurface";

/**
 * Divider marking where the model answering the thread changed within the
 * same provider. The session continues across it — only the model differs
 * below the row.
 */
export function ModelSwitchRow({ threadId, item }: { threadId: string; item: RuntimeChatItem }) {
  const { t } = useLingui();
  const thread = useAppStore((state) => state.threads.find((entry) => entry.id === threadId));
  // Models live on the thread provider's status in its host pool (WSL
  // projects: the WSL list), so consult both pools rather than falling back
  // to the raw model id for those threads.
  const pools = useHostAgentStatusPools(thread?.remoteServerId);
  const payload = getRuntimeItemPayload<ModelSwitchItemPayload>(item, "model_switch");
  if (!payload) return null;

  const agentStatus = [...pools.windows, ...pools.wsl].find(
    (status) => status.kind === thread?.agentKind,
  );
  const models = agentStatus
    ? capabilitiesForPresentation(agentStatus.capabilities, "gui").models
    : [];
  const labelFor = (model: string) => models.find((entry) => entry.id === model)?.label ?? model;
  const fromLabel = labelFor(payload.fromModel);
  const toLabel = labelFor(payload.toModel);

  return (
    <Surface variant="transparent" className={chatMessageSurfaceClass}>
      <div className="flex min-w-0 flex-col items-stretch justify-center text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted">
        <span className="inline-flex min-w-0 items-center gap-1.5 self-start leading-none italic opacity-80">
          <ArrowRightLeft className="size-3 shrink-0" />
          {t`Switched model from ${fromLabel} to ${toLabel}`}
        </span>
      </div>
    </Surface>
  );
}
