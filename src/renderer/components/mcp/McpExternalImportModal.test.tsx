import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DiscoverExternalMcpServersPayload,
  DiscoverExternalMcpServersResult,
  McpExternalServerCandidate,
  McpExternalServerGroup,
  McpServer,
} from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { McpExternalImportModal, type McpImportDestination } from "./McpExternalImportModal";

const bridge = vi.hoisted(() => ({
  platform: "win32" as string,
  listWslDistros: vi.fn<() => Promise<string[]>>(),
  discoverExternalMcpServers:
    vi.fn<
      (payload: DiscoverExternalMcpServersPayload) => Promise<DiscoverExternalMcpServersResult>
    >(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

type TestCandidate = McpExternalServerCandidate & {
  unsupportedReason?: "authentication" | "tool-restrictions" | "sensitive-values";
};

function candidate(
  id: string,
  name: string,
  unsupportedReason?: TestCandidate["unsupportedReason"],
): TestCandidate {
  return {
    id,
    name,
    enabled: true,
    timeoutMs: 30_000,
    transport: { type: "stdio", command: "node", args: [name], env: {} },
    ...(unsupportedReason ? { unsupportedReason } : {}),
  };
}

function group(
  providerId: string,
  providerLabel: string,
  sourcePath: string,
  servers: McpExternalServerCandidate[],
): McpExternalServerGroup {
  return { providerId, providerLabel, sourcePath, servers };
}

const projectLocation = { kind: "windows" as const, path: "C:\\repo" };
const secondProjectLocation = { kind: "windows" as const, path: "C:\\other" };

function renderModal(options?: {
  defaultProjectId?: string;
  userServers?: McpServer[];
  projectServers?: McpServer[];
  includeProjects?: boolean;
  onImport?: (destination: McpImportDestination, servers: McpServer[]) => void;
  onOpenChange?: (isOpen: boolean) => void;
}) {
  const includeProjects = options?.includeProjects ?? false;
  return render(
    <McpExternalImportModal
      isOpen
      {...(options?.defaultProjectId ? { defaultProjectId: options.defaultProjectId } : {})}
      userServers={options?.userServers ?? []}
      projects={
        includeProjects
          ? [
              {
                id: "p1",
                name: "Demo project",
                location: projectLocation,
                servers: options?.projectServers ?? [],
              },
              {
                id: "p2",
                name: "Other project",
                location: secondProjectLocation,
                servers: [],
              },
            ]
          : []
      }
      onImport={options?.onImport ?? (() => undefined)}
      onOpenChange={options?.onOpenChange ?? (() => undefined)}
    />,
  );
}

describe("McpExternalImportModal", () => {
  beforeEach(() => {
    bridge.platform = "win32";
    bridge.listWslDistros.mockReset();
    bridge.listWslDistros.mockResolvedValue([]);
    bridge.discoverExternalMcpServers.mockReset();
    bridge.discoverExternalMcpServers.mockResolvedValue({ groups: [] });
  });

  it("discovers grouped global servers and imports selected candidates with canonical ids", async () => {
    const onImport = vi.fn<(destination: McpImportDestination, servers: McpServer[]) => void>();
    const onOpenChange = vi.fn<(isOpen: boolean) => void>();
    bridge.discoverExternalMcpServers.mockResolvedValue({
      groups: [
        group("codex", "Codex CLI", "C:\\Users\\demo\\.codex\\config.toml", [
          candidate("codex:node", "node_repl"),
        ]),
      ],
    });

    renderModal({ onImport, onOpenChange });

    expect(
      await screen.findByRole("dialog", { name: "Import external agent MCP servers" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Codex CLI")).toBeInTheDocument();
    expect(bridge.discoverExternalMcpServers).toHaveBeenCalledExactlyOnceWith({
      sourceScope: "user",
    });
    expect(screen.getByText("1 MCP server")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show MCP servers from Codex CLI" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select node_repl from Codex CLI" }));
    fireEvent.click(screen.getByRole("button", { name: "Import to Global" }));

    expect(onImport).toHaveBeenCalledOnce();
    expect(onImport.mock.calls[0]?.[0]).toEqual({ scope: "user" });
    expect(onImport.mock.calls[0]?.[1]).toEqual([
      {
        ...candidate("ignored", "node_repl"),
        id: expect.any(String),
        description: "",
      },
    ]);
    expect(onImport.mock.calls[0]?.[1][0]?.id).not.toBe("codex:node");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("supports provider and select-all checkboxes with indeterminate state", async () => {
    bridge.discoverExternalMcpServers.mockResolvedValue({
      groups: [
        group("codex", "Codex CLI", "~/.codex/config.toml", [
          candidate("one", "one"),
          candidate("two", "two"),
        ]),
        group("opencode", "OpenCode", "~/.config/opencode/opencode.json", [
          candidate("three", "three"),
        ]),
      ],
    });
    renderModal();

    const providerCheckbox = await screen.findByRole("checkbox", {
      name: "Select all MCP servers from Codex CLI",
    });
    const selectAll = screen.getByRole("checkbox", { name: "Select all MCP servers" });
    fireEvent.click(providerCheckbox);

    expect(selectAll).toBePartiallyChecked();
    expect(screen.getByText("2/3 selected")).toBeInTheDocument();

    fireEvent.click(selectAll);
    expect(selectAll).toBeChecked();
    expect(screen.getByText("3/3 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show MCP servers from Codex CLI" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select one from Codex CLI" }));
    expect(providerCheckbox).toBePartiallyChecked();
    expect(screen.getByText("2/3 selected")).toBeInTheDocument();
  });

  it("keeps discovery source independent from the import destination", async () => {
    bridge.discoverExternalMcpServers.mockImplementation(async (payload) => ({
      groups: [
        group(
          payload.sourceScope,
          payload.sourceScope === "user" ? "Global provider" : "Project provider",
          payload.sourceScope === "user" ? "~/.agent/config" : "C:\\repo\\.agent\\config",
          [candidate(payload.sourceScope, `${payload.sourceScope}-server`)],
        ),
      ],
    }));
    renderModal({ includeProjects: true });

    expect(await screen.findByText("Global provider")).toBeInTheDocument();
    expect(bridge.discoverExternalMcpServers).toHaveBeenLastCalledWith({
      sourceScope: "user",
    });
    fireEvent.click(screen.getByRole("button", { name: "MCP server source scope" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Demo project/u }));

    expect(await screen.findByText("Project provider")).toBeInTheDocument();
    expect(bridge.discoverExternalMcpServers).toHaveBeenLastCalledWith({
      sourceScope: "workspace",
      projectLocation,
    });
    expect(screen.getByRole("button", { name: "Import to Global" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show MCP servers from Project provider" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select workspace-server from Project provider" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose import destination" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Demo project/u }));
    expect(screen.getByRole("button", { name: "Import to Demo project" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "MCP server source scope" })).toHaveTextContent(
      "Demo project",
    );
    expect(bridge.discoverExternalMcpServers).toHaveBeenCalledTimes(2);
  });

  it("imports into a selected project destination", async () => {
    const onImport = vi.fn<(destination: McpImportDestination, servers: McpServer[]) => void>();
    bridge.discoverExternalMcpServers.mockResolvedValue({
      groups: [group("codex", "Codex CLI", "~/.codex/config.toml", [candidate("one", "one")])],
    });
    renderModal({ includeProjects: true, onImport });

    await screen.findByText("Codex CLI");
    fireEvent.click(screen.getByRole("button", { name: "Show MCP servers from Codex CLI" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select one from Codex CLI" }));

    fireEvent.click(screen.getByRole("button", { name: "Choose import destination" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Other project/u }));
    fireEvent.click(screen.getByRole("button", { name: "Import to Other project" }));

    expect(onImport).toHaveBeenCalledOnce();
    expect(onImport.mock.calls[0]?.[0]).toEqual({ scope: "project", projectId: "p2" });
  });

  it("preselects the default project as source and destination", async () => {
    bridge.discoverExternalMcpServers.mockResolvedValue({ groups: [] });
    renderModal({ includeProjects: true, defaultProjectId: "p1" });

    expect(await screen.findByText("No MCP servers found in this scope.")).toBeInTheDocument();
    expect(bridge.discoverExternalMcpServers).toHaveBeenCalledExactlyOnceWith({
      sourceScope: "workspace",
      projectLocation,
    });
    expect(screen.getByRole("button", { name: "MCP server source scope" })).toHaveTextContent(
      "Demo project",
    );
    expect(screen.getByRole("button", { name: "Import to Demo project" })).toBeInTheDocument();
  });

  it("offers WSL global sources on Windows and scans the selected distro", async () => {
    bridge.listWslDistros.mockResolvedValue(["Ubuntu"]);
    bridge.discoverExternalMcpServers.mockResolvedValue({ groups: [] });
    renderModal();

    expect(await screen.findByText("No MCP servers found in this scope.")).toBeInTheDocument();
    await waitFor(() => expect(bridge.listWslDistros).toHaveBeenCalledOnce());

    const sourceButton = screen.getByRole("button", { name: "MCP server source scope" });
    await waitFor(() => expect(sourceButton).toHaveTextContent("Global (Windows)"));
    fireEvent.click(sourceButton);
    expect(await screen.findByText("Windows")).toBeInTheDocument();
    expect(screen.getByText("WSL")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Ubuntu/u }));

    await waitFor(() =>
      expect(bridge.discoverExternalMcpServers).toHaveBeenLastCalledWith({
        sourceScope: "wsl-user",
        distro: "Ubuntu",
      }),
    );
    expect(sourceButton).toHaveTextContent("WSL (Ubuntu)");
  });

  it("does not list WSL sources on non-Windows platforms", async () => {
    bridge.platform = "darwin";
    renderModal();
    expect(await screen.findByText("No MCP servers found in this scope.")).toBeInTheDocument();
    expect(bridge.listWslDistros).not.toHaveBeenCalled();
  });

  it("disables the whole import button group until a candidate is selected", async () => {
    bridge.discoverExternalMcpServers.mockResolvedValue({
      groups: [group("codex", "Codex CLI", "~/.codex/config.toml", [candidate("one", "one")])],
    });
    renderModal();

    await screen.findByText("Codex CLI");
    expect(screen.getByRole("button", { name: "Import to Global" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Choose import destination" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Show MCP servers from Codex CLI" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select one from Codex CLI" }));
    expect(screen.getByRole("button", { name: "Import to Global" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Choose import destination" })).toBeEnabled();
  });

  it("ignores an older discovery response after the source changes", async () => {
    let resolveGlobal!: (result: DiscoverExternalMcpServersResult) => void;
    let resolveProject!: (result: DiscoverExternalMcpServersResult) => void;
    bridge.discoverExternalMcpServers
      .mockReturnValueOnce(new Promise((resolve) => (resolveGlobal = resolve)))
      .mockReturnValueOnce(new Promise((resolve) => (resolveProject = resolve)));
    renderModal({ includeProjects: true });
    await waitFor(() => expect(bridge.discoverExternalMcpServers).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "MCP server source scope" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Demo project/u }));
    await waitFor(() => expect(bridge.discoverExternalMcpServers).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolveProject({
        groups: [group("project", "Project provider", "C:\\repo\\config", [candidate("p", "p")])],
      });
    });
    expect(screen.getByText("Project provider")).toBeInTheDocument();

    await act(async () => {
      resolveGlobal({
        groups: [group("global", "Stale global provider", "~/.config", [candidate("g", "g")])],
      });
    });
    expect(screen.getByText("Project provider")).toBeInTheDocument();
    expect(screen.queryByText("Stale global provider")).not.toBeInTheDocument();
  });

  it("refreshes the current source and replaces its results", async () => {
    bridge.discoverExternalMcpServers
      .mockResolvedValueOnce({
        groups: [group("first", "First scan", "~/.first", [candidate("first", "first")])],
      })
      .mockResolvedValueOnce({
        groups: [group("second", "Second scan", "~/.second", [candidate("second", "second")])],
      });
    renderModal();

    expect(await screen.findByText("First scan")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh MCP server sources" }));

    expect(await screen.findByText("Second scan")).toBeInTheDocument();
    expect(screen.queryByText("First scan")).not.toBeInTheDocument();
    expect(bridge.discoverExternalMcpServers).toHaveBeenNthCalledWith(2, {
      sourceScope: "user",
    });
  });

  it("disables existing, reserved, and repeated server names with accessible reasons", async () => {
    const existing: McpServer = {
      id: "existing",
      name: "Memory",
      description: "",
      enabled: true,
      timeoutMs: 30_000,
      transport: { type: "stdio", command: "node", args: [], env: {} },
    };
    bridge.discoverExternalMcpServers.mockResolvedValue({
      groups: [
        group("codex", "Codex CLI", "~/.codex/config.toml", [
          candidate("memory", "memory", "authentication"),
          candidate("browser", "browser", "sensitive-values"),
          candidate("unique", "unique"),
        ]),
        group("opencode", "OpenCode", "~/.config/opencode/opencode.json", [
          candidate("unique-copy", "UNIQUE"),
        ]),
      ],
    });
    renderModal({ userServers: [existing] });

    expect(await screen.findByText("Found 1 importable MCP server")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show MCP servers from Codex CLI" }));
    fireEvent.click(screen.getByRole("button", { name: "Show MCP servers from OpenCode" }));

    expect(
      screen.getByRole("checkbox", {
        name: "memory from Codex CLI: Already configured",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", {
        name: "browser from Codex CLI: Managed by Poracode",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", {
        name: "UNIQUE from OpenCode: Duplicate server name in scan",
      }),
    ).toBeDisabled();
    expect(screen.getByText("Already configured")).toBeInTheDocument();
    expect(screen.getByText("Managed by Poracode")).toBeInTheDocument();
    expect(screen.getByText("Duplicate server name in scan")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all MCP servers" }));
    expect(screen.getByText("1/1 selected")).toBeInTheDocument();
  });

  it("disables unsupported candidates and includes each visible reason in its accessible name", async () => {
    bridge.discoverExternalMcpServers.mockResolvedValue({
      groups: [
        group("codex", "Codex CLI", "~/.codex/config.toml", [
          candidate("auth", "auth-server", "authentication"),
          candidate("restricted", "restricted-server", "tool-restrictions"),
          candidate("secret", "secret-server", "sensitive-values"),
          candidate("safe", "safe-server"),
        ]),
      ],
    });
    renderModal();

    expect(await screen.findByText("Found 1 importable MCP server")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show MCP servers from Codex CLI" }));

    expect(
      screen.getByRole("checkbox", {
        name: "auth-server from Codex CLI: Authentication setup cannot be imported",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", {
        name: "restricted-server from Codex CLI: Tool restrictions cannot be imported",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", {
        name: "secret-server from Codex CLI: Contains sensitive values; add manually",
      }),
    ).toBeDisabled();
    expect(screen.getByText("Authentication setup cannot be imported")).toBeInTheDocument();
    expect(screen.getByText("Tool restrictions cannot be imported")).toBeInTheDocument();
    expect(screen.getByText("Contains sensitive values; add manually")).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Select secret-server from Codex CLI" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Select safe-server from Codex CLI" }),
    ).toBeEnabled();
  });

  it("shows a retryable discovery error and then the empty state", async () => {
    bridge.discoverExternalMcpServers
      .mockRejectedValueOnce(new Error("scan failed"))
      .mockResolvedValueOnce({ groups: [] });
    renderModal();

    expect(
      await screen.findByRole("alert", {
        name: "",
      }),
    ).toHaveTextContent("Couldn't scan MCP server configurations.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("No MCP servers found in this scope.")).toBeInTheDocument();
    expect(screen.getByText("Found 0 importable MCP servers")).toBeInTheDocument();
    expect(bridge.discoverExternalMcpServers).toHaveBeenCalledTimes(2);
  });
});
