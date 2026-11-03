import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";

vi.mock("@/renderer/components/mcp/McpServersManager", () => ({
  McpServersManager: () => null,
}));
vi.mock("./CrossagentRoutingSection", () => ({ CrossagentRoutingSection: () => null }));
vi.mock("@/renderer/state/projectSettings/projectSettingsLoader", () => ({
  ensureProjectMcpServersLoaded: () => Promise.resolve(),
  loadAuthoritativeProjectMcpServers: () => Promise.resolve([]),
}));

import { McpServersSettings } from "./McpServersSettings";

describe("McpServersSettings project servers", () => {
  it("closes Settings and opens the chosen project's MCP settings", () => {
    useAppStore.setState({
      projects: [
        {
          id: "project-1",
          name: "Poracode",
          location: { kind: "posix", path: "/work/poracode" },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    usePanelStore.setState({ settingsOpen: true });

    renderWithI18n(<McpServersSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Open a project's MCP settings" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Poracode/u }));

    expect(usePanelStore.getState()).toMatchObject({
      settingsOpen: false,
      projectSettingsId: "project-1",
      projectSettingsSection: "mcp",
    });
  });
});
