import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { toast } from "@heroui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalPortInfo, PoracodeBridge } from "@/shared/ipc";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { PortsPanel } from "./PortsPanel";
import { PortsPanelHeaderActions } from "./parts/PortsPanelHeaderActions";
import { usePortsPanelChromeStore } from "./portsPanelStore";

vi.mock("@/renderer/clientRuntime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/clientRuntime")>()),
  hasClientCapability: () => true,
}));

const port: LocalPortInfo = {
  port: 45123,
  address: "127.0.0.1",
  url: "http://127.0.0.1:45123",
  pid: 12345,
  processName: "node",
  processStartedAt: "started",
  canClose: true,
};
const listLocalPorts = vi.fn<PoracodeBridge["listLocalPorts"]>();
const closeLocalPort = vi.fn<PoracodeBridge["closeLocalPort"]>();
const browserCreateTab = vi.fn<PoracodeBridge["browserCreateTab"]>();
const openExternalNative = vi.fn<PoracodeBridge["openExternalNative"]>();
const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  listLocalPorts.mockReset().mockResolvedValue({ ports: [port] });
  closeLocalPort.mockReset().mockResolvedValue({ closed: true });
  browserCreateTab.mockReset().mockResolvedValue(undefined as never);
  openExternalNative.mockReset().mockResolvedValue();
  writeText.mockReset().mockResolvedValue();
  useRemoteServersStore.setState({ servers: [], runtime: {} });
  usePortsPanelChromeStore.setState({ refreshVersion: 0, manualForwardVersion: 0, loading: false });
  Object.defineProperty(window, "poracode", {
    configurable: true,
    value: { listLocalPorts, closeLocalPort, browserCreateTab, openExternalNative },
  });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});
afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "poracode", { configurable: true, value: undefined });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
});

describe("local Ports panel", () => {
  it("lists local listeners without pairing and opens the row in the app browser", async () => {
    render(
      <>
        <PortsPanelHeaderActions dragControlClass="" />
        <PortsPanel />
      </>,
    );
    expect(await screen.findByText("127.0.0.1:45123")).toBeInTheDocument();
    expect(screen.getByText("node · 12345")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Forward a port" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("127.0.0.1:45123"));
    expect(browserCreateTab).toHaveBeenCalledWith({ url: port.url, activate: true, reveal: true });
    expect(openExternalNative).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(listLocalPorts).toHaveBeenCalledTimes(2));
  });

  it("opens a desktop context menu from right-click and overflow, with separate system and copy actions", async () => {
    render(<PortsPanel />);
    fireEvent.contextMenu(await screen.findByText("127.0.0.1:45123"), { clientX: 20, clientY: 30 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Open in system browser" }));
    expect(openExternalNative).toHaveBeenCalledWith(port.url);
    expect(browserCreateTab).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Actions for port 45123" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(port.url));
    fireEvent.click(screen.getByRole("button", { name: "Actions for port 45123" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy address" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("127.0.0.1:45123"));
  });

  it("confirms process termination, sends its identity and refreshes after success", async () => {
    render(<PortsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Actions for port 45123" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Close port" }));
    expect(
      await screen.findByText(
        "This stops node (PID 12345) and closes all ports used by that process.",
      ),
    ).toBeInTheDocument();
    expect(closeLocalPort).not.toHaveBeenCalled();
    listLocalPorts.mockResolvedValue({ ports: [] });
    fireEvent.click(screen.getByRole("button", { name: "Close port" }));
    await waitFor(() =>
      expect(closeLocalPort).toHaveBeenCalledExactlyOnceWith({
        port: 45123,
        address: "127.0.0.1",
        pid: 12345,
        processStartedAt: "started",
      }),
    );
    expect(await screen.findByText("No listening ports")).toBeInTheDocument();
  });

  it("disables closing listeners whose owner cannot be safely identified", async () => {
    listLocalPorts.mockResolvedValue({
      ports: [{ ...port, canClose: false, pid: null, processStartedAt: null }],
    });
    render(<PortsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Actions for port 45123" }));
    expect(await screen.findByRole("menuitem", { name: "Close port" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(closeLocalPort).not.toHaveBeenCalled();
  });

  it("reports a failed close instead of removing the live listener", async () => {
    closeLocalPort.mockResolvedValue({ closed: false });
    const warning = vi.spyOn(toast, "warning").mockImplementation(() => undefined as never);
    render(<PortsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Actions for port 45123" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Close port" }));
    fireEvent.click(await screen.findByRole("button", { name: "Close port" }));
    await waitFor(() => expect(warning).toHaveBeenCalled());
    expect(screen.getByText("127.0.0.1:45123")).toBeInTheDocument();
  });

  it("ignores an older response after refreshing", async () => {
    let complete!: (result: { ports: LocalPortInfo[] }) => void;
    listLocalPorts.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    render(<PortsPanel />);
    await act(async () => {
      usePortsPanelChromeStore.getState().requestRefresh();
    });
    expect(await screen.findByText("127.0.0.1:45123")).toBeInTheDocument();
    await act(async () => complete({ ports: [] }));
    expect(screen.getByText("127.0.0.1:45123")).toBeInTheDocument();
  });

  it("surfaces scan errors and retries", async () => {
    listLocalPorts.mockRejectedValueOnce(new Error("scan failed"));
    render(<PortsPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent("scan failed");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("127.0.0.1:45123")).toBeInTheDocument();
  });
});
