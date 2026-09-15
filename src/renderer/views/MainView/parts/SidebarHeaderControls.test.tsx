import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { SidebarHeaderControls } from "./SidebarHeaderControls";

vi.mock("@/renderer/clientRuntime", () => ({
  isBrowserClientRuntime: () => true,
  hasClientCapability: () => false,
}));

describe("SidebarHeaderControls", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        media: query,
        matches: query === "(max-width: 767px)",
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true,
      })),
    );
    useRemoteServersStore.setState({ servers: [], runtime: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the disconnected mobile status when no remote server is available", () => {
    const { container } = render(
      <AppProvider>
        <SidebarHeaderControls />
      </AppProvider>,
    );

    expect(container.querySelector(".lucide-wifi-off")).not.toBeNull();
    expect(container.querySelector(".lucide-wifi")).toBeNull();
  });

  it("keeps the mobile header clear while the remote server is connected", () => {
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "desktop-1",
          label: "Desktop",
          endpoint: "http://desktop.test",
          accessToken: "test-token",
        },
      ],
      runtime: { "desktop-1": { status: "online", projects: [], threads: [] } },
    } as never);

    const { container } = render(
      <AppProvider>
        <SidebarHeaderControls />
      </AppProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
