import { useEffect, useRef } from "react";
import {
  type ConnectionStatus,
  DeviceClientProvider,
  DeviceScreen,
  displayScreen,
  useDeviceClientSelector,
  useDeviceScreenClient,
} from "@expo/hub-client";
import { useLingui } from "@lingui/react/macro";
import { FoldableBookOverlay, useAnimatedHingeAngle } from "./FoldableBookOverlay";
import type { DeviceLivePreviewState } from "./useDeviceLivePreview";

function Screen({
  control,
  framed = false,
  foldable = false,
  hingeAngle,
  dragging = false,
  folding = false,
  onStatusChange,
  onLivePressButtonChange,
}: {
  control: boolean;
  framed?: boolean;
  foldable?: boolean;
  hingeAngle?: number | undefined;
  dragging?: boolean;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const size = displayScreen(client.screen);
  const width = size?.width ?? 9;
  const height = size?.height ?? 16;
  const animatedAngle = useAnimatedHingeAngle(hingeAngle, dragging);
  const bookOpen =
    foldable &&
    animatedAngle !== undefined &&
    animatedAngle > 0 &&
    animatedAngle < 180 &&
    client.status === "streaming";
  return (
    <div
      ref={containerRef}
      data-testid="device-live-preview"
      data-frame={framed ? "framed" : "flat"}
      data-hinge-angle={hingeAngle}
      data-folding={folding ? "true" : undefined}
      className={`relative max-h-full w-full max-w-full transition-[max-width,aspect-ratio] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none [&_[role=application]:focus-visible]:ring-2 [&_[role=application]:focus-visible]:ring-inset [&_[role=application]:focus-visible]:ring-accent ${
        bookOpen
          ? "overflow-visible bg-transparent"
          : framed
            ? "overflow-hidden rounded-[18px] border-2 border-white/15 bg-black p-1 shadow-sm"
            : "overflow-hidden rounded-lg bg-black"
      }`}
      style={{
        aspectRatio: `${width}/${height}`,
        maxWidth: `min(100%, calc(100cqh * ${width} / ${height}))`,
      }}
    >
      <div className={bookOpen ? "h-full w-full opacity-0" : "h-full w-full"}>
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
      {bookOpen ? (
        <FoldableBookOverlay
          sourceContainerRef={containerRef}
          angle={animatedAngle}
          orientation={client.screen?.orientation}
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
  dragging = false,
  folding = false,
  onStatusChange,
  onLivePressButtonChange,
}: {
  state: DeviceLivePreviewState;
  control: boolean;
  framed?: boolean;
  foldable?: boolean;
  hingeAngle?: number | undefined;
  dragging?: boolean;
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
        dragging={dragging}
        folding={folding}
        {...(onStatusChange ? { onStatusChange } : {})}
        {...(onLivePressButtonChange ? { onLivePressButtonChange } : {})}
      />
    </DeviceClientProvider>
  );
}
