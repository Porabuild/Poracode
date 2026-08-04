import { toast } from "@heroui/react";
import { getMobileRuntimePlatform } from "./mobilePlatform";

type ToastUpdateAction = "add" | "remove" | "clear";
type WrapUpdate = (fn: () => void, action: ToastUpdateAction) => void;

type WrapUpdateQueue = {
  wrapUpdate?: WrapUpdate | undefined;
};

/**
 * HeroUI removes toasts with a whole-document View Transition. In iOS Safari
 * browser mode, that snapshot cuts document compositing at the dynamic
 * viewport line, so the transparent browser-toolbar band can turn black and
 * stay black after the toast is gone.
 *
 * Keep the normal entrance transition, but remove/clear toasts directly. This
 * avoids the broken exit snapshot without changing installed/native iOS or
 * other browsers.
 */
export function disableToastExitViewTransitionsInIosBrowser(doc: Document = document): void {
  if (
    getMobileRuntimePlatform() !== "ios" ||
    doc.documentElement.dataset.mobileBrowserChrome !== "true"
  ) {
    return;
  }

  const queue = toast.getQueue() as unknown as WrapUpdateQueue;
  const wrapUpdate = queue.wrapUpdate;
  queue.wrapUpdate = (update, action) => {
    if (action === "remove" || action === "clear") {
      update();
      return;
    }
    if (wrapUpdate) {
      wrapUpdate(update, action);
      return;
    }
    update();
  };
}
