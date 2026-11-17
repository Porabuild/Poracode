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
  foldable = false,
  hingeAngle,
  folding = false,
  onStatusChange,
  onLivePressButtonChange,
}: {
  control: boolean;
  framed?: boolean;
  foldable?: boolean;
  hingeAngle?: number | undefined;
  folding?: boolean;
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
  const halfOpen = foldable && hingeAngle !== undefined && hingeAngle > 0 && hingeAngle < 180;
  return (
    <div
      data-testid="device-live-preview"
      data-frame={framed ? "framed" : "flat"}
      data-hinge-angle={hingeAngle}
      data-folding={folding ? "true" : undefined}
      className={`relative max-h-full w-full max-w-full overflow-hidden bg-black transition-[max-width,aspect-ratio,transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none [&_[role=application]:focus-visible]:ring-2 [&_[role=application]:focus-visible]:ring-inset [&_[role=application]:focus-visible]:ring-accent ${
        framed ? "rounded-[18px] border-2 border-white/15 p-1 shadow-sm" : "rounded-lg"
      }`}
      style={{
        aspectRatio: `${width}/${height}`,
        maxWidth: `min(100%, calc(100cqh * ${width} / ${height}))`,
        transform: halfOpen
          ? "perspective(1200px) scaleX(0.95) scaleY(0.985)"
          : folding
            ? "perspective(1200px) scale(0.97)"
            : "perspective(1200px) scale(1)",
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
      {foldable ? (
        <div
          aria-hidden="true"
          data-testid="device-fold-crease"
          className={`pointer-events-none absolute inset-y-0 left-1/2 w-8 -translate-x-1/2 transition-opacity duration-300 motion-reduce:transition-none ${
            halfOpen || folding ? "opacity-100" : "opacity-0"
          }`}
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.22) 45%, rgba(255,255,255,0.16) 50%, rgba(0,0,0,0.26) 55%, transparent 100%)",
          }}
        />
      ) : null}
    </div>
  );
}

export function LiveDevicePreview({
  state,
  control,
  framed = false,
  foldable = false,
  hingeAngle,
  folding = false,
  onStatusChange,
  onLivePressButtonChange,
}: {
  state: DeviceLivePreviewState;
  control: boolean;
  framed?: boolean;
  foldable?: boolean;
  hingeAngle?: number | undefined;
  folding?: boolean;
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
        inputEnabled: state.preview.access === "control",
      }}
    >
      <Screen
        control={control}
        framed={framed}
        foldable={foldable}
        hingeAngle={hingeAngle}
        folding={folding}
        {...(onStatusChange ? { onStatusChange } : {})}
        {...(onLivePressButtonChange ? { onLivePressButtonChange } : {})}
      />
    </DeviceClientProvider>
  );
}
