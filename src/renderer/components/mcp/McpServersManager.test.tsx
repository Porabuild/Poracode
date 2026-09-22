import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUILT_IN_MCP_SERVER_TOOL_COUNTS,
  type BuiltInMcpServerId,
  type DiscoverExternalMcpServersPayload,
  type DiscoverExternalMcpServersResult,
  type McpProbePayload,
  type McpProbeResult,
  type McpServer,
  type McpOauthBeginPayload,
  type McpOauthBeginResult,
} from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { PoracodeBridge } from "@/shared/ipc";
import { toast } from "@heroui/react";
import { McpServersManager, type McpImportProjectTarget } from "./McpServersManager";

const bridge = vi.hoisted(() => ({
  platform: "win32",
  listWslDistros: vi.fn<() => Promise<string[]>>(),
  discoverExternalMcpServers:
    vi.fn<
      (payload: DiscoverExternalMcpServersPayload) => Promise<DiscoverExternalMcpServersResult>
    >(),
  probeMcpServer: vi.fn<(payload: McpProbePayload) => Promise<McpProbeResult>>(),
  getMcpOauthStatus: vi.fn<PoracodeBridge["getMcpOauthStatus"]>(async () => ({
    authenticatedUrls: [],
  })),
  beginMcpServerOauth: vi.fn<(payload: McpOauthBeginPayload) => Promise<McpOauthBeginResult>>(),
  openExternalNative: vi.fn<PoracodeBridge["openExternalNative"]>(async () => undefined),
  waitMcpServerOauth: vi.fn<PoracodeBridge["waitMcpServerOauth"]>(async () => ({
    status: "authorized",
  })),
  clearMcpServerOauth: vi.fn<PoracodeBridge["clearMcpServerOauth"]>(async () => undefined),
}));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: () => false,
  readBridge: () => bridge,
}));

const server: McpServer = {
  id: "memory-id",
  name: "memory",
  description: "Memory tools",
  enabled: true,
  timeoutMs: 30_000,
  transport: { type: "stdio", command: "npx", args: ["-y", "server-memory"], env: {} },
};

function managerElement(options: {
  userServers?: McpServer[];
  workspaceServers?: McpServer[];
  workspaceLoadServers?: () => Promise<McpServer[]>;
  workspaceSaveServers?: (servers: McpServer[]) => Promise<void>;
  defaultScope?: "user" | "workspace";
  projectLocation?: McpProbePayload["projectLocation"];
  projectIcon?: string;
  onUserChange?: (servers: McpServer[]) => void;
  onWorkspaceChange?: (servers: McpServer[]) => void;
  additionalProjects?: McpImportProjectTarget[];
  disabledBuiltIns?: Record<string, boolean>;
  disabledBuiltInTools?: Record<string, string[]>;
  managedBuiltIns?: Partial<Record<BuiltInMcpServerId, string>>;
  onBuiltInDisabledChange?: (id: string, disabled: boolean) => void;
  onBuiltInToolEnabledChange?: (id: BuiltInMcpServerId, tool: string, enabled: boolean) => void;
  includeCrossagentsSettings?: boolean;
}) {
  const {
    userServers = [],
    workspaceServers,
    workspaceLoadServers,
    workspaceSaveServers,
    defaultScope = "user",
    projectLocation,
    projectIcon,
    onUserChange = () => undefined,
    onWorkspaceChange = () => undefined,
    additionalProjects = [],
    disabledBuiltIns,
    disabledBuiltInTools,
    managedBuiltIns,
    onBuiltInDisabledChange,
    onBuiltInToolEnabledChange,
    includeCrossagentsSettings,
  } = options;
  const workspaceLocation = projectLocation ?? { kind: "windows" as const, path: "C:\\repo" };
  return (
    <McpServersManager
      sources={{
        user: {
          servers: userServers,
          // Tests assert through the change spy, mapped onto the required
          // awaitable save.
          saveServers: async (servers) => onUserChange(servers),
        },
        ...(workspaceServers
          ? {
              workspace: {
                servers: workspaceServers,
                ...(workspaceLoadServers ? { loadServers: workspaceLoadServers } : {}),
                saveServers:
                  workspaceSaveServers ?? (async (servers) => onWorkspaceChange(servers)),
                projectId: "p1",
                projectName: "Demo project",
                ...(projectLocation ? { projectLocation } : {}),
                ...(projectIcon ? { projectIcon } : {}),
              },
            }
          : {}),
      }}
      importProjects={
        workspaceServers
          ? [
              {
                id: "p1",
                name: "Demo project",
                location: workspaceLocation,
                ...(projectIcon ? { icon: projectIcon } : {}),
                servers: workspaceServers,
                ...(workspaceLoadServers ? { loadServers: workspaceLoadServers } : {}),
                saveServers:
                  workspaceSaveServers ?? (async (servers) => onWorkspaceChange(servers)),
              },
              ...additionalProjects,
            ]
          : additionalProjects
      }
      defaultScope={defaultScope}
      {...(disabledBuiltIns ? { disabledBuiltIns } : {})}
      {...(disabledBuiltInTools ? { disabledBuiltInTools } : {})}
      {...(managedBuiltIns ? { managedBuiltIns } : {})}
      {...(onBuiltInDisabledChange ? { onBuiltInDisabledChange } : {})}
      {...(onBuiltInToolEnabledChange ? { onBuiltInToolEnabledChange } : {})}
      {...(includeCrossagentsSettings
        ? {
            builtInSettings: {
              crossagents: {
                title: "Crossagents",
                actionLabel: "Crossagent routing guide",
                content: <div>Routing settings</div>,
              },
            },
          }
        : {})}
    />
  );
}

