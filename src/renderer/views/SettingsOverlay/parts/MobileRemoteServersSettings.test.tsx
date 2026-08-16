import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { MobileRemoteServersSettings } from "./MobileRemoteServersSettings";
import { RemoteServersSettings } from "./RemoteServersSettings";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import type { Project } from "@/shared/contracts";

const state = vi.hoisted(() => ({
  servers: [] as RemoteServerRecord[],
  runtime: {} as Record<string, { status: "online" | "offline" | "connecting" | "error" }>,
  lastKnownProjects: {} as Record<string, Project[]>,
  excludedProjectIds: {} as Record<string, readonly string[]>,
  connectAll: vi.fn<() => Promise<void>>(),
  pairServer: vi.fn<() => Promise<void>>(),
  reconnectServer: vi.fn<() => Promise<void>>(),
  renameServer: vi.fn<(desktopId: string, label: string) => void>(),
  removeServer: vi.fn<(desktopId: string) => void>(),
  setRemoteProjectSynced: vi.fn<(desktopId: string, projectId: string, synced: boolean) => void>(),
  runProjectCommand: vi.fn<() => Promise<void>>(),
  browseHostDirectory: vi.fn<() => Promise<unknown>>(),
}));

const capabilities = vi.hoisted(() => ({ nativeSsh: false }));
const clipboard = vi.hoisted(() => ({ readText: vi.fn<() => Promise<string>>() }));

vi.mock("@/renderer/clientRuntime", () => ({
  hasClientCapability: (capability: string) =>
    capability === "nativeSsh" ? capabilities.nativeSsh : false,
}));

vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: (selector: (value: typeof state) => unknown) => selector(state),
}));

vi.mock("@/renderer/hooks/useAsyncOperation", () => ({
  useAsyncOperation: () => ({
    busy: false,
    error: null,
    run: (operation: () => Promise<void>) => operation(),
  }),
}));

vi.mock("@/renderer/pwa/install", () => ({
  useCanInstall: () => false,
  isNativeApp: () => false,
  promptInstall: vi.fn<() => Promise<boolean>>(),
}));

vi.mock("@/renderer/components/common/BottomSheet", () => ({
  BottomSheet: (props: {
    label: string;
    fullScreen?: boolean;
    onClose: () => void;
    children: React.ReactNode;
  }) => (
    <div role="dialog" aria-label={props.label}>
      {props.fullScreen ? <span data-testid="full-screen-drawer" /> : null}
      <button type="button" onClick={props.onClose}>
        Close
      </button>
      {props.children}
    </div>
  ),
}));

vi.mock("./SshConnectionForm", () => ({
  SshConnectionForm: () => <input aria-label="SSH hostname" />,
}));

const sampleServer: RemoteServerRecord = {
  desktopId: "desk-1",
  label: "Poracode on amd-pc-12-25",
  endpoint: "http://127.0.0.1:49153/",
  accessToken: "token",
  scopes: ["projects:manage"],
  transport: { kind: "direct" },
  hostMode: "helper",
};

