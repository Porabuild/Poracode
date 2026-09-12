import { useState } from "react";
import { Button, Modal } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { Bell } from "lucide-react";
import { requestBrowserNotificationPermission } from "@/renderer/browserNotificationPermission";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { supportsWebPushRegistration } from "./webPushRegistration";

function shouldPromptForPermission(notificationsEnabled: boolean): boolean {
  return (
    notificationsEnabled && supportsWebPushRegistration() && Notification.permission === "default"
  );
}

/**
 * iOS only permits the native notification permission sheet from a user
 * gesture. Open this disclosure on each installed-PWA launch while permission
 * remains undecided; its Allow button supplies the required gesture.
 */
export function WebPushPermissionPrompt() {
  const notificationsEnabled = useSharedSettings((state) => state.notificationsEnabled);
  const [open, setOpen] = useState(() => shouldPromptForPermission(notificationsEnabled));
  const [requesting, setRequesting] = useState(false);

  async function allowNotifications() {
    setRequesting(true);
    try {
      await requestBrowserNotificationPermission();
      setOpen(false);
    } catch (error) {
      console.warn("[push] Notification permission request failed", error);
    } finally {
      setRequesting(false);
    }
  }

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={setOpen}>
      <Modal.Container placement="center" size="sm">
        <Modal.Dialog className="sm:max-w-[400px] !p-4">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Icon className="bg-accent-soft text-accent-soft-foreground">
              <Bell className="size-5" />
            </Modal.Icon>
            <Modal.Heading>
              <Trans>Enable notifications</Trans>
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <p>
              <Trans>
                Allow the browser to show notifications while the app is in the background.
              </Trans>
            </p>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="tertiary" onPress={() => setOpen(false)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button isPending={requesting} onPress={() => void allowNotifications()}>
              <Trans>Allow</Trans>
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
