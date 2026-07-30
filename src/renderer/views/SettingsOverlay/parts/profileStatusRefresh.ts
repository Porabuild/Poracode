import { toast } from "@heroui/react";
import type { MessageDescriptor } from "@lingui/core";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import { currentWslDistros } from "@/renderer/utils/acpRegistryAuth";

export function refreshProfileStatuses(
  kind: string | undefined,
  fallbackError: MessageDescriptor,
): void {
  window.setTimeout(() => {
    void readBridge()
      .refreshAgentStatuses(currentWslDistros(), kind ? { agentKinds: [kind] } : undefined)
      .catch((error) =>
        toast.danger(error instanceof Error ? error.message : i18n._(fallbackError)),
      );
  }, 50);
}
