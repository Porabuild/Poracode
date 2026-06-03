import type { Thread } from "@/shared/contracts";
import {
  isDetectingAgentsForLocation,
  useAgentStatusesStore,
} from "@/renderer/state/agentStatusesStore";
import { useProject } from "@/renderer/state/useThread";
import { useProjectAgentStatuses } from "@/renderer/hooks/uiSelectors";
import { ProviderIcon } from "./ProviderIcon";
import { getStatusTone, type StatusTone } from "./statusTone";

/**
 * Renders a thread's agent icon, resolving ACP-registry icons the same way on
 * every surface. Built-in providers (Claude, Codex, …) ship a `kind`-keyed icon
 * in {@link ProviderIcon}'s registry, but ACP-registry agents (e.g. GLM) carry
 * their icon as a URL on the resolved `AgentStatus`. Passing only `kind` to
 * `ProviderIcon` makes those agents fall back to the generic letter badge — the
 * bug seen in the collapsed sidebar, archived list and search results.
 *
 * This component is the single source of truth for thread icons: it looks the
 * agent up in the agent-statuses store, scoped to the thread's project
 * environment (native vs WSL), and forwards the resolved `icon`/`label`. While
 * detection is still in flight it forwards `pending` so list rows reserve the
 * slot instead of flashing the fallback. Reuse it instead of calling
 * `ProviderIcon` with a bare `kind` from a thread.
 */
export function ThreadProviderIcon(props: {
  thread: Thread;
  tone?: StatusTone | undefined;
  className?: string | undefined;
}) {
  const { thread } = props;
  const location = useProject(thread.projectId)?.location;
  const agents = useProjectAgentStatuses(location);
  const agent = agents.find((a) => a.kind === thread.agentKind);
  const pending = useAgentStatusesStore((s) =>
    location ? isDetectingAgentsForLocation(s, location) : false,
  );
  return (
    <ProviderIcon
      kind={thread.agentKind}
      tone={props.tone ?? getStatusTone(thread)}
      pending={pending}
      fallbackLabel={agent?.label}
      {...(agent?.icon ? { icon: agent.icon } : {})}
      {...(props.className ? { className: props.className } : {})}
    />
  );
}
