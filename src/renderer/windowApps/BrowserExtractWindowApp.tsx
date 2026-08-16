import { AppProvider } from "@/renderer/components/ui/provider";
import { useStandaloneWindowViewTracking } from "@/renderer/analytics/useProductViewTracking";
import { BrowserPanel } from "@/renderer/views/MainView/parts/RightPanel/parts/BrowserPanel/BrowserPanel";
import { useBrowserSync } from "@/renderer/views/MainView/parts/RightPanel/parts/BrowserPanel/hooks/useBrowserSync";

export function BrowserExtractWindowApp() {
  useBrowserSync();
  useStandaloneWindowViewTracking("browser_extracted");

  return (
    <AppProvider contentReady syncWindowChrome={false}>
      <div className="flex h-screen w-screen overflow-hidden bg-[var(--content-background)] text-foreground">
        <BrowserPanel visible surface="window" />
      </div>
    </AppProvider>
  );
}
