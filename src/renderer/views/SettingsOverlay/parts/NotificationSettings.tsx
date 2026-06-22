import { startTransition, useState } from "react";
import { Button, Switch } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { NotificationFilter } from "@/shared/contracts";
import { isRemoteSession } from "@/renderer/bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { Select } from "@/renderer/components/common";
import { SettingRow, SettingsPage } from "./SettingsForm";
import { useLocalizedOptions } from "./settingsOptions";

const filterOptions = [
  { id: "unfocused", label: msg`Only when unfocused` },
  { id: "all", label: msg({ message: "Always", comment: "Notification filter: always notify" }) },
] as const;

/** In the PWA, system notifications need the browser's permission; surface
 * the request here since browsers only grant it from a user gesture. */
function BrowserPermissionRow() {
  const { t } = useLingui();
  const supported = typeof Notification !== "undefined";
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    supported ? Notification.permission : "denied",
  );

  if (!supported) {
    return (
      <p className="text-xs text-muted">
        <Trans>
          This browser does not support system notifications here; you will still see in-app toasts.
        </Trans>
      </p>
    );
  }
  if (permission === "granted") return null;
  return (
    <SettingRow
      title={t`System notifications`}
      description={
        permission === "denied"
          ? t`Blocked by the browser. Allow notifications for this site in the browser settings to get alerts while the app is in the background.`
          : t`Allow the browser to show notifications while the app is in the background.`
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
          <Trans>Allow</Trans>
        </Button>
      ) : null}
    </SettingRow>
  );
}

export function NotificationSettings() {
  const { t } = useLingui();
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

  const filterOpts = useLocalizedOptions(filterOptions);

  return (
    <SettingsPage title={t`Notifications`}>
      {remote ? <BrowserPermissionRow /> : null}
      <SettingRow
        anchorId="notifications.enableNotifications"
        title={t`Enable notifications`}
        description={<Trans>Show notifications when thread status changes.</Trans>}
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
          anchorId="notifications.playNotificationSound"
          title={t`Play notification sound`}
          description={<Trans>Play a sound when a notification is shown.</Trans>}
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
          anchorId="notifications.showNotifications"
          title={t`Show notifications`}
          description={<Trans>When to display in-app toasts for visible threads.</Trans>}
        >
          <Select
            aria-label={t`Show notifications`}
            className="w-[180px] shrink-0"
            options={filterOpts}
            value={notificationFilter}
            onChange={(value) => {
              startTransition(() => {
                setNotificationFilter(value as NotificationFilter);
              });
            }}
          />
        </SettingRow>

        <div className="pt-2">
          <p className="mb-3 text-sm font-medium text-foreground">
            <Trans>Notify me about</Trans>
          </p>
          <div className="space-y-3">
            <div
              id="notifications.notifyDone"
              data-settings-anchor="notifications.notifyDone"
              className="flex scroll-mt-4 items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="text-sm text-foreground">
                  <Trans comment="Notification status: thread is done">Done</Trans>
                </p>
                <p className="text-xs text-muted">
                  <Trans>Thread finished or waiting for your input.</Trans>
                </p>
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

            <div
              id="notifications.notifyNeedsAttention"
              data-settings-anchor="notifications.notifyNeedsAttention"
              className="flex scroll-mt-4 items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="text-sm text-foreground">
                  <Trans>Needs Attention</Trans>
                </p>
                <p className="text-xs text-muted">
                  <Trans>Approval or reply required from you.</Trans>
                </p>
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

            <div
              id="notifications.notifyError"
              data-settings-anchor="notifications.notifyError"
              className="flex scroll-mt-4 items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="text-sm text-foreground">
                  <Trans comment="Notification status: agent error">Error</Trans>
                </p>
                <p className="text-xs text-muted">
                  <Trans>Agent encountered an error.</Trans>
                </p>
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

        {!remote && (
          <SettingRow
            anchorId="notifications.notifyL2Cli"
            className="pt-2"
            title={t`Notify for L2 CLI threads`}
            description={
              <Trans>
                When off, suppress notifications from terminal threads whose status comes from the
                OSC fallback (no CLI hook plugin).
              </Trans>
            }
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
