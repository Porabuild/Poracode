import { startTransition } from "react";
import { Switch } from "@heroui/react";
import type { NotificationFilter } from "@/shared/contracts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { Select } from "@/renderer/components/common";
import { SettingRow, SettingsPage } from "./SettingsForm";

const filterOptions = [
  { id: "unfocused", label: "Only when unfocused" },
  { id: "all", label: "Always" },
] as const;

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

  return (
    <SettingsPage title="Notifications">
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
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-foreground">Done</p>
                <p className="text-xs text-muted">Thread finished or waiting for your input.</p>
              </div>
              <Switch
                isSelected={notificationStatuses.done}
                onChange={(selected) => {
                  startTransition(() => {
                    setNotificationStatuses({ done: selected });
                  });
                }}
              >
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-foreground">Needs Attention</p>
                <p className="text-xs text-muted">Approval or reply required from you.</p>
              </div>
              <Switch
                isSelected={notificationStatuses.needsAttention}
                onChange={(selected) => {
                  startTransition(() => {
                    setNotificationStatuses({ needsAttention: selected });
                  });
                }}
              >
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-foreground">Error</p>
                <p className="text-xs text-muted">Agent encountered an error.</p>
              </div>
              <Switch
                isSelected={notificationStatuses.error}
                onChange={(selected) => {
                  startTransition(() => {
                    setNotificationStatuses({ error: selected });
                  });
                }}
              >
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch>
            </div>
          </div>
        </div>

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
      </div>
    </SettingsPage>
  );
}
