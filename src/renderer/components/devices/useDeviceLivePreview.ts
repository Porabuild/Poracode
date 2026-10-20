import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { DeviceClientTransport } from "@expo/hub-client";
import { useLingui } from "@lingui/react/macro";
import type { DeviceSession } from "@/shared/deviceWorkspace";
import type { DevicePreview } from "@/shared/devicePreview";
import { RemoteClientError, type RemoteDesktopClient } from "@/shared/remote/client";
import { supportsDeviceLivePreview } from "@/shared/remote/clientDevicePreview";
import { withThreadDeviceClient } from "./deviceClient";
import { createDevicePreviewTransport } from "./devicePreviewTransport";

export interface DeviceLivePreviewState {
  preview: DevicePreview;
  baseUrl: string;
  transport: DeviceClientTransport;
}

/** Kept above the responsive portal: moving the same workspace between its
 * pane and modal does not recreate authority or close the shared preview. */
export function useDeviceLivePreview(
  threadId: string,
  session: DeviceSession | null,
  enabled: boolean,
  onDenied: (error: unknown, sessionId: string) => void,
) {
  const { t } = useLingui();
  const [state, setState] = useState<{ attempt: number; value: DeviceLivePreviewState } | null>(
    null,
  );
  const [failure, setFailure] = useState<{
    attempt: number;
    sessionId: string;
    message: string;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retiring = useRef<Promise<void>>(Promise.resolve());
  const denied = useEffectEvent((error: RemoteClientError, sessionId: string) =>
    onDenied(
      new RemoteClientError(t`Device access expired. Attach again.`, error.status, error.code),
      sessionId,
    ),
  );
  const unavailable = useEffectEvent((error: unknown) =>
    error instanceof RemoteClientError && error.status === 501
      ? t`Live preview is unavailable for this device on this host. Use snapshots.`
      : t`Live preview is unavailable. Retry or use snapshots.`,
  );

  useEffect(() => {
    if (!session || !enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let owned:
      | { client: RemoteDesktopClient; threadId: string; preview: DevicePreview }
      | undefined;
    let closing: Promise<void> | undefined;
    const previousRetirement = retiring.current;
    const close = () =>
      (closing ??= owned
        ? owned.client.closeDevicePreview(owned.threadId, owned.preview).catch(() => undefined)
        : Promise.resolve());
    const fail = (error: unknown) => {
      if (controller.signal.aborted) return;
      setFailure({ attempt, sessionId: session.id, message: unavailable(error) });
      setState(null);
      if (error instanceof RemoteClientError && [401, 403, 404, 410].includes(error.status))
        denied(error, session.id);
      controller.abort();
      clearTimeout(timer);
      void close();
    };
    const renew = async () => {
      if (!owned || controller.signal.aborted) return;
      try {
        const owner = owned;
        const preview = await withThreadDeviceClient(threadId, (client, id) => {
          if (client.endpoint !== owner.client.endpoint || id !== owner.threadId)
            throw new RemoteClientError(
              "The device-preview host changed.",
              410,
              "device_preview_expired",
            );
          return client.renewDevicePreview(id, owner.preview, controller.signal);
        });
        if (controller.signal.aborted) return;
        owned.preview = preview;
        timer = setTimeout(() => void renew(), 20_000);
      } catch (error) {
        fail(error);
      }
    };
    const setup = (async () => {
      await previousRetirement;
      controller.signal.throwIfAborted();
      await withThreadDeviceClient(threadId, async (client, id) => {
        const descriptor = await client.environment();
        controller.signal.throwIfAborted();
        if (!supportsDeviceLivePreview(descriptor))
          throw new RemoteClientError(
            "Live preview is unavailable.",
            501,
            "device_preview_unavailable",
          );
        const preview = await client.openDevicePreview(
          id,
          session.id,
          { version: 1, generation: session.generation },
          controller.signal,
        );
        owned = { client, threadId: id, preview };
        controller.signal.throwIfAborted();
        if (
          preview.sessionId !== session.id ||
          preview.generation !== session.generation ||
          preview.platform !== session.device.platform ||
          preview.access !== session.access
        )
          throw new RemoteClientError(
            "The device-preview owner changed.",
            410,
            "device_preview_expired",
          );
        setState({
          attempt,
          value: {
            preview,
            baseUrl: client.devicePreviewBaseUrl(id, preview),
            transport: createDevicePreviewTransport(
              threadId,
              id,
              client,
              preview,
              controller.signal,
            ),
          },
        });
        timer = setTimeout(() => void renew(), 20_000);
      });
    })();
    void setup.catch(fail);
    return () => {
      controller.abort();
      clearTimeout(timer);
      // A new setup waits for the exact old resource close. A delayed close
      // cannot revoke a replacement preview or a later responsive mount.
      retiring.current = setup.catch(() => undefined).then(close);
    };
  }, [threadId, session, enabled, attempt]);

  return {
    state:
      enabled && state?.attempt === attempt && state.value.preview.sessionId === session?.id
        ? state.value
        : null,
    error:
      enabled && failure?.attempt === attempt && failure.sessionId === session?.id && !state
        ? failure.message
        : null,
    retry: () => setAttempt((value) => value + 1),
  };
}
