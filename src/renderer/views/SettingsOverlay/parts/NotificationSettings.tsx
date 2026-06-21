import { startTransition, useState } from "react";
import { Button, Switch } from "@heroui/react";
import type { NotificationFilter } from "@/shared/contracts";
import { isRemoteSession } from "@/renderer/bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { Select } from "@/renderer/components/common";
import { SettingRow, SettingsPage } from "./SettingsForm";

const filterOptions = [
  { id: "unfocused", label: "Only when unfocused" },
  { id: "all", label: "Always" },
] as const;

const statusOptions = [
  { key: "done", label: "Done", description: "Thread finished or waiting for your input." },
  {
    key: "needsAttention",
    label: "Needs Attention",
    description: "Approval or reply required from you.",
  },
  { key: "error", label: "Error", description: "Agent encountered an error." },
] as const;

/** In the PWA, system notifications need the browser's permission; surface
 * the request here since browsers only grant it from a user gesture. */
function BrowserPermissionRow() {
  const supported = typeof Notification !== "undefined";
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    supported ? Notification.permission : "denied",
  );

  if (!supported) {
    return (
      <p className="text-xs text-muted">
        This browser does not support system notifications here; you will still see in-app toasts.
      </p>
    );
  }
  if (permission === "granted") return null;
  return (
    <SettingRow
      title="System notifications"
      description={
        permission === "denied"
          ? "Blocked by the browser. Allow notifications for this site in the browser settings to get alerts while the app is in the background."
          : "Allow the browser to show notifications while the app is in the background."
      }
    >
      {permission === "default" ? (
        <Button
          size="sm"
          variant="secondary"
          onPress={() => {
            void Notification.requestPermission().then(setPermission);
          }}
        >
          Allow
        </Button>
      ) : null}
    </SettingRow>
  );
}

export function NotificationSettings() {
  const notificationsEnabled = useSharedSettings((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useSharedSettings((s) => s.setNotificationsEnabled);
  const notificationSound = useSharedSettings((s) => s.notificationSound);
  const setNotificationSound = useSharedSettings((s) => s.setNotificationSound);
  const notificationFilter = useSharedSettings((s) => s.notificationFilter);
  const setNotificationFilter = useSharedSettings((s) => s.setNotificationFilter);
  const notificationStatuses = useSharedSettings((s) => s.notificationStatuses);
  const setNotificationStatuses = useSharedSettings((s) => s.setNotificationStatuses);
  const notifyL2Cli = useSharedSettings((s) => s.notifyL2Cli);
  const setNotifyL2Cli = useSharedSettings((s) => s.setNotifyL2Cli);
  // Remote sessions notify on this device; the L2 CLI nuance is desktop-only
  // and the browser permission row is PWA-only.
  const remote = isRemoteSession();

  return (
    <SettingsPage title="Notifications">
      {remote ? <BrowserPermissionRow /> : null}
      <SettingRow
        title="Enable notifications"
        description="Show notifications when thread status changes."
      >
        <Switch
          isSelected={notificationsEnabled}
          onChange={(selected) => {
            startTransition(() => {
              setNotificationsEnabled(selected);
            });
          }}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </SettingRow>

      <div
        className={`space-y-4 transition-opacity ${notificationsEnabled ? "" : "pointer-events-none opacity-40"}`}
      >
        <SettingRow
          title="Play notification sound"
          description="Play a sound when a notification is shown."
        >
          <Switch
            isSelected={notificationSound}
            onChange={(selected) => {
              startTransition(() => {
                setNotificationSound(selected);
              });
            }}
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch>
        </SettingRow>

        <SettingRow
          title="Show notifications"
          description="When to display in-app toasts for visible threads."
        >
          <Select
            aria-label="Show notifications"
            className="w-[180px] shrink-0"
            options={filterOptions}
            value={notificationFilter}
            onChange={(value) => {
              startTransition(() => {
                setNotificationFilter(value as NotificationFilter);
              });
            }}
          />
        </SettingRow>

        <div className="pt-2">
          <p className="mb-3 text-sm font-medium text-foreground">Notify me about</p>
          <div className="space-y-3">
            {statusOptions.map((option) => (
              <div key={option.key} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{option.label}</p>
                  <p className="text-xs text-muted">{option.description}</p>
                </div>
                <Switch
                  isSelected={notificationStatuses[option.key]}
                  onChange={(selected) => {
                    startTransition(() => {
                      setNotificationStatuses({ [option.key]: selected });
                    });
                  }}
                >
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch>
              </div>
            ))}
          </div>
        </div>

        {!remote && (
          <SettingRow
            className="pt-2"
            title="Notify for L2 CLI threads"
            description="When off, suppress notifications from terminal threads whose status comes from the OSC fallback (no CLI hook plugin)."
          >
            <Switch
              isSelected={notifyL2Cli}
              onChange={(selected) => {
                startTransition(() => {
                  setNotifyL2Cli(selected);
                });
              }}
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch>
          </SettingRow>
        )}
      </div>
    </SettingsPage>
  );
}
