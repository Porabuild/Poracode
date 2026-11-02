import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  McpOauthBeginPayload,
  McpOauthBeginResult,
  McpProbePayload,
  McpProbeResult,
  McpServer,
} from "@/shared/contracts";
import type { PoracodeBridge } from "@/shared/ipc";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ComposerAddMenu, type ComposerCustomMcpItem } from "./ComposerAddMenu";

const bridge = vi.hoisted(() => ({
  isRemoteSession: vi.fn<() => boolean>(() => false),
  probeMcpServer: vi.fn<(payload: McpProbePayload) => Promise<McpProbeResult>>(),
  getMcpOauthStatus: vi.fn<PoracodeBridge["getMcpOauthStatus"]>(),
  beginMcpServerOauth: vi.fn<(payload: McpOauthBeginPayload) => Promise<McpOauthBeginResult>>(),
  openExternalNative: vi.fn<PoracodeBridge["openExternalNative"]>(async () => undefined),
  waitMcpServerOauth: vi.fn<PoracodeBridge["waitMcpServerOauth"]>(async () => ({
    status: "authorized",
  })),
}));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: bridge.isRemoteSession,
  readBridge: () => bridge,
}));

const vercel: McpServer = {
  id: "vercel-id",
  name: "Vercel",
  description: "",
  enabled: true,
  timeoutMs: 30_000,
  transport: { type: "http", url: "https://mcp.vercel.com/", headers: {} },
};

const projectLocation = { kind: "windows" as const, path: "E:\\work\\project" };

const authRequired: McpProbeResult = {
  status: "auth-required",
  toolCount: 0,
  latencyMs: 5,
  environment: { runtime: "host", projectScoped: true },
  error: { code: "auth-required", message: "Authentication required", authScheme: "oauth" },
};

function vercelItem(overrides: Partial<ComposerCustomMcpItem> = {}): ComposerCustomMcpItem {
  return {
    id: "project:vercel-id",
    name: "Vercel",
    enabled: true,
    onToggle: vi.fn<(next: boolean) => void>(),
    oauth: { server: vercel, projectLocation },
    ...overrides,
  };
}

/**
 * Open the "+" menu and its MCP Servers list. The desktop flyout is opened from
 * the keyboard: a pointer-opened submenu closes on its hover timer in jsdom
 * before an async probe can settle.
 */
function openMcpServersMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Add attachment or capability" }));
  if (bridge.isRemoteSession()) {
    fireEvent.click(screen.getByText("MCP Servers"));
    return;
  }
  const trigger = screen.getByRole("menuitem", { name: /MCP Servers/ });
  act(() => {
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowRight" });
    fireEvent.keyUp(trigger, { key: "ArrowRight" });
  });
}

