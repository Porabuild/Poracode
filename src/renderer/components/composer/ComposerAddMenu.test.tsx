import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ComposerAddMenu } from "./ComposerAddMenu";
import {
  browserMcpServer,
  chromeMcpServer,
  mcpTogglePatch,
  subagentMcpServer,
} from "./composerMcpServers";

const bridgeMock = vi.hoisted(() => ({
  isRemoteSession: vi.fn<() => boolean>(() => false),
}));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: bridgeMock.isRemoteSession,
}));

/** Open the "+" add menu popover. */
function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Add attachment or capability" }));
}

/** Open the MCP servers flyout submenu (desktop) by activating the parent row. */
function openMcpSubmenu() {
  act(() => {
    fireEvent.click(screen.getByText("MCP servers"));
  });
}

describe("ComposerAddMenu", () => {
  beforeEach(() => {
    bridgeMock.isRemoteSession.mockReturnValue(false);
  });

  it("keeps the desktop dropdown trigger free of nested buttons", () => {
    const { container } = render(
      <ComposerAddMenu mcpServers={[]} onPickFiles={vi.fn<() => void>()} />,
    );

    expect(container.querySelector("button button")).not.toBeInTheDocument();
  });

  it("hides the file picker action when file attachments are unavailable", () => {
    render(
      <ComposerAddMenu
        mcpServers={[
          {
            descriptor: browserMcpServer,
            enabled: false,
            visible: true,
            onToggle: vi.fn<(next: boolean) => void>(),
          },
        ]}
        showFileOption={false}
        onPickFiles={vi.fn<() => void>()}
      />,
    );

    openMenu();

    expect(screen.queryByText("File")).not.toBeInTheDocument();
    // MCP servers now live behind a parent submenu row, not a flat list.
    expect(screen.getByText("MCP servers")).toBeInTheDocument();
    expect(screen.queryByText("Browser")).not.toBeInTheDocument();

    openMcpSubmenu();
    expect(screen.getByText("Browser")).toBeInTheDocument();
  });

  it("renders nothing when no add actions are available", () => {
    const { container } = render(
      <ComposerAddMenu mcpServers={[]} showFileOption={false} onPickFiles={vi.fn<() => void>()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the only MCP server is not visible", () => {
    const { container } = render(
      <ComposerAddMenu
        mcpServers={[
          {
            descriptor: browserMcpServer,
            enabled: false,
            visible: false,
            onToggle: vi.fn<(next: boolean) => void>(),
          },
        ]}
        showFileOption={false}
        onPickFiles={vi.fn<() => void>()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the count of enabled servers on the parent row", () => {
    render(
      <ComposerAddMenu
        mcpServers={[
          {
            descriptor: browserMcpServer,
            enabled: true,
            visible: true,
            onToggle: vi.fn<(next: boolean) => void>(),
          },
          {
            descriptor: subagentMcpServer,
            enabled: true,
            visible: true,
            onToggle: vi.fn<(next: boolean) => void>(),
          },
        ]}
        showFileOption={false}
        onPickFiles={vi.fn<() => void>()}
      />,
    );

    openMenu();

    // Count is visible on the parent row without opening the submenu.
    expect(screen.getByText("MCP servers")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("Browser")).not.toBeInTheDocument();
  });

  it("toggles a single server without closing the menu", () => {
    const browserToggle = vi.fn<(next: boolean) => void>();
    const subagentToggle = vi.fn<(next: boolean) => void>();
    render(
      <ComposerAddMenu
        mcpServers={[
          { descriptor: browserMcpServer, enabled: false, visible: true, onToggle: browserToggle },
          { descriptor: subagentMcpServer, enabled: true, visible: true, onToggle: subagentToggle },
        ]}
        showFileOption={false}
        onPickFiles={vi.fn<() => void>()}
      />,
    );

    openMenu();
    openMcpSubmenu();

    act(() => {
      fireEvent.click(screen.getByText("Browser"));
    });

    // Only the flipped server fires, with the new value.
    expect(browserToggle).toHaveBeenCalledTimes(1);
    expect(browserToggle).toHaveBeenCalledWith(true);
    expect(subagentToggle).not.toHaveBeenCalled();

    // The submenu stays open so multiple toggles are possible.
    expect(screen.getByText("Subagents")).toBeInTheDocument();
  });

  it("registers Chrome for native projects and hides it for WSL", () => {
    const capabilities = {
      chromeMcpScope: { terminal: "launch", gui: "launch" },
    } as Parameters<typeof chromeMcpServer.getScope>[0];

    expect(
      chromeMcpServer.getScope(capabilities, "terminal", {
        kind: "windows",
        path: "C:\\repo",
      }),
    ).toBe("launch");
    expect(
      chromeMcpServer.getScope(capabilities, "terminal", {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/repo",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
      }),
    ).toBe("none");
    expect(mcpTogglePatch("chromeMcp", true)).toEqual({ chromeMcp: true });
  });

  it("captions the submenu with the persistence note", () => {
    render(
      <ComposerAddMenu
        mcpServers={[
          {
            descriptor: browserMcpServer,
            enabled: false,
            visible: true,
            onToggle: vi.fn<(next: boolean) => void>(),
          },
        ]}
        showFileOption={false}
        onPickFiles={vi.fn<() => void>()}
      />,
    );

    openMenu();
    openMcpSubmenu();

    expect(screen.getByText("Enabled servers stay on for new threads")).toBeInTheDocument();
  });

  it("shows a foreground-takeover subtitle for Computer Use inside the submenu", () => {
    render(
      <ComposerAddMenu
        mcpServers={[]}
        showFileOption={false}
        onPickFiles={vi.fn<() => void>()}
        computerUse={{
          enabled: false,
          visible: true,
          onToggle: vi.fn<(next: boolean) => void>(),
        }}
      />,
    );

    openMenu();
    openMcpSubmenu();

    expect(screen.getByText("Computer Use")).toBeInTheDocument();
    expect(
      screen.getByText("Takes over the desktop while the agent clicks or types"),
    ).toBeInTheDocument();
  });

  it("toggles Computer Use from inside the submenu", () => {
    const computerUseToggle = vi.fn<(next: boolean) => void>();
    render(
      <ComposerAddMenu
        mcpServers={[]}
        showFileOption={false}
        onPickFiles={vi.fn<() => void>()}
        computerUse={{ enabled: false, visible: true, onToggle: computerUseToggle }}
      />,
    );

    openMenu();
    openMcpSubmenu();

    act(() => {
      fireEvent.click(screen.getByText("Computer Use"));
    });

    expect(computerUseToggle).toHaveBeenCalledTimes(1);
    expect(computerUseToggle).toHaveBeenCalledWith(true);
  });

  it("shows read-only session bindings without firing toggles", () => {
    const browserToggle = vi.fn<(next: boolean) => void>();
    render(
      <ComposerAddMenu
        readOnly
        mcpServers={[
          { descriptor: browserMcpServer, enabled: true, visible: true, onToggle: browserToggle },
        ]}
        customMcpServers={[{ id: "context7", name: "context7", enabled: true }]}
        showFileOption={false}
        onPickFiles={vi.fn<() => void>()}
      />,
    );

    openMenu();
    // Count badge includes built-in + custom servers bound to this run.
    expect(screen.getByText("2")).toBeInTheDocument();
    openMcpSubmenu();

    expect(screen.getByText("Browser")).toBeInTheDocument();
    expect(screen.getByText("context7")).toBeInTheDocument();
    expect(
      screen.getByText("Set when this session started — start a new thread to change servers"),
    ).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByText("Browser"));
    });
    expect(browserToggle).not.toHaveBeenCalled();
  });

  it("shows an explicit empty state in read-only mode with no servers", () => {
    render(
      <ComposerAddMenu
        readOnly
        mcpServers={[]}
        customMcpServers={[]}
        showFileOption={false}
        onPickFiles={vi.fn<() => void>()}
      />,
    );

    openMenu();
    openMcpSubmenu();

    expect(screen.getByText("No MCP servers are enabled for this run")).toBeInTheDocument();
  });

  it("shows a paired-desktop subtitle for Computer Use in a remote session", () => {
    bridgeMock.isRemoteSession.mockReturnValue(true);
    render(
      <ComposerAddMenu
        mcpServers={[]}
        showFileOption={false}
        onPickFiles={vi.fn<() => void>()}
        computerUse={{
          enabled: false,
          visible: true,
          onToggle: vi.fn<(next: boolean) => void>(),
        }}
      />,
    );

    // Remote session renders the mobile bottom-sheet; open it and drill in.
    fireEvent.click(screen.getByRole("button", { name: "Add attachment or capability" }));
    act(() => {
      fireEvent.click(screen.getByText("MCP servers"));
    });

    expect(
      screen.getByText("Controls the paired desktop while the agent clicks or types"),
    ).toBeInTheDocument();
  });
});
