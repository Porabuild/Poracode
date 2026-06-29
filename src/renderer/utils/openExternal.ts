import { toast } from "@heroui/react";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";

export function openExternalWithFeedback(url: string): void {
  void readBridge()
    .openExternal(url)
    .catch((error: unknown) => {
      toast.danger(friendlyError(error));
    });
}
