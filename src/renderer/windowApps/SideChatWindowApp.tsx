import { useEffect, useState } from "react";
import { readBridge } from "@/renderer/bridge";
import type { SideChatBootstrap } from "@/shared/ipc/sideChat";
import { AppProvider } from "@/renderer/components/ui/provider";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { useAppHydration } from "@/renderer/hooks/useAppHydration";
import { SideChatBody } from "@/renderer/components/thread/SideChat/SideChatBody";
import { ImageLightboxHost } from "@/renderer/components/composer/ImageLightbox";
import { captureRendererException } from "@/renderer/diagnostics/sentry";
import { useRemoteServerConnection } from "@/renderer/hooks/useRemoteServerConnection";

export function SideChatWindowApp() {
  const { initialConnectSettled } = useRemoteServerConnection();
  const { initialLoading } = useAppHydration({ runtimeOwner: false, prewarmFeatures: false });
  const [entry, setEntry] = useState<SideChatBootstrap | null>(null);
  useEffect(() => {
    void readBridge()
      .getSideChatWindowInfo?.()
      .then((info) => {
        if (info) {
          document.title = info.title;
          setEntry(info);
        }
      })
      .catch((error: unknown) => captureRendererException(error, { featureArea: "side-chat" }));
  }, []);
  return (
    <AppProvider contentReady={!initialLoading && entry !== null} syncWindowChrome={false}>
      {!initialLoading && entry && (!entry.source.remoteServerId || initialConnectSettled) ? (
        <SideChatBody entry={entry} />
      ) : (
        <PixelLoader size="sm" />
      )}
      <ImageLightboxHost />
    </AppProvider>
  );
}
