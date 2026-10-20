import { useEffect } from "react";
import {
  type ConnectionStatus,
  DeviceClientProvider,
  DeviceScreen,
  displayScreen,
  useDeviceClientSelector,
  useDeviceScreenClient,
} from "@expo/hub-client";
import { useLingui } from "@lingui/react/macro";
import type { DeviceLivePreviewState } from "./useDeviceLivePreview";

function Screen({
  control,
  framed = false,
  onStatusChange,
  onLivePressButtonChange,
}: {
  control: boolean;
  framed?: boolean;
  onStatusChange?: (status: ConnectionStatus) => void;
  onLivePressButtonChange?: (pressButton: ((button: "recents") => void) | null) => void;
}) {
  const { t } = useLingui();
  const client = useDeviceScreenClient();
  const pressButton = useDeviceClientSelector((entry) => entry.pressButton);
  // Local gating complements host input filtering. The upstream overlay is
  // absent for view grants; it cannot capture focus, gestures or wheel input.
  const gated = control
    ? client
    : {
        ...client,
        sendTouch: () => {},
        sendMultiTouch: () => {},
        sendScroll: () => {},
        sendKey: () => false,
      };
  useEffect(() => {
    onStatusChange?.(client.status);
    return () => {
      onStatusChange?.("idle");
    };
  }, [client.status, onStatusChange]);
  useEffect(() => {
    if (control && client.status === "streaming") {
      onLivePressButtonChange?.((button) => {
        pressButton(button);
      });
      return () => {
        onLivePressButtonChange?.(null);
      };
    }
    onLivePressButtonChange?.(null);
    return undefined;
  }, [client.status, control, onLivePressButtonChange, pressButton]);
  const status =
    client.status === "error"
      ? t`Live preview is unavailable. Retry or use snapshots.`
      : client.status === "reconnecting"
        ? t`Reconnecting to the device…`
        : client.status === "connecting"
          ? t`Connecting to the device…`
          : t`Waiting for the device…`;
  const size = displayScreen(client.screen);
  const width = size?.width ?? 9;
  const height = size?.height ?? 16;
  return (
    <div
      data-testid="device-live-preview"
      data-frame={framed ? "framed" : "flat"}
      className={`relative max-h-full w-full max-w-full overflow-hidden bg-black [&_[role=application]:focus-visible]:ring-2 [&_[role=application]:focus-visible]:ring-inset [&_[role=application]:focus-visible]:ring-accent ${
        framed ? "rounded-[18px] border-2 border-white/15 p-1 shadow-sm" : "rounded-lg"
      }`}
      style={{
        aspectRatio: `${width}/${height}`,
        maxWidth: `min(100%, calc(100cqh * ${width} / ${height}))`,
      }}
    >
      <DeviceScreen
        client={gated}
        interactive={control}
        ariaLabel={
          control
            ? t`Interactive device preview. Tab moves to the next control; Escape closes the workspace.`
            : t`Live device preview, view only`
        }
        statusLabel={status}
        borderRadius={framed ? 14 : 8}
      />
    </div>
  );
}

export function LiveDevicePreview({
  state,
  control,
  framed = false,
  onStatusChange,
  onLivePressButtonChange,
}: {
  state: DeviceLivePreviewState;
  control: boolean;
  framed?: boolean;
  onStatusChange?: (status: ConnectionStatus) => void;
  onLivePressButtonChange?: (pressButton: ((button: "recents") => void) | null) => void;
}) {
  return (
    <DeviceClientProvider
      key={`${state.preview.sessionId}:${state.preview.id}`}
      platform={state.preview.platform}
      options={{
        baseUrl: state.baseUrl,
        device: state.preview.clientDeviceId,
        streamMode: "h264",
        token: null,
        transport: state.transport,
        inputEnabled: control,
      }}
    >
      <Screen
        control={control}
        framed={framed}
        {...(onStatusChange ? { onStatusChange } : {})}
        {...(onLivePressButtonChange ? { onLivePressButtonChange } : {})}
      />
    </DeviceClientProvider>
  );
}