describe("ComposerAddMenu MCP sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.isRemoteSession.mockReturnValue(false);
    bridge.getMcpOauthStatus.mockResolvedValue({ authenticatedUrls: [] });
    bridge.probeMcpServer.mockResolvedValue(authRequired);
    bridge.beginMcpServerOauth.mockResolvedValue({
      status: "redirect",
      flowId: "flow-1",
      authorizationUrl: "https://vercel.com/oauth",
    });
  });

  it.each([false, true])(
    "offers sign-in for a server that needs OAuth and runs the flow (compact: %s)",
    async (compact) => {
      bridge.isRemoteSession.mockReturnValue(compact);
      render(
        <ComposerAddMenu
          mcpServers={[]}
          customMcpServers={[vercelItem()]}
          showFileOption={false}
          onPickFiles={vi.fn<() => void>()}
        />,
      );
      openMcpServersMenu();

      const signIn = await screen.findByRole(compact ? "button" : "menuitem", {
        name: "Sign in to Vercel",
      });
      expect(bridge.probeMcpServer).toHaveBeenCalledWith({ server: vercel, projectLocation });
      act(() => {
        fireEvent.click(within(signIn).getByText("Sign in to Vercel"));
      });

      await waitFor(() =>
        expect(bridge.beginMcpServerOauth).toHaveBeenCalledWith({ server: vercel }),
      );
      expect(bridge.openExternalNative).toHaveBeenCalledWith("https://vercel.com/oauth");
      // The desktop flyout stays open so the row can report progress.
      expect(screen.getByText("Vercel")).toBeInTheDocument();
    },
  );

  it("signs a remote project's server in on its paired host and Global ones locally", async () => {
    const remoteLocation = { kind: "posix" as const, path: "/srv/project", remoteServerId: "d1" };
    const context7: McpServer = {
      ...vercel,
      id: "context7-id",
      name: "context7",
      transport: { type: "http", url: "https://mcp.context7.test/", headers: {} },
    };
    render(
      <ComposerAddMenu
        mcpServers={[]}
        customMcpServers={[
          vercelItem({ oauth: { server: vercel, projectLocation: remoteLocation } }),
          {
            id: "user:context7-id",
            name: "context7",
            enabled: true,
            onToggle: vi.fn<(next: boolean) => void>(),
            oauth: { server: context7 },
          },
        ]}
        showFileOption={false}
        onPickFiles={vi.fn<() => void>()}
      />,
    );
    openMcpServersMenu();

    await screen.findByText("Sign in to context7");
    act(() => {
      fireEvent.click(screen.getByText("Sign in to Vercel"));
    });
    await waitFor(() =>
      expect(bridge.beginMcpServerOauth).toHaveBeenCalledWith({
        server: vercel,
        projectLocation: remoteLocation,
      }),
    );
    act(() => {
      fireEvent.click(screen.getByText("Sign in to context7"));
    });
    await waitFor(() =>
      expect(bridge.beginMcpServerOauth).toHaveBeenCalledWith({ server: context7 }),
    );
    expect(bridge.probeMcpServer).toHaveBeenCalledWith({
      server: vercel,
      projectLocation: remoteLocation,
    });
    expect(bridge.probeMcpServer).toHaveBeenCalledWith({ server: context7 });
    expect(bridge.getMcpOauthStatus).toHaveBeenCalledWith({ projectLocation: remoteLocation });
    expect(bridge.getMcpOauthStatus).toHaveBeenCalledWith({});
  });

  it("does not offer sign-in once the server's URL is authenticated", async () => {
    bridge.getMcpOauthStatus.mockResolvedValue({ authenticatedUrls: ["https://mcp.vercel.com/"] });
    render(
      <ComposerAddMenu
        mcpServers={[]}
        customMcpServers={[vercelItem()]}
        showFileOption={false}
        onPickFiles={vi.fn<() => void>()}
      />,
    );
    openMcpServersMenu();

    await waitFor(() => expect(bridge.getMcpOauthStatus).toHaveBeenCalled());
    await waitFor(() => expect(bridge.probeMcpServer).toHaveBeenCalled());
    expect(screen.queryByText("Sign in to Vercel")).not.toBeInTheDocument();
  });

  it("never probes disabled servers or read-only session bindings", async () => {
    const { unmount } = render(
      <ComposerAddMenu
        mcpServers={[]}
        customMcpServers={[vercelItem({ enabled: false })]}
        showFileOption={false}
        onPickFiles={vi.fn<() => void>()}
      />,
    );
    openMcpServersMenu();
    expect(screen.getByText("Vercel")).toBeInTheDocument();
    unmount();

    render(
      <ComposerAddMenu
        readOnly
        mcpServers={[]}
        customMcpServers={[vercelItem()]}
        showFileOption={false}
        onPickFiles={vi.fn<() => void>()}
      />,
    );
    openMcpServersMenu();
    expect(screen.getByText("Vercel")).toBeInTheDocument();

    await Promise.resolve();
    expect(bridge.probeMcpServer).not.toHaveBeenCalled();
    expect(screen.queryByText("Sign in to Vercel")).not.toBeInTheDocument();
  });
});
