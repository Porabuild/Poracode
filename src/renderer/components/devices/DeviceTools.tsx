import { useState } from "react";
import { Button, Input } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { DeviceControl, DeviceControlState, DeviceTarget } from "@/shared/deviceWorkspace";
import { deviceControlSchema } from "@/shared/deviceWorkspace";
import { Select } from "@/renderer/components/common/Select";

export function DeviceTools({
  device,
  state,
  disabled,
  onAction,
}: {
  device: DeviceTarget;
  state: DeviceControlState | null;
  disabled: boolean;
  onAction: (control: DeviceControl) => void;
}) {
  const { t } = useLingui();
  const [url, setUrl] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [permission, setPermission] = useState("camera");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const supports = (type: DeviceControl["type"]) => device.controls?.actions.includes(type);
  const location = { type: "location", latitude: Number(latitude), longitude: Number(longitude) };
  const locationValid =
    latitude.trim() !== "" &&
    longitude.trim() !== "" &&
    deviceControlSchema.safeParse(location).success;
  const appValid = deviceControlSchema.safeParse({ type: "launchApp", applicationId }).success;
  const urlValid = deviceControlSchema.safeParse({ type: "openUrl", url }).success;
  return (
    <section
      aria-label={t`Device settings`}
      className="@container flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto text-xs"
    >
      {supports("openUrl") ? (
        <form
          className="flex min-w-0 gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!disabled && urlValid) onAction({ type: "openUrl", url });
          }}
        >
          <Input
            aria-label={t`URL or deep link`}
            placeholder={t`URL or deep link`}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="h-9 min-w-0 flex-1"
            disabled={disabled}
          />
          <Button size="sm" className="h-9" type="submit" isDisabled={disabled || !urlValid}>
            <Trans>Open</Trans>
          </Button>
        </form>
      ) : null}
      {supports("launchApp") || supports("permission") ? (
        <div className="flex flex-col gap-1">
          <form
            className="flex min-w-0 gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (!disabled && appValid && supports("launchApp"))
                onAction({ type: "launchApp", applicationId });
            }}
          >
            <Input
              aria-label={t`App package ID`}
              placeholder={t`App package ID`}
              value={applicationId}
              onChange={(event) => setApplicationId(event.target.value)}
              className="h-9 min-w-0 flex-1"
              disabled={disabled}
            />
            {supports("launchApp") ? (
              <Button size="sm" className="h-9" type="submit" isDisabled={disabled || !appValid}>
                <Trans>Launch</Trans>
              </Button>
            ) : null}
          </form>
          {supports("permission") ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              <Select
                aria-label={t`Permission`}
                className="min-w-32 flex-1"
                value={permission}
                onChange={setPermission}
                isDisabled={disabled}
                options={[
                  { id: "camera", label: t`Camera` },
                  { id: "microphone", label: t`Microphone` },
                  { id: "photos", label: t`Photos` },
                  { id: "contacts", label: t`Contacts` },
                  { id: "calendar", label: t`Calendar` },
                  { id: "location", label: t`Location` },
                  { id: "notifications", label: t`Notifications` },
                  { id: "motion", label: t`Motion` },
                ]}
              />
              {(["grant", "revoke"] as const).map((decision) => (
                <Button
                  key={decision}
                  size="sm"
                  className="h-9"
                  isDisabled={disabled || !appValid}
                  onPress={() => {
                    const action = deviceControlSchema.parse({
                      type: "permission",
                      applicationId,
                      permission,
                      decision,
                    });
                    onAction(action);
                  }}
                >
                  {decision === "grant" ? t`Grant` : t`Revoke`}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-2 @min-[360px]:grid-cols-2">
        {supports("appearance") ? (
          <Select
            label={t`Device appearance`}
            value={state?.appearance ?? null}
            placeholder={state?.appearance === "system" ? t`System` : t`Unknown`}
            isDisabled={disabled}
            options={[
              { id: "light", label: t`Light` },
              { id: "dark", label: t`Dark` },
            ]}
            onChange={(value) => onAction(deviceControlSchema.parse({ type: "appearance", value }))}
          />
        ) : null}
        {supports("textSize") ? (
          <Select
            label={t`Device text size`}
            value={
              state?.fontScale === 0.85
                ? "small"
                : state?.fontScale === 1
                  ? "standard"
                  : state?.fontScale === 1.15
                    ? "large"
                    : state?.fontScale === 1.3
                      ? "extraLarge"
                      : null
            }
            placeholder={t`Unknown`}
            isDisabled={disabled}
            options={[
              { id: "small", label: t`Small` },
              { id: "standard", label: t`Default` },
              { id: "large", label: t`Large` },
              { id: "extraLarge", label: t`Extra large` },
            ]}
            onChange={(value) => onAction(deviceControlSchema.parse({ type: "textSize", value }))}
          />
        ) : null}
        {supports("orientation") ? (
          <Select
            label={t`Device orientation`}
            placeholder={t`Rotate to…`}
            isDisabled={disabled}
            options={[
              { id: "portrait", label: t`Portrait` },
              { id: "landscapeLeft", label: t`Landscape left` },
              { id: "upsideDown", label: t`Upside down` },
              { id: "landscapeRight", label: t`Landscape right` },
            ]}
            onChange={(value) =>
              onAction(deviceControlSchema.parse({ type: "orientation", value }))
            }
          />
        ) : null}
        {supports("reduceMotion") ? (
          <Select
            label={t`Reduce motion`}
            value={state?.reduceMotion === undefined ? null : String(state.reduceMotion)}
            placeholder={t`Unknown`}
            isDisabled={disabled}
            options={[
              { id: "true", label: t`On` },
              { id: "false", label: t`Off` },
            ]}
            onChange={(value) => onAction({ type: "reduceMotion", enabled: value === "true" })}
          />
        ) : null}
        {supports("network") ? (
          <Select
            label={t`Device network`}
            value={state?.networkEnabled === undefined ? null : String(state.networkEnabled)}
            placeholder={t`Unknown`}
            isDisabled={disabled}
            options={[
              { id: "true", label: t`On` },
              { id: "false", label: t`Off` },
            ]}
            onChange={(value) => onAction({ type: "network", enabled: value === "true" })}
          />
        ) : null}
      </div>
      {supports("location") ? (
        <form
          className="flex min-w-0 flex-wrap gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!disabled && locationValid) onAction(deviceControlSchema.parse(location));
          }}
        >
          <Input
            aria-label={t`Latitude`}
            placeholder={t`Latitude`}
            inputMode="decimal"
            value={latitude}
            onChange={(event) => setLatitude(event.target.value)}
            className="h-9 min-w-20 flex-1"
            disabled={disabled}
          />
          <Input
            aria-label={t`Longitude`}
            placeholder={t`Longitude`}
            inputMode="decimal"
            value={longitude}
            onChange={(event) => setLongitude(event.target.value)}
            className="h-9 min-w-20 flex-1"
            disabled={disabled}
          />
          <Button type="submit" size="sm" className="h-9" isDisabled={disabled || !locationValid}>
            <Trans>Set location</Trans>
          </Button>
        </form>
      ) : null}
      <p className="text-muted">
        <Trans>
          Changes affect the selected emulator. App permissions depend on its Android version and
          the permissions requested by the app.
        </Trans>
      </p>
    </section>
  );
}