describe("MobileRemoteServersSettings", () => {
  beforeEach(() => {
    state.servers = [];
    state.runtime = {};
    state.lastKnownProjects = {};
    state.excludedProjectIds = {};
    state.connectAll.mockReset();
    state.pairServer.mockReset();
    state.reconnectServer.mockReset().mockResolvedValue(undefined);
    state.renameServer.mockReset();
    state.removeServer.mockReset();
    state.setRemoteProjectSynced.mockReset();
    state.runProjectCommand.mockReset().mockResolvedValue(undefined);
    state.browseHostDirectory.mockReset().mockResolvedValue({
      path: "/srv",
      parentPath: "/",
      homePath: "/home/me",
      entries: [],
      truncated: false,
    });
    capabilities.nativeSsh = false;
    clipboard.readText.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText: clipboard.readText },
    });
  });

  it("shows the compact empty state and keeps pairing behind the FAB", () => {
    render(<MobileRemoteServersSettings />);

    expect(screen.getByText("Connections")).toBeInTheDocument();
    expect(screen.getByText("No connections yet")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pair a connection" }));

    expect(screen.getByRole("dialog", { name: "Pair a connection" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan QR code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Paste" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Pairing URL" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Server base URL" })).toBeInTheDocument();
    expect(screen.getByLabelText("One-time pairing token")).toBeInTheDocument();
  });

  it("pastes and connects with the same pairing-link flow as the welcome drawer", async () => {
    clipboard.readText.mockResolvedValue(
      "https://app-nightly.poracode.com/?host=http%3A%2F%2F192.168.1.20%3A49152#token=lc_pair_test",
    );
    render(<MobileRemoteServersSettings />);

    fireEvent.click(screen.getByRole("button", { name: "Pair a connection" }));
    expect(screen.getByRole("button", { name: "Connect" })).toHaveClass(
      "poracode-mobile-pair-connect",
    );
    fireEvent.click(screen.getByRole("button", { name: "Paste" }));

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Pairing URL" })).toHaveValue(
        "https://app-nightly.poracode.com/?host=http%3A%2F%2F192.168.1.20%3A49152#token=lc_pair_test",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() =>
      expect(state.pairServer).toHaveBeenCalledWith({
        endpoint: "http://192.168.1.20:49152",
        token: "lc_pair_test",
      }),
    );
    expect(state.connectAll).toHaveBeenCalled();
  });

  it("offers direct pairing and SSH when native SSH is available", async () => {
    capabilities.nativeSsh = true;
    render(<MobileRemoteServersSettings />);

    fireEvent.click(screen.getByRole("button", { name: "Pair a connection" }));

    expect(screen.getByRole("dialog", { name: "Connections" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pair with Poracode" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Connect over SSH" }));

    expect(await screen.findByRole("dialog", { name: "Connect over SSH" })).toBeInTheDocument();
    expect(await screen.findByRole("textbox", { name: "SSH hostname" })).toBeInTheDocument();
  });

  it("opens direct pairing immediately when native SSH is unavailable", () => {
    render(<MobileRemoteServersSettings />);

    fireEvent.click(screen.getByRole("button", { name: "Pair a connection" }));

    expect(screen.getByRole("dialog", { name: "Pair a connection" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Connections" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect over SSH" })).not.toBeInTheDocument();
  });

  it("opens projects as a full-screen drawer on tap and keeps actions behind a long press", () => {
    state.servers = [sampleServer];
    state.runtime = { "desk-1": { status: "online" } };

    render(<MobileRemoteServersSettings />);

    // Nightly strips the "Poracode on " brand prefix in the list.
    const row = screen.getByRole("button", { name: "amd-pc-12-25" });
    expect(row).toHaveClass("m-thread-row");
    expect(row).toHaveAttribute("data-live");
    expect(screen.getByText("127.0.0.1:49153")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();

    // No square-card inline icon actions — rename/remove live behind a long press.
    expect(screen.queryByRole("button", { name: "Rename connection" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove connection" })).not.toBeInTheDocument();

    fireEvent.click(row);

    expect(screen.getByRole("dialog", { name: "Projects" })).toBeInTheDocument();
    expect(screen.getByTestId("full-screen-drawer")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "amd-pc-12-25" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Projects" })).not.toBeInTheDocument();
    fireEvent.contextMenu(row);

    expect(screen.getByRole("dialog", { name: "amd-pc-12-25" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove connection" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Projects" })).not.toBeInTheDocument();
  });

  it("removes a connection from the action sheet", () => {
    state.servers = [sampleServer];
    state.runtime = { "desk-1": { status: "online" } };

    render(<MobileRemoteServersSettings />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "amd-pc-12-25" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove connection" }));

    expect(state.removeServer).toHaveBeenCalledWith("desk-1");
  });

  it("renames a connection through the sheet and inline editor", () => {
    state.servers = [sampleServer];
    state.runtime = { "desk-1": { status: "online" } };

    render(<MobileRemoteServersSettings />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "amd-pc-12-25" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    const input = screen.getByRole("textbox", { name: "Rename connection" });
    fireEvent.change(input, { target: { value: "Office PC" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(state.renameServer).toHaveBeenCalledWith("desk-1", "Office PC");
  });

  it("keeps excluded projects reachable for re-enabling while the connection is offline", () => {
    state.servers = [sampleServer];
    state.runtime = { "desk-1": { status: "offline" } };
    state.lastKnownProjects = {
      "desk-1": [
        {
          id: "project-1",
          name: "Mobile app",
          location: { kind: "posix", path: "/srv/mobile" },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    state.excludedProjectIds = { "desk-1": ["project-1"] };

    render(<MobileRemoteServersSettings />);
    fireEvent.click(screen.getByRole("button", { name: "amd-pc-12-25" }));

    expect(screen.getByText("Mobile app")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mobile app" }));
    fireEvent.click(screen.getByRole("button", { name: "Include in sync" }));
    expect(state.setRemoteProjectSynced).toHaveBeenCalledWith("desk-1", "project-1", true);
  });

  it("adds an existing host folder through the mobile project manager", async () => {
    state.servers = [sampleServer];
    state.runtime = { "desk-1": { status: "online" } };

    render(<MobileRemoteServersSettings />);
    fireEvent.click(screen.getByRole("button", { name: "amd-pc-12-25" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a project" }));
    fireEvent.click(screen.getByRole("button", { name: "Add an existing folder" }));
    fireEvent.click(screen.getByRole("button", { name: "Folder path on the server" }));

    await waitFor(() => expect(state.browseHostDirectory).toHaveBeenCalledWith("desk-1", ""));
    fireEvent.click(screen.getByRole("button", { name: "Use this folder" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(state.runProjectCommand).toHaveBeenCalledWith("desk-1", {
      kind: "add-existing",
      path: "/srv",
    });
  });

  it("retries the initial host folder listing after a transient failure", async () => {
    state.servers = [sampleServer];
    state.runtime = { "desk-1": { status: "online" } };
    state.browseHostDirectory
      .mockRejectedValueOnce(new Error("Desktop temporarily unavailable"))
      .mockResolvedValueOnce({
        path: "/srv",
        parentPath: "/",
        homePath: "/home/me",
        entries: [],
        truncated: false,
      });

    render(<MobileRemoteServersSettings />);
    fireEvent.click(screen.getByRole("button", { name: "amd-pc-12-25" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a project" }));
    fireEvent.click(screen.getByRole("button", { name: "Add an existing folder" }));
    fireEvent.click(screen.getByRole("button", { name: "Folder path on the server" }));

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));

    await waitFor(() => expect(state.browseHostDirectory).toHaveBeenCalledTimes(2));
    expect(state.browseHostDirectory).toHaveBeenNthCalledWith(1, "desk-1", "");
    expect(state.browseHostDirectory).toHaveBeenNthCalledWith(2, "desk-1", "");
    expect(screen.getByRole("button", { name: "Use this folder" })).toBeEnabled();
  });

  it("confirms before removing a remote project", () => {
    state.servers = [sampleServer];
    state.runtime = {
      "desk-1": {
        status: "online",
        projects: [
          {
            id: "project-1",
            name: "Mobile app",
            location: { kind: "posix", path: "/srv/mobile" },
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      } as never,
    };

    render(<MobileRemoteServersSettings />);
    fireEvent.click(screen.getByRole("button", { name: "amd-pc-12-25" }));
    fireEvent.click(screen.getByRole("button", { name: "Mobile app" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove project" }));

    expect(screen.getByText(/permanently delete all of its threads/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove project" }));
    expect(state.runProjectCommand).toHaveBeenCalledWith("desk-1", {
      kind: "remove",
      projectId: "project-1",
    });
  });
});

describe("RemoteServersSettings desktop pairing", () => {
  beforeEach(() => {
    state.servers = [];
    state.runtime = {};
    state.connectAll.mockReset().mockResolvedValue(undefined);
    state.pairServer.mockReset().mockResolvedValue(undefined);
    state.reconnectServer.mockReset().mockResolvedValue(undefined);
  });

  it("pairs from one link while the compact sheet keeps its manual fields", async () => {
    render(<RemoteServersSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Pair with Poracode" }));

    const pairingUrl = screen.getByRole("textbox", { name: "Pairing URL" });
    expect(screen.queryByRole("textbox", { name: "Endpoint" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Pairing token" })).not.toBeInTheDocument();

    fireEvent.change(pairingUrl, {
      target: {
        value:
          "https://app-nightly.poracode.com/?host=http%3A%2F%2F192.168.1.20%3A49152#token=lc_pair_test",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() =>
      expect(state.pairServer).toHaveBeenCalledWith({
        endpoint: "http://192.168.1.20:49152",
        token: "lc_pair_test",
      }),
    );
  });

  it("announces an invalid desktop pairing URL", () => {
    render(<RemoteServersSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Pair with Poracode" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Pairing URL" }), {
      target: { value: "not a pairing URL" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter the pairing URL shown on your desktop.",
    );
  });

  it("opens projects in a modal and keeps connection management in a kebab menu", async () => {
    state.servers = [sampleServer];
    state.runtime = {
      "desk-1": {
        status: "online",
        projects: [
          {
            id: "project-1",
            name: "Mobile app",
            location: { kind: "posix", path: "/srv/mobile" },
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      } as never,
    };

    render(<RemoteServersSettings />);

    expect(screen.queryByText("Mobile app")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "amd-pc-12-25" }));

    expect(screen.getByRole("dialog", { name: "amd-pc-12-25" })).toBeInTheDocument();
    expect(screen.getByText("Mobile app")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));

    expect(screen.queryByRole("dialog", { name: "amd-pc-12-25" })).not.toBeInTheDocument();
    const renameAction = await screen.findByRole("menuitem", { name: "Rename" });
    expect(renameAction).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Remove" })).toBeInTheDocument();

    fireEvent.click(renameAction);
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("amd-pc-12-25");
  });
});
