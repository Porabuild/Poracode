import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { ImageLightboxHost } from "@/renderer/components/composer/ImageLightbox";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppHydration } from "@/renderer/hooks/useAppHydration";
import { useStandaloneWindowViewTracking } from "@/renderer/analytics/useProductViewTracking";
import { QuickComposerOverlay } from "@/renderer/views/QuickComposerOverlay/QuickComposerOverlay";

export function QuickComposerWindowApp() {
  const { initialLoading } = useAppHydration({ runtimeOwner: false });
  useStandaloneWindowViewTracking("quick_composer", !initialLoading);

  return (
    <AppProvider contentReady={!initialLoading} syncWindowChrome={false}>
      {initialLoading ? (
        <div className="quick-composer-root">
          <div className="quick-composer-status">
            <PixelLoader size="sm" />
          </div>
        </div>
      ) : (
        <QuickComposerOverlay />
      )}
      <ImageLightboxHost />
    </AppProvider>
  );
}
