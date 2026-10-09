import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openMcpServersSettings } from "@/renderer/actions/panelActions";
import { usePanelStore } from "@/renderer/state/panelStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ComposerAddMenu } from "./ComposerAddMenu";

const client = vi.hoisted(() => ({ remote: false, compact: false, electron: false }));

vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  isRemoteSession: () => client.remote,
}));
vi.mock("@/renderer/clientRuntime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/clientRuntime")>()),
  hasElectronHostBridge: () => client.electron,
}));
vi.mock("@/renderer/adaptiveLayout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/adaptiveLayout")>()),
  useCompactLayout: () => client.compact,
  isCompactLayoutViewport: () => client.compact,
}));

beforeEach(() => {
  client.remote = false;
  client.compact = false;
  client.electron = false;
  usePanelStore.setState({ settingsOpen: false, settingsSection: null, mobileUtilityPage: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  window.history.replaceState(null, "", "/");
});

function openServers() {
  fireEvent.click(screen.getByRole("button", { name: "Add attachment or capability" }));
  fireEvent.click(screen.getByText("MCP Servers"));
}

describe.each([
  { composer: "draft", readOnly: false },
  { composer: "existing-thread", readOnly: true },
])("$composer composer settings capability", ({ readOnly }) => {
  it.each(["extension", "sidebar-preview"])(
    "omits Manage on %s while preserving configured server information and binding behavior",
    (surface) => {
      client.remote = true;
      if (surface === "extension") vi.stubEnv("VITE_PORACODE_BUILD_TARGET", "extension");
      else window.history.replaceState(null, "", "/?surface=chat-sidebar");
      const onToggle = vi.fn<(next: boolean) => void>();
      render(
        <ComposerAddMenu
          mcpServers={[]}
          customMcpServers={[{ id: "test-server", name: "Test server", enabled: true, onToggle }]}
          readOnly={readOnly}
          onManageMcpServers={openMcpServersSettings}
          onPickFiles={vi.fn<() => void>()}
        />,
      );

      openServers();
      expect(screen.queryByText("Manage MCP servers")).not.toBeInTheDocument();
      expect(screen.getByText("Test server")).toBeInTheDocument();
      fireEvent.click(screen.getByText("Test server"));
      expect(screen.queryByRole("list", { name: "MCP Servers" }) !== null).toBe(readOnly);
      expect(onToggle.mock.calls).toEqual(readOnly ? [] : [[false]]);
      expect(usePanelStore.getState().settingsSection).toBeNull();
    },
  );

  it.each(["electron", "pwa"])("retains a working Manage destination on %s", (surface) => {
    client.electron = surface === "electron";
    client.remote = surface === "pwa";
    client.compact = surface === "pwa";
    render(
      <ComposerAddMenu
        mcpServers={[]}
        readOnly={readOnly}
        onManageMcpServers={openMcpServersSettings}
        onPickFiles={vi.fn<() => void>()}
      />,
    );

    openServers();
    fireEvent.click(screen.getByText("Manage MCP servers"));
    expect(usePanelStore.getState()).toMatchObject({
      settingsSection: "mcpServers",
      settingsOpen: surface === "electron",
      mobileUtilityPage: surface === "pwa" ? "settings" : null,
    });
  });

  it("keeps the existing empty-state behavior on the sidebar without a Manage action", () => {
    vi.stubEnv("VITE_PORACODE_BUILD_TARGET", "extension");
    render(
      <ComposerAddMenu
        mcpServers={[]}
        readOnly={readOnly}
        onManageMcpServers={openMcpServersSettings}
        onPickFiles={vi.fn<() => void>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add attachment or capability" }));
    expect(screen.getByText("File")).toBeInTheDocument();
    expect(screen.queryByText("MCP Servers") !== null).toBe(readOnly);
    if (readOnly) fireEvent.click(screen.getByText("MCP Servers"));
    expect(screen.queryByText("No MCP servers are enabled for this run") !== null).toBe(readOnly);
    expect(screen.queryByText("Manage MCP servers")).not.toBeInTheDocument();
  });
});