describe("McpServersManager", () => {
  beforeEach(() => {
    bridge.listWslDistros.mockReset();
    bridge.listWslDistros.mockResolvedValue([]);
    bridge.discoverExternalMcpServers.mockReset();
    bridge.discoverExternalMcpServers.mockResolvedValue({ groups: [] });
    bridge.probeMcpServer.mockReset();
    bridge.probeMcpServer.mockReturnValue(new Promise(() => undefined));
    bridge.getMcpOauthStatus.mockReset().mockResolvedValue({ authenticatedUrls: [] });
    bridge.beginMcpServerOauth.mockReset().mockResolvedValue({ status: "authorized" });
    bridge.openExternalNative.mockClear();
    bridge.waitMcpServerOauth.mockClear();
    bridge.clearMcpServerOauth.mockClear();
    useRemoteServersStore.setState({ servers: [], runtime: {} });
  });

  it("renders immutable built-ins separately from editable configured servers", () => {
    render(
      managerElement({
        userServers: [server],
        disabledBuiltIns: {},
        onBuiltInDisabledChange: () => undefined,
      }),
    );

    expect(screen.getByText("Configured MCP servers")).toBeInTheDocument();
    expect(screen.getByText("Built-in MCP servers")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit memory" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete memory" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Browser" })).not.toBeInTheDocument();
    const browserRow = document.querySelector('[data-built-in-mcp-server="browser"]');
    expect(browserRow).not.toBeNull();
    expect(
      within(browserRow as HTMLElement).getByRole("button", {
        name: `${BUILT_IN_MCP_SERVER_TOOL_COUNTS.browser} tools`,
      }),
    ).toBeInTheDocument();
  });

  it("identifies plugin-managed built-ins without exposing edit or delete controls", () => {
    render(
      managerElement({
        disabledBuiltIns: {},
        managedBuiltIns: { browser: "Browser" },
        onBuiltInDisabledChange: () => undefined,
      }),
    );

    const row = document.querySelector('[data-built-in-mcp-server="browser"]');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("Managed by Browser")).toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText("Built-in")).not.toBeInTheDocument();
    expect(
      within(row as HTMLElement).queryByRole("button", { name: "Edit Browser" }),
    ).not.toBeInTheDocument();
    expect(
      within(row as HTMLElement).queryByRole("button", { name: "Delete Browser" }),
    ).not.toBeInTheDocument();
    expect(
      within(row as HTMLElement).queryByRole("switch", { name: "Disable Browser" }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search MCP servers" }), {
      target: { value: "Browser" },
    });
    expect(document.querySelector('[data-built-in-mcp-server="browser"]')).not.toBeNull();
    expect(document.querySelector('[data-built-in-mcp-server="chrome"]')).toBeNull();
  });

  it("shows the built-in tool list from its tool count", () => {
    const onBuiltInToolEnabledChange =
      vi.fn<(id: BuiltInMcpServerId, tool: string, enabled: boolean) => void>();
    render(
      managerElement({
        disabledBuiltIns: {},
        disabledBuiltInTools: { "app-controls": ["delete_schedule"] },
        onBuiltInToolEnabledChange,
      }),
    );

    const row = document.querySelector('[data-built-in-mcp-server="app-controls"]');
    expect(row).not.toBeNull();
    fireEvent.click(
      within(row as HTMLElement).getByRole("button", {
        name: `${BUILT_IN_MCP_SERVER_TOOL_COUNTS["app-controls"]} tools`,
      }),
    );

    const dialog = screen.getByRole("dialog", { name: "Poracode" });
    expect(within(dialog).getByText("list_schedules")).toBeInTheDocument();
    expect(within(dialog).getByText("delete_schedule")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("switch", { name: "Enable delete_schedule" }));
    expect(onBuiltInToolEnabledChange).toHaveBeenCalledWith(
      "app-controls",
      "delete_schedule",
      true,
    );
  });

  it("hard-disables a built-in through the dedicated callback", () => {
    const onBuiltInDisabledChange = vi.fn<(id: string, disabled: boolean) => void>();
    render(
      managerElement({
        disabledBuiltIns: {},
        onBuiltInDisabledChange,
      }),
    );

    fireEvent.click(screen.getByRole("switch", { name: "Disable Browser" }));
    expect(onBuiltInDisabledChange).toHaveBeenCalledWith("browser", true);
  });

  it("opens Crossagents settings in a modal", () => {
    render(
      managerElement({
        disabledBuiltIns: {},
        includeCrossagentsSettings: true,
      }),
    );

    const row = document.querySelector('[data-built-in-mcp-server="crossagents"]');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).queryByText("Routing settings")).not.toBeInTheDocument();

    fireEvent.click(
      within(row as HTMLElement).getByRole("button", { name: "Crossagent routing guide" }),
    );

    const dialog = screen.getByRole("dialog", { name: "Crossagents" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Routing settings")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText("Close"));
    expect(screen.queryByRole("dialog", { name: "Crossagents" })).not.toBeInTheDocument();
  });

  it("probes an enabled server once and forwards the workspace location", async () => {
    const filteredServer = { ...server, disabledTools: ["write"] };
    const onWorkspaceChange = vi.fn<(servers: McpServer[]) => void>();
    bridge.probeMcpServer.mockResolvedValue({
      status: "available",
      toolCount: 3,
      tools: ["read", "write", "search"],
      latencyMs: 12,
      environment: { runtime: "host", projectScoped: true },
    });
    render(
      managerElement({
        workspaceServers: [filteredServer],
        onWorkspaceChange,
        defaultScope: "workspace",
        projectLocation: { kind: "windows", path: "C:\\repo" },
      }),
    );

    expect(await screen.findByText("Connected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "3 tools" }));
    expect(screen.getByRole("dialog", { name: "memory" })).toBeInTheDocument();
    expect(screen.getByText("write")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Enable write" }));
    // The row write applies against the fresh read, so it lands a microtask
    // after the click.
    await waitFor(() =>
      expect(onWorkspaceChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: server.id, disabledTools: [] }),
      ]),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!);
    expect(bridge.probeMcpServer).toHaveBeenCalledOnce();
    expect(bridge.probeMcpServer).toHaveBeenCalledWith({
      server: filteredServer,
      projectLocation: { kind: "windows", path: "C:\\repo" },
    });

    fireEvent.change(screen.getByRole("textbox", { name: "Search MCP servers" }), {
      target: { value: "memory" },
    });
    expect(bridge.probeMcpServer).toHaveBeenCalledOnce();
  });

  it("shows a disabled server without probing it", () => {
    render(managerElement({ userServers: [{ ...server, enabled: false }] }));

    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(bridge.probeMcpServer).not.toHaveBeenCalled();
  });

  it("shows authentication-required state without a fake zero tool count and retries", async () => {
    bridge.probeMcpServer.mockResolvedValueOnce({
      status: "auth-required",
      toolCount: 0,
      latencyMs: 8,
      environment: { runtime: "host", projectScoped: false },
      error: { code: "auth-required", message: "Authentication required", authScheme: "oauth" },
    });
    render(managerElement({ userServers: [server] }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Authentication required");
      expect(screen.getByRole("status")).toHaveTextContent(
        "This server requires authentication before Poracode can check it.",
      );
    });
    expect(screen.queryByText("0 tools")).not.toBeInTheDocument();

    bridge.probeMcpServer.mockResolvedValueOnce({
      status: "available",
      toolCount: 1,
      latencyMs: 7,
      environment: { runtime: "host", projectScoped: false },
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry memory" }));

    expect(await screen.findByText("1 tool")).toBeInTheDocument();
    expect(bridge.probeMcpServer).toHaveBeenCalledTimes(2);
  });

  it("scopes workspace OAuth to the remote project's host", async () => {
    const projectLocation = {
      kind: "posix" as const,
      path: "/remote/project",
      remoteServerId: "d1",
    };
    const remoteServer: McpServer = {
      ...server,
      transport: { type: "http", url: "https://mcp.example.test", headers: {} },
    };
    bridge.probeMcpServer.mockResolvedValue({
      status: "auth-required",
      toolCount: 0,
      latencyMs: 8,
      environment: { runtime: "host", projectScoped: true },
      error: { code: "auth-required", message: "Authentication required", authScheme: "oauth" },
    });

    render(
      managerElement({
        workspaceServers: [remoteServer],
        defaultScope: "workspace",
        projectLocation,
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Authenticate" }));
    await waitFor(() =>
      expect(bridge.beginMcpServerOauth).toHaveBeenCalledWith({
        server: remoteServer,
        projectLocation,
      }),
    );
    expect(bridge.getMcpOauthStatus).toHaveBeenCalledWith({ projectLocation });
  });

  it("shows a localized unavailable error without a fake zero tool count", async () => {
    bridge.probeMcpServer.mockResolvedValue({
      status: "unavailable",
      toolCount: 0,
      latencyMs: 30_000,
      environment: { runtime: "host", projectScoped: false },
      error: { code: "timeout", message: "Timed out" },
    });
    render(managerElement({ userServers: [server] }));

    expect(await screen.findByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText("Connection timed out.")).toBeInTheDocument();
    expect(screen.queryByText("0 tools")).not.toBeInTheDocument();
  });

  it("ignores an older probe response after the server configuration changes", async () => {
    let resolveFirst!: (result: McpProbeResult) => void;
    let resolveSecond!: (result: McpProbeResult) => void;
    bridge.probeMcpServer
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockReturnValueOnce(new Promise((resolve) => (resolveSecond = resolve)));
    const { rerender } = render(managerElement({ userServers: [server] }));
    await waitFor(() => expect(bridge.probeMcpServer).toHaveBeenCalledOnce());

    const changedServer: McpServer = {
      ...server,
      transport: { type: "stdio", command: "node", args: ["-y", "server-memory"], env: {} },
    };
    rerender(managerElement({ userServers: [changedServer] }));
    await waitFor(() => expect(bridge.probeMcpServer).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolveSecond({
        status: "available",
        toolCount: 4,
        latencyMs: 5,
        environment: { runtime: "host", projectScoped: false },
      });
    });
    expect(screen.getByText("4 tools")).toBeInTheDocument();

    await act(async () => {
      resolveFirst({
        status: "auth-required",
        toolCount: 0,
        latencyMs: 10,
        environment: { runtime: "host", projectScoped: false },
        error: { code: "auth-required", message: "Authentication required" },
      });
    });
    expect(screen.getByText("4 tools")).toBeInTheDocument();
    expect(screen.queryByText("Authentication required")).not.toBeInTheDocument();
  });

  it("imports a discovered server into the exact Workspace source", async () => {
    const onWorkspaceChange = vi.fn<(servers: McpServer[]) => void>();
    const projectLocation = { kind: "windows" as const, path: "C:\\repo" };
    bridge.discoverExternalMcpServers.mockResolvedValue({
      groups: [
        {
          providerId: "codex",
          providerLabel: "Codex CLI",
          sourcePath: "C:\\repo\\.codex\\config.toml",
          servers: [
            {
              id: "external-memory",
              name: "project-memory",
              enabled: true,
              timeoutMs: 30_000,
              transport: { type: "stdio", command: "node", args: [], env: {} },
            },
          ],
        },
      ],
    });
    render(
      managerElement({
        workspaceServers: [],
        defaultScope: "workspace",
        projectLocation,
        onWorkspaceChange,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Import MCP servers" }));
    expect(await screen.findByText("Codex CLI")).toBeInTheDocument();
    expect(bridge.discoverExternalMcpServers).toHaveBeenCalledWith({
      sourceScope: "workspace",
      projectLocation,
    });
    fireEvent.click(screen.getByRole("button", { name: "Show MCP servers from Codex CLI" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select project-memory from Codex CLI" }));
    fireEvent.click(screen.getByRole("button", { name: "Import to Demo project" }));

    // The import commits through the persist helper, so the write lands a
    // microtask after the click.
    await waitFor(() =>
      expect(onWorkspaceChange).toHaveBeenCalledExactlyOnceWith([
        expect.objectContaining({
          id: expect.any(String),
          name: "project-memory",
        }),
      ]),
    );
  });

  it("imports against the authoritative target list when the projection was never loaded", async () => {
    const onWorkspaceChange = vi.fn<(servers: McpServer[]) => void>();
    // The catalog row projects nothing, but the host holds a real
    // configuration that only an authoritative read can see.
    const hostConfigured: McpServer = {
      id: "existing-id",
      name: "host-configured",
      description: "",
      enabled: true,
      timeoutMs: 30_000,
      transport: { type: "http", url: "http://127.0.0.1:9/mcp", headers: {} },
    };
    const loadServers = vi.fn<() => Promise<McpServer[]>>(async () => [hostConfigured]);
    bridge.discoverExternalMcpServers.mockResolvedValue({
      groups: [
        {
          providerId: "codex",
          providerLabel: "Codex CLI",
          sourcePath: "C:\\repo\\.codex\\config.toml",
          servers: [
            {
              id: "external-memory",
              name: "project-memory",
              enabled: true,
              timeoutMs: 30_000,
              transport: { type: "stdio", command: "node", args: [], env: {} },
            },
          ],
        },
      ],
    });
    render(
      managerElement({
        workspaceServers: [],
        workspaceLoadServers: loadServers,
        defaultScope: "workspace",
        onWorkspaceChange,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Import MCP servers" }));
    expect(await screen.findByText("Codex CLI")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show MCP servers from Codex CLI" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select project-memory from Codex CLI" }));
    fireEvent.click(screen.getByRole("button", { name: "Import to Demo project" }));

    await waitFor(() =>
      expect(onWorkspaceChange).toHaveBeenCalledExactlyOnceWith([
        hostConfigured,
        expect.objectContaining({ name: "project-memory" }),
      ]),
    );
    expect(loadServers).toHaveBeenCalledTimes(1);
  });

  it("an authoritative read refusal aborts the import instead of erasing the target", async () => {
    const onWorkspaceChange = vi.fn<(servers: McpServer[]) => void>();
    const loadServers = vi.fn<() => Promise<McpServer[]>>(async () => {
      throw new Error("loopback offline");
    });
    bridge.discoverExternalMcpServers.mockResolvedValue({
      groups: [
        {
          providerId: "codex",
          providerLabel: "Codex CLI",
          sourcePath: "C:\\repo\\.codex\\config.toml",
          servers: [
            {
              id: "external-memory",
              name: "project-memory",
              enabled: true,
              timeoutMs: 30_000,
              transport: { type: "stdio", command: "node", args: [], env: {} },
            },
          ],
        },
      ],
    });
    render(
      managerElement({
        workspaceServers: [],
        workspaceLoadServers: loadServers,
        defaultScope: "workspace",
        onWorkspaceChange,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Import MCP servers" }));
    expect(await screen.findByText("Codex CLI")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show MCP servers from Codex CLI" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select project-memory from Codex CLI" }));
    fireEvent.click(screen.getByRole("button", { name: "Import to Demo project" }));

    await waitFor(() => expect(loadServers).toHaveBeenCalledTimes(1));
    // A tiny settle so the async commit path has rejected before asserting.
    await act(async () => {});
    expect(onWorkspaceChange).not.toHaveBeenCalled();
  });

  it("moves between project destinations only after both authoritative reads succeed", async () => {
    const onWorkspaceChange = vi.fn<(servers: McpServer[]) => void>();
    const onOtherChange = vi.fn<(servers: McpServer[]) => void>();
    const sourceLoad = vi.fn<() => Promise<McpServer[]>>(async () => [server]);
    const targetLoad = vi.fn<() => Promise<McpServer[]>>(async () => []);
    render(
      managerElement({
        workspaceServers: [server],
        workspaceLoadServers: sourceLoad,
        defaultScope: "workspace",
        onWorkspaceChange,
        additionalProjects: [
          {
            id: "p2",
            name: "Second project",
            location: { kind: "windows", path: "C:\\other" },
            servers: [],
            loadServers: targetLoad,
            saveServers: async (servers) => onOtherChange(servers),
          },
        ],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit memory" }));
    fireEvent.click(screen.getByRole("button", { name: "Scope" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Second project/u }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Edit MCP server" })).getByRole("button", {
        name: "Save",
      }),
    );

    // Both reads ran before either write; the server left the source list and
    // arrived on the target list. Two independent saves, not one transaction.
    await waitFor(() => {
      expect(onOtherChange).toHaveBeenCalledExactlyOnceWith([server]);
      expect(onWorkspaceChange).toHaveBeenCalledExactlyOnceWith([]);
    });
    // The source is read twice: the preflight before the first write, and the
    // refresh after the destination confirmed — the preflight snapshot can go
    // stale while a slow destination save is in flight.
    expect(sourceLoad).toHaveBeenCalledTimes(2);
    expect(targetLoad).toHaveBeenCalledTimes(1);
  });

  it("a refused source read aborts a move instead of stranding a half-applied copy", async () => {
    const onWorkspaceChange = vi.fn<(servers: McpServer[]) => void>();
    const onOtherChange = vi.fn<(servers: McpServer[]) => void>();
    const sourceLoad = vi.fn<() => Promise<McpServer[]>>(async () => {
      throw new Error("loopback offline");
    });
    const targetLoad = vi.fn<() => Promise<McpServer[]>>(async () => []);
    render(
      managerElement({
        workspaceServers: [server],
        workspaceLoadServers: sourceLoad,
        defaultScope: "workspace",
        onWorkspaceChange,
        additionalProjects: [
          {
            id: "p2",
            name: "Second project",
            location: { kind: "windows", path: "C:\\other" },
            servers: [],
            loadServers: targetLoad,
            saveServers: async (servers) => onOtherChange(servers),
          },
        ],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit memory" }));
    fireEvent.click(screen.getByRole("button", { name: "Scope" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Second project/u }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Edit MCP server" })).getByRole("button", {
        name: "Save",
      }),
    );

    // The target read preflighted fine, but refusing the source read must
    // leave BOTH lists untouched — the target was never written.
    await waitFor(() => expect(sourceLoad).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(targetLoad).toHaveBeenCalledTimes(1);
    expect(onOtherChange).not.toHaveBeenCalled();
    expect(onWorkspaceChange).not.toHaveBeenCalled();
  });

  it("removes a moved server from its source only after the destination save confirms", async () => {
    const onWorkspaceChange = vi.fn<(servers: McpServer[]) => void>();
    let acceptTarget!: () => void;
    // The destination save is a real promise seam held open until the "host"
    // accepts — the state every host round-trip passes through.
    const targetSave = vi.fn<(servers: McpServer[]) => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          acceptTarget = resolve;
        }),
    );
    const sourceLoad = vi.fn<() => Promise<McpServer[]>>(async () => [server]);
    const targetLoad = vi.fn<() => Promise<McpServer[]>>(async () => []);
    render(
      managerElement({
        workspaceServers: [server],
        workspaceLoadServers: sourceLoad,
        defaultScope: "workspace",
        onWorkspaceChange,
        additionalProjects: [
          {
            id: "p2",
            name: "Second project",
            location: { kind: "windows", path: "C:\\other" },
            servers: [],
            loadServers: targetLoad,
            saveServers: targetSave,
          },
        ],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit memory" }));
    fireEvent.click(screen.getByRole("button", { name: "Scope" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Second project/u }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Edit MCP server" })).getByRole("button", {
        name: "Save",
      }),
    );

    // The destination save is dispatched but unconfirmed: the source list must
    // not lose the server while the move's destructive half is still pending.
    await act(async () => {});
    await act(async () => {});
    expect(targetSave).toHaveBeenCalledTimes(1);
    expect(onWorkspaceChange).not.toHaveBeenCalled();

    acceptTarget();
    await waitFor(() => expect(onWorkspaceChange).toHaveBeenCalledExactlyOnceWith([]));
    expect(targetSave).toHaveBeenCalledWith([server]);
    expect(screen.queryByRole("dialog", { name: "Edit MCP server" })).not.toBeInTheDocument();
  });

  it("a rejected destination save keeps the source list and the editor open", async () => {
    const toastDanger = vi.spyOn(toast, "danger");
    const onWorkspaceChange = vi.fn<(servers: McpServer[]) => void>();
    // The shape the host produces for moving a «redacted» server to a project
    // without the matching secret: the destination update is refused.
    const targetSave = vi.fn<(servers: McpServer[]) => Promise<void>>(async () => {
      throw new Error("mcp_redaction_without_existing_secret: destination refused the save");
    });
    const sourceLoad = vi.fn<() => Promise<McpServer[]>>(async () => [server]);
    const targetLoad = vi.fn<() => Promise<McpServer[]>>(async () => []);
    render(
      managerElement({
        workspaceServers: [server],
        workspaceLoadServers: sourceLoad,
        defaultScope: "workspace",
        onWorkspaceChange,
        additionalProjects: [
          {
            id: "p2",
            name: "Second project",
            location: { kind: "windows", path: "C:\\other" },
            servers: [],
            loadServers: targetLoad,
            saveServers: targetSave,
          },
        ],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit memory" }));
    fireEvent.click(screen.getByRole("button", { name: "Scope" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Second project/u }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Edit MCP server" })).getByRole("button", {
        name: "Save",
      }),
    );

    // The destination refused: the source must keep the server, the editor
    // must stay open for a retry, and the failure is surfaced exactly once.
    await act(async () => {});
    await act(async () => {});
    expect(targetSave).toHaveBeenCalledTimes(1);
    expect(onWorkspaceChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Edit MCP server" })).toBeInTheDocument();
    expect(toastDanger).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("destination refused the save"),
    );
    toastDanger.mockRestore();
  });

  it("keeps the source copy when its removal fails after the destination confirmed", async () => {
    const toastDanger = vi.spyOn(toast, "danger");
    const onWorkspaceChange = vi.fn<(servers: McpServer[]) => void>();
    const onOtherChange = vi.fn<(servers: McpServer[]) => void>();
    const sourceSave = vi.fn<(servers: McpServer[]) => Promise<void>>(async () => {
      throw new Error("source refused the removal");
    });
    const sourceLoad = vi.fn<() => Promise<McpServer[]>>(async () => [server]);
    render(
      managerElement({
        workspaceServers: [server],
        workspaceLoadServers: sourceLoad,
        workspaceSaveServers: sourceSave,
        defaultScope: "workspace",
        onWorkspaceChange,
        additionalProjects: [
          {
            id: "p2",
            name: "Second project",
            location: { kind: "windows", path: "C:\\other" },
            servers: [],
            saveServers: async (servers) => onOtherChange(servers),
          },
        ],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit memory" }));
    fireEvent.click(screen.getByRole("button", { name: "Scope" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Second project/u }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Edit MCP server" })).getByRole("button", {
        name: "Save",
      }),
    );

    // The destination confirmed, but the source removal was refused: the move
    // is not atomic, so the honest failure is a duplicate — the source keeps
    // its copy — never a loss. The editor closes (the destination holds the
    // server) and the refusal is surfaced exactly once.
    await act(async () => {});
    await act(async () => {});
    expect(onOtherChange).toHaveBeenCalledExactlyOnceWith([server]);
    expect(sourceSave).toHaveBeenCalledTimes(1);
    expect(onWorkspaceChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Edit MCP server" })).not.toBeInTheDocument();
    expect(toastDanger).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("source refused the removal"),
    );
    toastDanger.mockRestore();
  });

  it("keeps another client's server and the row's latest fields when toggling", async () => {
    const teammate: McpServer = { ...server, id: "teammate-id", name: "teammate" };
    const onWorkspaceChange = vi.fn<(servers: McpServer[]) => void>();
    const sourceSave = vi.fn<(servers: McpServer[]) => Promise<void>>(async () => undefined);
    // Another client added a server and retuned the row's timeout after this
    // page rendered: the fresh read carries both, the display list does not.
    const sourceLoad = vi.fn<() => Promise<McpServer[]>>(async () => [
      { ...server, timeoutMs: 99 },
      teammate,
    ]);
    render(
      managerElement({
        workspaceServers: [server],
        workspaceLoadServers: sourceLoad,
        workspaceSaveServers: sourceSave,
        defaultScope: "workspace",
        onWorkspaceChange,
      }),
    );

    fireEvent.click(screen.getByRole("switch", { name: "Disable memory" }));
    await act(async () => {});

    expect(sourceSave).toHaveBeenCalledExactlyOnceWith([
      { ...server, timeoutMs: 99, enabled: false },
      teammate,
    ]);
    expect(onWorkspaceChange).not.toHaveBeenCalled();
  });

  it("keeps another client's server when deleting a row", async () => {
    const teammate: McpServer = { ...server, id: "teammate-id", name: "teammate" };
    const onWorkspaceChange = vi.fn<(servers: McpServer[]) => void>();
    const sourceSave = vi.fn<(servers: McpServer[]) => Promise<void>>(async () => undefined);
    const sourceLoad = vi.fn<() => Promise<McpServer[]>>(async () => [server, teammate]);
    render(
      managerElement({
        workspaceServers: [server],
        workspaceLoadServers: sourceLoad,
        workspaceSaveServers: sourceSave,
        defaultScope: "workspace",
        onWorkspaceChange,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete memory" }));
    await act(async () => {});

    expect(sourceSave).toHaveBeenCalledExactlyOnceWith([teammate]);
    expect(onWorkspaceChange).not.toHaveBeenCalled();
  });

  it("applies a tool toggle against the fresh row and keeps another client's server", async () => {
    const teammate: McpServer = { ...server, id: "teammate-id", name: "teammate" };
    const onWorkspaceChange = vi.fn<(servers: McpServer[]) => void>();
    const sourceSave = vi.fn<(servers: McpServer[]) => Promise<void>>(async () => undefined);
    // The fresh row disabled "alpha" and retuned the timeout after this page
    // rendered; the display copy disabled "beta" and never saw the teammate.
    const sourceLoad = vi.fn<() => Promise<McpServer[]>>(async () => [
      { ...server, disabledTools: ["alpha"], timeoutMs: 99 },
      teammate,
    ]);
    bridge.probeMcpServer.mockResolvedValue({
      status: "available",
      toolCount: 2,
      tools: ["alpha", "beta"],
      latencyMs: 3,
      environment: { runtime: "host", projectScoped: false },
    });
    render(
      managerElement({
        workspaceServers: [server],
        workspaceLoadServers: sourceLoad,
        workspaceSaveServers: sourceSave,
        defaultScope: "workspace",
        onWorkspaceChange,
      }),
    );
    await waitFor(() => expect(bridge.probeMcpServer).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "2 tools" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "memory" })).getByRole("switch", {
        name: "Disable beta",
      }),
    );
    await act(async () => {});

    expect(sourceSave).toHaveBeenCalledExactlyOnceWith([
      { ...server, disabledTools: ["alpha", "beta"], timeoutMs: 99 },
      teammate,
    ]);
    expect(onWorkspaceChange).not.toHaveBeenCalled();
  });

  it("does not resurrect a row that another client already removed", async () => {
    const onWorkspaceChange = vi.fn<(servers: McpServer[]) => void>();
    const toastDanger = vi.spyOn(toast, "danger");
    const sourceSave = vi.fn<(servers: McpServer[]) => Promise<void>>(async () => undefined);
    const sourceLoad = vi.fn<() => Promise<McpServer[]>>(async () => []);
    render(
      managerElement({
        workspaceServers: [server],
        workspaceLoadServers: sourceLoad,
        workspaceSaveServers: sourceSave,
        defaultScope: "workspace",
        onWorkspaceChange,
      }),
    );

    fireEvent.click(screen.getByRole("switch", { name: "Disable memory" }));
    await act(async () => {});

    expect(sourceSave).not.toHaveBeenCalled();
    expect(onWorkspaceChange).not.toHaveBeenCalled();
    expect(toastDanger).not.toHaveBeenCalled();
    toastDanger.mockRestore();
  });

  it("a refused fresh read blocks the row write instead of saving the stale display list", async () => {
    const onWorkspaceChange = vi.fn<(servers: McpServer[]) => void>();
    const toastDanger = vi.spyOn(toast, "danger");
    const sourceSave = vi.fn<(servers: McpServer[]) => Promise<void>>(async () => undefined);
    const sourceLoad = vi.fn<() => Promise<McpServer[]>>(async () => {
      throw new Error("loopback offline");
    });
    render(
      managerElement({
        workspaceServers: [server],
        workspaceLoadServers: sourceLoad,
        workspaceSaveServers: sourceSave,
        defaultScope: "workspace",
        onWorkspaceChange,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete memory" }));
    await act(async () => {});

    expect(sourceSave).not.toHaveBeenCalled();
    expect(onWorkspaceChange).not.toHaveBeenCalled();
    expect(toastDanger).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("loopback offline"),
    );
    toastDanger.mockRestore();
  });

  it("keeps a server another client added to the source while the destination save was in flight", async () => {
    const teammate: McpServer = { ...server, id: "teammate-id", name: "teammate" };
    const onWorkspaceChange = vi.fn<(servers: McpServer[]) => void>();
    let acceptTarget!: () => void;
    const targetSave = vi.fn<(servers: McpServer[]) => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          acceptTarget = resolve;
        }),
    );
    // First call is the preflight read; the second is the post-confirmation
    // refresh — the teammate's addition lands in the window where the
    // destination save was slow.
    const sourceLoad = vi
      .fn<() => Promise<McpServer[]>>()
      .mockResolvedValueOnce([server])
      .mockResolvedValueOnce([server, teammate]);
    const targetLoad = vi.fn<() => Promise<McpServer[]>>(async () => []);
    render(
      managerElement({
        workspaceServers: [server],
        workspaceLoadServers: sourceLoad,
        defaultScope: "workspace",
        onWorkspaceChange,
        additionalProjects: [
          {
            id: "p2",
            name: "Second project",
            location: { kind: "windows", path: "C:\\other" },
            servers: [],
            loadServers: targetLoad,
            saveServers: targetSave,
          },
        ],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit memory" }));
    fireEvent.click(screen.getByRole("button", { name: "Scope" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Second project/u }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Edit MCP server" })).getByRole("button", {
        name: "Save",
      }),
    );

    // The destination save is unconfirmed: the source list must not change yet.
    await act(async () => {});
    await act(async () => {});
    expect(targetSave).toHaveBeenCalledTimes(1);
    expect(onWorkspaceChange).not.toHaveBeenCalled();

    acceptTarget();
    // The removal runs against the refreshed read and removes only the moved
    // id — the teammate's addition survives the move.
    await waitFor(() => expect(onWorkspaceChange).toHaveBeenCalledExactlyOnceWith([teammate]));
    expect(screen.queryByRole("dialog", { name: "Edit MCP server" })).not.toBeInTheDocument();
  });

  it("keeps the source copy when the post-confirmation source refresh fails", async () => {
    const toastDanger = vi.spyOn(toast, "danger");
    const onWorkspaceChange = vi.fn<(servers: McpServer[]) => void>();
    const onOtherChange = vi.fn<(servers: McpServer[]) => void>();
    const sourceSave = vi.fn<(servers: McpServer[]) => Promise<void>>(async () => undefined);
    const sourceLoad = vi
      .fn<() => Promise<McpServer[]>>()
      .mockResolvedValueOnce([server])
      .mockRejectedValueOnce(new Error("source refresh failed"));
    render(
      managerElement({
        workspaceServers: [server],
        workspaceLoadServers: sourceLoad,
        workspaceSaveServers: sourceSave,
        defaultScope: "workspace",
        onWorkspaceChange,
        additionalProjects: [
          {
            id: "p2",
            name: "Second project",
            location: { kind: "windows", path: "C:\\other" },
            servers: [],
            saveServers: async (servers) => onOtherChange(servers),
          },
        ],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit memory" }));
    fireEvent.click(screen.getByRole("button", { name: "Scope" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Second project/u }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Edit MCP server" })).getByRole("button", {
        name: "Save",
      }),
    );

    // The destination confirmed, but the refreshed source read failed: the
    // source keeps its copy (a safe duplicate) and nothing was written to it.
    await act(async () => {});
    await act(async () => {});
    expect(onOtherChange).toHaveBeenCalledExactlyOnceWith([server]);
    expect(sourceSave).not.toHaveBeenCalled();
    expect(onWorkspaceChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Edit MCP server" })).not.toBeInTheDocument();
    expect(toastDanger).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("source refresh failed"),
    );
    toastDanger.mockRestore();
  });

  it("opens the form and JSON editor in a modal without replacing the server list", () => {
    render(managerElement({ workspaceServers: [], defaultScope: "workspace" }));

    fireEvent.click(screen.getByRole("button", { name: "Add MCP server" }));
    expect(screen.getByRole("dialog", { name: "New MCP server" })).toBeInTheDocument();
    expect(screen.getByText("No configured MCP servers yet")).toBeInTheDocument();
    expect(screen.getByLabelText("Scope")).toHaveTextContent("Demo project");
    fireEvent.click(screen.getByRole("tab", { name: "JSON" }));
    const jsonEditor = screen.getByRole("textbox", { name: "Full configuration" });
    expect(jsonEditor).toBeInTheDocument();
    fireEvent.change(jsonEditor, {
      target: { value: JSON.stringify({ memory: { command: "node", cwd: "C:\\repo" } }) },
    });
    fireEvent.click(screen.getByRole("tab", { name: "Form" }));
    fireEvent.click(screen.getByRole("tab", { name: "JSON" }));
    expect(
      screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Full configuration" }).value,
    ).toContain('"cwd": "C:\\\\repo"');
  });

  it("identifies a remote project by its host in the scope trigger and menu", async () => {
    useRemoteServersStore.setState({
      servers: [{ desktopId: "d1", label: "Poracode on MacBook 16" }],
      runtime: { d1: { status: "online", projects: [], threads: [] } },
    } as never);
    render(
      managerElement({
        workspaceServers: [],
        defaultScope: "workspace",
        projectIcon: "file:public/favicon.png",
        projectLocation: {
          kind: "posix",
          path: "/remote/project",
          remoteServerId: "d1",
        },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Add MCP server" }));
    const scope = screen.getByLabelText("Scope");
    expect(scope).toHaveTextContent("Demo projectMacBook 16");
    expect(scope.querySelector(".lucide-server")).not.toBeNull();

    fireEvent.click(scope);
    const option = await screen.findByRole("menuitemradio", { name: /Demo project.*MacBook 16/u });
    expect(option.querySelector(".lucide-server")).not.toBeNull();
    expect(option).not.toHaveTextContent("/remote/project");
  });

  it("dismisses the modal with Escape", () => {
    render(managerElement({}));

    fireEvent.click(screen.getByRole("button", { name: "Add MCP server" }));
    expect(screen.getByRole("dialog", { name: "New MCP server" })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
    expect(screen.queryByRole("dialog", { name: "New MCP server" })).not.toBeInTheDocument();
  });

  it("opens an existing server in the edit modal", () => {
    render(managerElement({ userServers: [server] }));

    fireEvent.click(screen.getByRole("button", { name: "Edit memory" }));
    expect(screen.getByRole("dialog", { name: "Edit MCP server" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("memory");
  });

  it("keeps invalid partial form input while switching editor modes", () => {
    render(managerElement({}));

    fireEvent.click(screen.getByRole("button", { name: "Add MCP server" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "memory" },
    });
    fireEvent.click(screen.getByRole("tab", { name: "JSON" }));
    expect(screen.getByRole("textbox", { name: "Full configuration" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Form" }));
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("memory");
  });

  it("lists projects after Global and saves a new server only to the selected project", async () => {
    const onUserChange = vi.fn<(servers: McpServer[]) => void>();
    const onWorkspaceChange = vi.fn<(servers: McpServer[]) => void>();
    render(
      managerElement({
        workspaceServers: [],
        onUserChange,
        onWorkspaceChange,
        additionalProjects: [
          {
            id: "p2",
            name: "Second project",
            location: {
              kind: "wsl",
              distro: "Ubuntu",
              linuxPath: "/home/demo/second",
              uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\second",
            },
            servers: [],
            saveServers: async () => undefined,
          },
        ],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Add MCP server" }));
    const scope = screen.getByLabelText("Scope");
    expect(scope).toHaveTextContent("Global");
    fireEvent.click(scope);
    const options = await screen.findAllByRole("menuitemradio");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveAccessibleName("Global");
    expect(options[1]).toHaveAccessibleName(/^Demo project/u);
    expect(options[2]).toHaveAccessibleName(/^Second project/u);
    expect(within(options[2]!).getByText("WSL")).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "Workspace" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitemradio", { name: /^Demo project/u }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "workspace-memory" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Command" }), {
      target: { value: "node" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onUserChange).not.toHaveBeenCalled();
    // The save commits through the persist helper, so it lands a microtask
    // after the click.
    await waitFor(() =>
      expect(onWorkspaceChange).toHaveBeenCalledExactlyOnceWith([
        expect.objectContaining({
          name: "workspace-memory",
          transport: { type: "stdio", command: "node", args: [], env: {} },
        }),
      ]),
    );
  });

  it("moves an existing project server to Global and preserves its id", async () => {
    const onUserChange = vi.fn<(servers: McpServer[]) => void>();
    const onWorkspaceChange = vi.fn<(servers: McpServer[]) => void>();
    render(
      managerElement({
        workspaceServers: [server],
        defaultScope: "workspace",
        onUserChange,
        onWorkspaceChange,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit memory" }));
    const scope = screen.getByLabelText("Scope");
    expect(scope).toHaveTextContent("Demo project");
    fireEvent.click(scope);
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Global" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // The Global destination persists through the shared-settings write, and
    // the source removal is sequenced behind it.
    await waitFor(() => {
      expect(onUserChange).toHaveBeenCalledExactlyOnceWith([
        expect.objectContaining({ id: server.id, name: server.name }),
      ]);
      expect(onWorkspaceChange).toHaveBeenCalledExactlyOnceWith([]);
    });
  });

  it("probes User servers without a project location and Workspace servers with one", async () => {
    const workspaceServer: McpServer = {
      ...server,
      id: "workspace-memory-id",
      name: "workspace-memory",
    };
    const projectLocation = { kind: "windows" as const, path: "C:\\repo" };
    bridge.probeMcpServer.mockResolvedValue({
      status: "available",
      toolCount: 2,
      latencyMs: 4,
      environment: { runtime: "host", projectScoped: false },
    });

    render(
      managerElement({
        userServers: [server],
        workspaceServers: [workspaceServer],
        projectLocation,
      }),
    );

    await waitFor(() => expect(bridge.probeMcpServer).toHaveBeenCalledTimes(2));
    expect(bridge.probeMcpServer).toHaveBeenCalledWith({ server });
    expect(bridge.probeMcpServer).toHaveBeenCalledWith({
      server: workspaceServer,
      projectLocation,
    });
  });
});
