import { startTransition, useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { NotificationFilter } from "@/shared/contracts";
import { isRemoteSession } from "@/renderer/bridge";
import { requestBrowserNotificationPermission } from "@/renderer/browserNotificationPermission";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { Select, ToggleSwitch } from "@/renderer/components/common";
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

  // Permission can also be granted from the "Enable notifications" toggle
  // above (a separate user gesture), so keep this row in sync via the
  // Permissions API change event when available. Guarded for browsers that
  // don't expose navigator.permissions or the "notifications" descriptor.
  useEffect(() => {
    if (!supported || typeof navigator === "undefined" || !navigator.permissions) return;
    let status: PermissionStatus | undefined;
    let cancelled = false;
    const sync = () => setPermission(Notification.permission);
    navigator.permissions
      .query({ name: "notifications" as PermissionName })
      .then((result) => {
        if (cancelled) return;
        status = result;
        status.addEventListener("change", sync);
        sync();
      })
      .catch(() => {
        /* "notifications" not queryable in this browser; ignore */
      });
    return () => {
      cancelled = true;
      status?.removeEventListener("change", sync);
    };
  }, [supported]);

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
            void requestBrowserNotificationPermission().then(setPermission);
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
  const doneLabel = t({
    message: "Done",
    comment: "Notification status: thread is done",
  });
  const errorLabel = t({
    message: "Error",
    comment: "Notification status: agent error",
  });
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
        <ToggleSwitch
          aria-label={t`Enable notifications`}
          isSelected={notificationsEnabled}
          onChange={(selected) => {
            // Browsers only grant the Notification permission from a user
            // gesture. In the PWA, proactively request it as part of this
            // toggle handler so the prompt actually appears; otherwise the
            // permission stays "default" and native notifications never show.
            // Gated on the remote session, so desktop behavior is unchanged.
            if (
              selected &&
              remote &&
              typeof Notification !== "undefined" &&
              Notification.permission === "default"
            ) {
              void requestBrowserNotificationPermission();
            }
            startTransition(() => {
              setNotificationsEnabled(selected);
            });
          }}
        />
      </SettingRow>

      <div
        className={`space-y-4 transition-opacity ${notificationsEnabled ? "" : "pointer-events-none opacity-40"}`}
      >
        <SettingRow
          anchorId="notifications.playNotificationSound"
          title={t`Play notification sound`}
          description={<Trans>Play a sound when a notification is shown.</Trans>}
        >
          <ToggleSwitch
            aria-label={t`Play notification sound`}
            isSelected={notificationSound}
            onChange={(selected) => {
              startTransition(() => {
                setNotificationSound(selected);
              });
            }}
          />
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
                <p className="text-sm text-foreground">{doneLabel}</p>
                <p className="text-xs text-muted">
                  <Trans>Thread finished or waiting for your input.</Trans>
                </p>
              </div>
              <ToggleSwitch
                aria-label={doneLabel}
                isSelected={notificationStatuses.done}
                onChange={(selected) => {
                  startTransition(() => {
                    setNotificationStatuses({ done: selected });
                  });
                }}
              />
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
              <ToggleSwitch
                aria-label={t`Needs Attention`}
                isSelected={notificationStatuses.needsAttention}
                onChange={(selected) => {
                  startTransition(() => {
                    setNotificationStatuses({ needsAttention: selected });
                  });
                }}
              />
            </div>

            <div
              id="notifications.notifyError"
              data-settings-anchor="notifications.notifyError"
              className="flex scroll-mt-4 items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="text-sm text-foreground">{errorLabel}</p>
                <p className="text-xs text-muted">
                  <Trans>Agent encountered an error.</Trans>
                </p>
              </div>
              <ToggleSwitch
                aria-label={errorLabel}
                isSelected={notificationStatuses.error}
                onChange={(selected) => {
                  startTransition(() => {
                    setNotificationStatuses({ error: selected });
                  });
                }}
              />
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
            <ToggleSwitch
              aria-label={t`Notify for L2 CLI threads`}
              isSelected={notifyL2Cli}
              onChange={(selected) => {
                startTransition(() => {
                  setNotifyL2Cli(selected);
                });
              }}
            />
          </SettingRow>
        )}
      </div>
    </SettingsPage>
  );
}
