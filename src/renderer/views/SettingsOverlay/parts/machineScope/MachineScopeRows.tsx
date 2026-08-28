import { useState } from "react";
import { Button, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { readBridge } from "@/renderer/bridge";
import { PixelLoader } from "@/renderer/components/common";
import { useMachineSelectionStore } from "@/renderer/state/machineSelectionStore";
import type { MachineDescriptor } from "@/renderer/state/machines";
import { friendlyError } from "@/shared/messages";

/**
 * Cross-machine awareness while the page is scoped to one machine: names the
 * machines where this agent still needs attention and jumps the scope there.
 */
export function MachineAttentionHint(props: {
  machineIds: readonly string[];
  machines: readonly MachineDescriptor[];
}) {
  const setSelectedMachine = useMachineSelectionStore((state) => state.setSelectedMachine);
  const entries = props.machineIds
    .map((id) => props.machines.find((machine) => machine.id === id))
    .filter((machine): machine is MachineDescriptor => machine !== undefined);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 pt-1.5">
      {entries.map((machine) => (
        <div key={machine.id} className="flex items-center justify-between gap-4 px-2 -mx-2">
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-warning">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span className="truncate">
              <Trans>Needs attention on {machine.label}</Trans>
            </span>
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 min-h-6 shrink-0 px-2 py-0 text-[10px]"
            onPress={() => setSelectedMachine(machine.id)}
          >
            <Trans>Switch</Trans>
          </Button>
        </div>
      ))}
    </div>
  );
}

/**
 * Shown when the selected machine has no detected status for this agent —
 * typically a WSL distro that exists but was never probed because no project
 * lives in it. Offers a machine-scoped detection pass.
 */
export function NoMachineStatusRow(props: {
  machine: MachineDescriptor;
  agentKind: string;
  wslDistros: readonly string[];
}) {
  const { t } = useLingui();
  const [pending, setPending] = useState(false);
  const isRemote = props.machine.ref.host === "remote";

  const detect = () => {
    if (pending || isRemote) return;
    setPending(true);
    readBridge()
      .refreshAgentStatuses([...props.wslDistros], {
        agentKinds: [props.agentKind],
        envs: [props.machine.ref.env],
      })
      .catch((error) => toast.danger(friendlyError(error)))
      .finally(() => setPending(false));
  };

  return (
    <div className="flex items-center justify-between gap-4 py-1.5 px-2 -mx-2">
      <p className="min-w-0 truncate text-xs text-muted">
        {isRemote ? (
          <Trans>No status reported by this machine yet.</Trans>
        ) : (
          <Trans>Not detected on this machine yet.</Trans>
        )}
      </p>
      {isRemote ? null : (
        <Button
          size="sm"
          variant="tertiary"
          className="h-6 min-h-6 shrink-0 px-2 py-0 text-[10px] text-muted hover:text-foreground"
          aria-label={t`Detect agents on this machine`}
          isPending={pending}
          onPress={detect}
        >
          {pending ? <PixelLoader size="xs" /> : <RefreshCw className="size-3" />}
          <Trans>Detect</Trans>
        </Button>
      )}
    </div>
  );
}

/** Read-only notice for a remote machine's page (phase: statuses only). */
export function RemoteMachineNotice(props: { machine: MachineDescriptor }) {
  return (
    <div className="space-y-0.5 pt-1.5">
      {props.machine.status === "offline" ? (
        <p className="text-xs text-muted">
          <Trans>{props.machine.label} is offline. Showing last known status.</Trans>
        </p>
      ) : null}
      <p className="text-xs text-muted/70">
        <Trans>Install, update, and sign-in are not yet available on remote machines.</Trans>
      </p>
    </div>
  );
}
