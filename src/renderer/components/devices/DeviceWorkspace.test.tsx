import { useState } from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { DeviceSession } from "@/shared/deviceWorkspace";
import { RemoteClientError } from "@/shared/remote/client";
import { DeviceWorkspace } from "./DeviceWorkspace";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useAppStore } from "@/renderer/state/appStore";
import { PANEL_EXIT_DURATION_MS } from "@/renderer/components/layout/panelMotion";

const routing = vi.hoisted(() => ({ replacement: false }));
const mocks = vi.hoisted(() => ({
  endpoint: "https://device-fixture.example",
  environment: vi.fn<() => Promise<unknown>>(),
  deviceInventory: vi.fn<() => Promise<unknown>>(),
  attachDevice: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  detachDevice: vi.fn<() => Promise<void>>(async () => {}),
  otherDetach: vi.fn<() => Promise<void>>(async () => {}),
  deviceFrame: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  inspectDevice: vi.fn<() => Promise<unknown>>(),
  deviceAction: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({})),
  openDevicePreview: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  closeDevicePreview: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  devicePreviewBaseUrl: () => "https://device-fixture.example/bound-preview",
}));
const liveFixture = vi.hoisted(() => ({
  status: "streaming" as "connecting" | "streaming" | "reconnecting" | "closed",
  pressButton: null as ((button: "home" | "back" | "recents") => void) | null,
}));
vi.mock("./LiveDevicePreview", async () => {
  const { useEffect } = await import("react");
  return {
    LiveDevicePreview: ({
      control,
      framed,
      onStatusChange,
      onLivePressButtonChange,
    }: {
      control: boolean;
      framed?: boolean;
      onStatusChange?: (status: "connecting" | "streaming" | "reconnecting" | "closed") => void;
      onLivePressButtonChange?: (
        pressButton: ((button: "home" | "back" | "recents") => void) | null,
      ) => void;
    }) => {
      useEffect(() => {
        onStatusChange?.(liveFixture.status);
        return () => onStatusChange?.("closed");
      });
      useEffect(() => {
        if (!control || liveFixture.status !== "streaming" || !liveFixture.pressButton) {
          onLivePressButtonChange?.(null);
          return;
        }
        onLivePressButtonChange?.(liveFixture.pressButton);
        return () => onLivePressButtonChange?.(null);
      });
      return (
        <button type="button" disabled={!control} data-framed={framed ? "true" : "false"}>
          Fixture live input
        </button>
      );
    },
  };
});
vi.mock("./deviceClient", () => ({
  withThreadDeviceClient: (
    _threadId: string,
    invoke: (client: typeof mocks, id: string) => Promise<unknown>,
  ) =>
    routing.replacement
      ? invoke({ ...mocks, detachDevice: mocks.otherDetach }, "replacement-host-thread")
      : invoke(mocks, "host-thread"),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  routing.replacement = false;
  liveFixture.status = "streaming";
  liveFixture.pressButton = null;
  usePanelStore.setState({
    deviceWorkspaceThreadId: null,
    deviceWorkspaceDetached: false,
    rightPanelTab: "git",
    bottomPanelDocks: { left: null, right: null },
  });
});
const device = {
  id: "android:fixture",
  name: "Fixture Emulator",
  platform: "android",
  state: "running",
  input: true,
  accessibility: true,
} as const;
const generation = "5468f955-91e6-4629-9b19-998164332157";
function setup() {
  useAppStore.setState({
    view: { kind: "thread", panes: ["local-thread"] },
    focusedPaneId: "local-thread",
  });
  let nextLease = 0;
  mocks.environment.mockResolvedValue({ capabilities: { deviceWorkspace: { versions: [1] } } });
  mocks.deviceInventory.mockResolvedValue({
    version: 1,
    generation,
    platforms: [{ platform: "ios", status: "unsupported_host" }],
    devices: [device],
  });
  mocks.attachDevice.mockImplementation(async (_threadId, input) => ({
    version: 1,
    id: `lease-${++nextLease}`,
    generation,
    threadId: "host-thread",
    device,
    expiresAt: Date.now() + 60000,
    ...(input as Pick<DeviceSession, "access" | "agentAccess">),
  }));
  mocks.deviceFrame.mockResolvedValue({
    version: 1,
    id: "frame",
    mimeType: "image/jpeg",
    base64: "AA==",
    width: 20,
    height: 40,
    capturedAt: Date.now(),
  });
  mocks.inspectDevice.mockResolvedValue({ text: "<hierarchy/>" });
  mocks.deviceAction.mockResolvedValue({});
  mocks.closeDevicePreview.mockResolvedValue();
}

function Workspace({
  visible = true,
  threadId = "local-thread",
}: {
  visible?: boolean;
  threadId?: string;
}) {
  const [titleTarget, setTitleTarget] = useState<HTMLDivElement | null>(null);
  const [actionsTarget, setActionsTarget] = useState<HTMLDivElement | null>(null);
  return (
    <div>
      <div ref={setTitleTarget} />
      <div ref={setActionsTarget} />
      <DeviceWorkspace
        threadId={threadId}
        visible={visible}
        titleTarget={titleTarget}
        actionsTarget={actionsTarget}
      />
    </div>
  );
}

function PanelHarness() {
  const context = usePanelStore((state) => state.deviceWorkspaceThreadId);
  const active = usePanelStore((state) => state.rightPanelTab === "devices");
  return (
    <>
      <button
        type="button"
        id="thread-tool-devices-other-thread"
        onClick={() => usePanelStore.getState().setDeviceWorkspaceThreadId("other-thread")}
      >
        Other Devices
      </button>
      <button type="button">Other thread</button>
      <button type="button" id="thread-tool-devices-local-thread" style={{ visibility: "hidden" }}>
        Rail Devices
      </button>
      <button type="button" id="thread-tools-local-thread">
        Show thread tools
      </button>
      <div data-poracode-panel="">
        <button
          type="button"
          id="panel-devices-local-thread"
          onClick={() => usePanelStore.getState().setDeviceWorkspaceThreadId("local-thread")}
        >
          Devices
        </button>
        {context ? <Workspace key={context} threadId={context} visible={active} /> : null}
      </div>
    </>
  );
}

async function headerAction(name: string) {
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(await screen.findByRole("menuitem", { name }));
}

async function attachControl() {
  fireEvent.click(await screen.findByRole("button", { name: /Fixture Emulator/ }));
  fireEvent.click(screen.getByRole("button", { name: "Control" }));
  fireEvent.click(screen.getByRole("button", { name: "Attach" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Home" })).toHaveProperty("disabled", false),
  );
}

async function reattach() {
  fireEvent.click(screen.getByRole("button", { name: "Detach" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Attach" })).toHaveProperty("disabled", false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Attach" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Home" })).toHaveProperty("disabled", false),
  );
}
describe("device workspace UI", () => {
  it("moves the same controller to a separate window and returns it without losing input", async () => {
    setup();
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const child = iframe.contentWindow!;
    vi.spyOn(child, "focus").mockImplementation(() => {});
    vi.spyOn(window, "focus").mockImplementation(() => {});
    const close = vi.spyOn(child, "close").mockImplementation(() => {});
    const open = vi.spyOn(window, "open").mockReturnValue(child);
    usePanelStore.getState().setDeviceWorkspaceThreadId("local-thread");
    render(
      <>
        <button id="panel-devices-local-thread" type="button">
          Devices tab
        </button>
        <Workspace />
      </>,
    );
    await attachControl();
    const workspace = screen.getByTestId("device-workspace");
    fireEvent.change(screen.getByRole("textbox", { name: "Type on device" }), {
      target: { value: "keep this input" },
    });
    await headerAction("Move device to window");
    expect(open).toHaveBeenCalledWith(
      "about:blank#poracode-device-preview-v1",
      "poracode-device-preview-v1",
      "popup",
    );
    const popup = within(child.document.body);
    expect(popup.getByTestId("device-detached-window").contains(workspace)).toBe(true);
    expect(screen.queryByTestId("device-workspace")).toBeNull();
    fireEvent.click(popup.getByRole("button", { name: "Move device back to main window" }));
    expect(screen.getByTestId("device-workspace")).toBe(workspace);
    expect(screen.getByRole("textbox", { name: "Type on device" })).toHaveProperty(
      "value",
      "keep this input",
    );
    expect(close).toHaveBeenCalledTimes(1);
    expect(
      child.document.head.querySelectorAll('base, style, link[rel="stylesheet"]'),
    ).toHaveLength(0);
    expect(mocks.attachDevice).toHaveBeenCalledTimes(1);
    expect(mocks.detachDevice).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement?.id).toBe("panel-devices-local-thread"));
  });

  it("returns the preview to the panel when its OS window closes", async () => {
    setup();
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const child = iframe.contentWindow!;
    vi.spyOn(child, "focus").mockImplementation(() => {});
    vi.spyOn(child, "close").mockImplementation(() => {});
    vi.spyOn(window, "focus").mockImplementation(() => {});
    vi.spyOn(window, "open").mockReturnValue(child);
    usePanelStore.getState().setDeviceWorkspaceThreadId("local-thread");
    render(<Workspace />);
    await attachControl();
    const workspace = screen.getByTestId("device-workspace");
    await headerAction("Move device to window");
    act(() => {
      child.dispatchEvent(new Event("beforeunload"));
    });
    expect(screen.getByTestId("device-workspace")).toBe(workspace);
    expect(usePanelStore.getState().deviceWorkspaceDetached).toBe(false);
    expect(mocks.detachDevice).not.toHaveBeenCalled();
  });

  it("keeps the preview in the panel when the new window is blocked", async () => {
    setup();
    vi.spyOn(window, "open").mockReturnValue(null);
    render(<Workspace />);
    await attachControl();
    await headerAction("Move device to window");
    expect(screen.getByText("Unable to open device window.")).toBeInTheDocument();
    expect(screen.getByTestId("device-workspace")).toBeInTheDocument();
    expect(usePanelStore.getState().deviceWorkspaceDetached).toBe(false);
    expect(mocks.detachDevice).not.toHaveBeenCalled();
  });

  it("makes the rotated preview view-only and restores input in flat view", async () => {
    setup();
    render(<Workspace />);
    await attachControl();
    fireEvent.click(screen.getByRole("button", { name: "3D preview" }));
    expect(screen.getByRole("button", { name: "Home" })).toHaveProperty("disabled", true);
    const orbit = screen.getByRole("slider", { name: /3D preview, view only/ });
    fireEvent.keyDown(orbit, { key: "ArrowRight" });
    expect(orbit.getAttribute("aria-valuenow")).toBe("19");
    fireEvent.click(screen.getByRole("button", { name: "3D preview" }));
    expect(screen.getByRole("button", { name: "Home" })).toHaveProperty("disabled", false);
    expect(mocks.deviceAction).not.toHaveBeenCalled();
  });

  it("admits only advertised settings, retains explicit confirmation for shutdown, and sends typed actions", async () => {
    setup();
    const target = {
      ...device,
      controls: {
        version: 1,
        bootId: generation,
        actions: [
          "read",
          "appearance",
          "openUrl",
          "launchApp",
          "permission",
          "location",
          "powerOff",
        ],
      },
    };
    mocks.deviceInventory.mockResolvedValue({
      version: 1,
      generation,
      platforms: [],
      devices: [target],
    });
    mocks.attachDevice.mockImplementation(async (_threadId, input) => ({
      version: 1,
      id: "lease-1",
      generation,
      threadId: "host-thread",
      device: target,
      expiresAt: Date.now() + 60000,
      ...(input as Pick<DeviceSession, "access" | "agentAccess">),
    }));
    mocks.deviceAction.mockResolvedValue({
      version: 1,
      delivered: true,
      controls: { version: 1, appearance: "dark" },
    });
    render(<Workspace />);
    await attachControl();
    await headerAction("Device settings");
    await waitFor(() =>
      expect(mocks.deviceAction).toHaveBeenCalledWith("host-thread", "lease-1", {
        kind: "control",
        version: 1,
        control: { type: "read" },
      }),
    );
    const open = screen.getByRole("button", { name: "Open" });
    expect(open).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByRole("textbox", { name: "URL or deep link" }), {
      target: { value: "file:///host" },
    });
    expect(open).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByRole("textbox", { name: "URL or deep link" }), {
      target: { value: "myapp://safe" },
    });
    await waitFor(() => expect(open).toHaveProperty("disabled", false));
    fireEvent.click(open);
    await waitFor(() =>
      expect(mocks.deviceAction).toHaveBeenCalledWith("host-thread", "lease-1", {
        kind: "control",
        version: 1,
        control: { type: "openUrl", url: "myapp://safe" },
      }),
    );
    expect(screen.queryByLabelText("Device orientation")).toBeNull();
    expect(screen.getByTestId("device-workspace").contains(screen.getByRole("dialog"))).toBe(false);
    expect(screen.getByRole("dialog").parentElement).toHaveClass("max-sm:p-0");
    fireEvent.click(screen.getByRole("button", { name: "Close device settings" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await headerAction("Power off device");
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(
      mocks.deviceAction.mock.calls.some(
        (call) => (call[2] as { control?: { type: string } }).control?.type === "powerOff",
      ),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await headerAction("Power off device");
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Power off device" }));
    await waitFor(() =>
      expect(mocks.deviceAction).toHaveBeenCalledWith("host-thread", "lease-1", {
        kind: "control",
        version: 1,
        control: { type: "powerOff" },
      }),
    );
    await waitFor(() => expect(mocks.detachDevice).toHaveBeenCalledTimes(1));
  });

  it("moves focus from the dismissed tools menu to the current visible panel tab", async () => {
    setup();
    usePanelStore.getState().setDeviceWorkspaceThreadId("local-thread");
    render(<PanelHarness />);
    await waitFor(() => expect(document.activeElement?.id).toBe("panel-devices-local-thread"));
  });

  it("waits for the exit layout before selecting the surviving visible entry", async () => {
    setup();
    usePanelStore.getState().setDeviceWorkspaceThreadId("local-thread");
    render(<PanelHarness />);
    await screen.findByRole("button", { name: /Fixture Emulator/ });
    const tab = document.getElementById("panel-devices-local-thread")!;
    tab.parentElement!.setAttribute("inert", "");
    act(() => tab.blur());
    const launcher = document.getElementById("thread-tools-local-thread")!;
    const restore = vi.spyOn(launcher, "focus");
    const callbacks: FrameRequestCallback[] = [];
    const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callbacks.push(callback);
      return 0;
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      act(() => usePanelStore.getState().closeAllPanels());
      act(() => callbacks.forEach((callback) => callback(0)));
      expect(restore).not.toHaveBeenCalled();
      launcher.style.visibility = "hidden";
      const rail = document.getElementById("thread-tool-devices-local-thread")!;
      rail.style.visibility = "visible";
      await act(() => vi.advanceTimersByTimeAsync(PANEL_EXIT_DURATION_MS));
      expect(document.activeElement).toBe(rail);
      expect(restore).not.toHaveBeenCalled();
    } finally {
      frame.mockRestore();
      restore.mockRestore();
      vi.useRealTimers();
    }
  });

  it("allows the device name to shrink beside the access status in the compact header", async () => {
    setup();
    render(<Workspace />);
    await attachControl();
    const name = screen.getByText(device.name);
    expect(name.parentElement?.style.flexShrink).toBe("1");
    expect(name.classList.contains("truncate")).toBe(true);
    expect(screen.getByLabelText("Control")).not.toBeNull();
  });

  it("removes the owned workspace before returning Escape focus to its visible panel tab", async () => {
    setup();
    render(<PanelHarness />);
    const opener = document.getElementById("panel-devices-local-thread")!;
    fireEvent.click(opener);
    await screen.findByRole("button", { name: /Fixture Emulator/ });
    const panePresentAtFocus: boolean[] = [];
    const focus = opener.focus.bind(opener);
    const restore = vi.spyOn(opener, "focus").mockImplementation(() => {
      panePresentAtFocus.push(screen.queryByTestId("device-workspace") !== null);
      focus();
    });
    try {
      const attach = screen.getByRole("button", { name: /Fixture Emulator/ });
      attach.focus();
      fireEvent.keyDown(attach, { key: "Escape" });
      await waitFor(() => expect(document.activeElement).toBe(opener));
      expect(panePresentAtFocus.length).toBeGreaterThan(0);
      expect(panePresentAtFocus.every((present) => !present)).toBe(true);
      expect(usePanelStore.getState().deviceWorkspaceThreadId).toBeNull();
    } finally {
      restore.mockRestore();
    }
  });

  it.each([
    ["visible side-rail item", true, "thread-tool-devices-local-thread"],
    ["suppressed menu item", false, "thread-tools-local-thread"],
  ] as const)(
    "restores visible focus with a %s when the panel exits",
    async (_label, railVisible, id) => {
      setup();
      usePanelStore.getState().setDeviceWorkspaceThreadId("local-thread");
      render(<PanelHarness />);
      await screen.findByRole("button", { name: /Fixture Emulator/ });
      const tab = document.getElementById("panel-devices-local-thread")!;
      tab.parentElement!.setAttribute("inert", "");
      act(() => tab.blur());
      const rail = document.getElementById("thread-tool-devices-local-thread")!;
      rail.style.visibility = railVisible ? "visible" : "hidden";
      act(() => usePanelStore.getState().closeAllPanels());
      await waitFor(() => expect(document.activeElement?.id).toBe(id));
      expect(getComputedStyle(document.activeElement!).visibility).toBe("visible");
    },
  );

  it.each([
    "another thread takes focus",
    "the workspace reopens",
    "a different device context opens",
    "another pane becomes current",
  ])("does not steal focus when %s before restoration", async (change) => {
    setup();
    usePanelStore.getState().setDeviceWorkspaceThreadId("local-thread");
    render(<PanelHarness />);
    await screen.findByRole("button", { name: /Fixture Emulator/ });
    const callbacks: FrameRequestCallback[] = [];
    const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callbacks.push(callback);
      return 0;
    });
    const opener = document.getElementById("panel-devices-local-thread")!;
    const restore = vi.spyOn(opener, "focus");
    try {
      act(() => usePanelStore.getState().closeAllPanels());
      act(() => {
        if (change === "another thread takes focus")
          screen.getByRole("button", { name: "Other thread" }).focus();
        else if (change === "another pane becomes current")
          useAppStore.setState({
            view: { kind: "thread", panes: ["local-thread", "other-thread"] },
            focusedPaneId: "other-thread",
          });
        else
          usePanelStore
            .getState()
            .setDeviceWorkspaceThreadId(
              change === "the workspace reopens" ? "local-thread" : "other-thread",
            );
      });
      const focused = document.activeElement;
      expect(callbacks.length).toBeGreaterThan(0);
      act(() => callbacks.forEach((callback) => callback(0)));
      await act(() => new Promise((resolve) => setTimeout(resolve, PANEL_EXIT_DURATION_MS + 20)));
      expect(restore).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(focused);
    } finally {
      restore.mockRestore();
      frame.mockRestore();
    }
  });

  it("handles immediate Escape only from the exact current panel tab and respects other layers", async () => {
    setup();
    render(<PanelHarness />);
    const opener = document.getElementById("panel-devices-local-thread")!;
    fireEvent.click(opener);
    await screen.findByRole("button", { name: /Fixture Emulator/ });
    const opposite = document.getElementById("thread-tool-devices-other-thread")!;
    fireEvent.keyDown(opposite, { key: "Escape" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Other thread" }), { key: "Escape" });
    expect(usePanelStore.getState().deviceWorkspaceThreadId).toBe("local-thread");
    const prevented = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    prevented.preventDefault();
    fireEvent(opener, prevented);
    expect(usePanelStore.getState().deviceWorkspaceThreadId).toBe("local-thread");
    fireEvent.keyDown(opener, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("device-workspace")).toBeNull());
    expect(usePanelStore.getState().deviceWorkspaceThreadId).toBeNull();
  });

  it("keeps the compact screenshot and inspection controls available without granting input", async () => {
    setup();
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      usePanelStore.getState().setDeviceWorkspaceThreadId("local-thread");
      render(<Workspace />);
      fireEvent.click(await screen.findByRole("button", { name: /Fixture Emulator/ }));
      fireEvent.click(screen.getByRole("button", { name: "Attach" }));
      await screen.findByRole("button", { name: "Home" });
      const detach = screen.getByRole("button", { name: "Detach" });
      act(() => detach.focus());
      expect(await screen.findByRole("tooltip")).toHaveProperty(
        "textContent",
        "Detaching leaves the device running.",
      );
      act(() => detach.blur());
      await headerAction("Screenshot");
      await waitFor(() => expect(download).toHaveBeenCalledOnce());
      await headerAction("Inspect");
      expect(await screen.findByLabelText("Device accessibility")).toHaveProperty(
        "textContent",
        "<hierarchy/>",
      );
      expect(screen.getByRole("button", { name: "Home" })).toHaveProperty("disabled", true);
      expect(mocks.deviceAction).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally {
      download.mockRestore();
    }
  });

  it("shares the selected access mode without a separate agent-consent toggle", async () => {
    setup();
    render(<Workspace />);
    fireEvent.click(await screen.findByRole("button", { name: /Fixture Emulator/ }));
    expect(
      screen.queryByRole("button", { name: /Agent access|Agent control|Agent viewing/ }),
    ).toBeNull();
    expect(screen.getByText("iOS Simulator requires a macOS host with Xcode.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Attach" }));
    await waitFor(() =>
      expect(mocks.attachDevice).toHaveBeenCalledWith(
        "host-thread",
        expect.objectContaining({ access: "view", agentAccess: "view" }),
      ),
    );
    expect(await screen.findByRole("button", { name: "Home" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Detach" }));
    await screen.findByRole("button", { name: "Control" });
    fireEvent.click(screen.getByRole("button", { name: "Control" }));
    fireEvent.click(screen.getByRole("button", { name: "Attach" }));
    await waitFor(() =>
      expect(mocks.attachDevice).toHaveBeenLastCalledWith(
        "host-thread",
        expect.objectContaining({ access: "control", agentAccess: "control" }),
      ),
    );
    expect(await screen.findByRole("button", { name: "Home" })).toHaveProperty("disabled", false);
  });
  it("reports an older host without leaving an endless loading indicator", async () => {
    setup();
    mocks.environment.mockResolvedValue({ capabilities: {} });
    render(<Workspace />);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "This host does not support the device workspace.",
    );
    expect(screen.queryByText("Loading…")).toBeNull();
    expect(mocks.deviceInventory).not.toHaveBeenCalled();
  });
  it("shows a localized failed-start warning with safe details and permits retry", async () => {
    setup();
    const inventory = {
      version: 1,
      generation,
      platforms: [
        {
          platform: "android",
          status: "ready",
          diagnostic: "Fixture: emulator exited during startup (1).",
        },
      ],
      devices: [{ ...device, state: "stopped" }],
    };
    mocks.deviceInventory.mockResolvedValue(inventory);
    render(<Workspace />);
    expect(await screen.findByText("A device failed to start.")).toBeTruthy();
    fireEvent.click(screen.getByText("Details"));
    expect(screen.getByText("Fixture: emulator exited during startup (1).")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Fixture Emulator/ }));
    expect(screen.getByRole("button", { name: "Start device" })).toHaveProperty("disabled", false);
    mocks.deviceInventory.mockResolvedValue({
      ...inventory,
      platforms: [{ platform: "android", status: "ready" }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh devices" }));
    await waitFor(() => expect(screen.queryByText("A device failed to start.")).toBeNull());
  });
  it("pauses hidden capture and all input while preserving the lease across tabs", async () => {
    setup();
    const view = render(<Workspace />);
    fireEvent.click(await screen.findByRole("button", { name: /Fixture Emulator/ }));
    fireEvent.click(screen.getByRole("button", { name: "Control" }));
    fireEvent.click(screen.getByRole("button", { name: "Attach" }));
    await screen.findByRole("button", { name: "Home" });
    await waitFor(() => expect(mocks.deviceFrame).toHaveBeenCalled());
    const input = screen.getByRole("textbox", { name: "Type on device" });
    fireEvent.change(input, { target: { value: "hidden input" } });
    const home = screen.getByRole("button", { name: "Home" });
    const preview = await screen.findByRole("button", { name: "Live device preview" });
    const captureSignal = mocks.deviceFrame.mock.calls.at(-1)?.[2];
    view.rerender(<Workspace visible={false} />);
    expect(screen.getByTestId("device-workspace").hasAttribute("inert")).toBe(true);
    expect(screen.getByTestId("device-workspace").getAttribute("aria-hidden")).toBe("true");
    expect(captureSignal).toHaveProperty("aborted", true);
    expect(home).toHaveProperty("disabled", true);
    expect(input).toHaveProperty("disabled", true);
    fireEvent.click(home);
    fireEvent.keyDown(preview, { key: "Enter" });
    fireEvent.submit(input.closest("form")!);
    expect(mocks.deviceAction).not.toHaveBeenCalled();
    expect(mocks.detachDevice).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Detach" })).toBeNull();
    const frames = mocks.deviceFrame.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(mocks.deviceFrame).toHaveBeenCalledTimes(frames);
    view.rerender(<Workspace />);
    expect(await screen.findByRole("button", { name: "Home" })).toHaveProperty("disabled", false);
    expect(mocks.attachDevice).toHaveBeenCalledTimes(1);
    expect(mocks.attachDevice).toHaveBeenCalledWith(
      "host-thread",
      expect.objectContaining({ access: "control", agentAccess: "control" }),
    );
    await waitFor(() => expect(mocks.deviceFrame.mock.calls.length).toBeGreaterThan(frames));
  });

  it("retires the captured creating host on unmount instead of resolving a replacement owner", async () => {
    setup();
    const view = render(<Workspace />);
    await attachControl();
    routing.replacement = true;
    view.unmount();
    await waitFor(() => expect(mocks.detachDevice).toHaveBeenCalledWith("host-thread", "lease-1"));
    expect(mocks.otherDetach).not.toHaveBeenCalled();
  });

  it("closes hidden live media and removes its input surface before reopening with the same lease", async () => {
    setup();
    mocks.environment.mockResolvedValue({
      capabilities: {
        deviceWorkspace: { versions: [1], livePreview: { versions: [1], modes: ["h264"] } },
      },
    });
    let previews = 0;
    mocks.openDevicePreview.mockImplementation(async () => ({
      version: 1,
      id: `preview-${++previews}`,
      sessionId: "lease-1",
      generation,
      platform: "android",
      clientDeviceId: "emulator-fixture",
      access: "control",
      mode: "h264",
      expiresAt: Date.now() + 60000,
    }));
    const view = render(<Workspace />);
    await attachControl();
    const input = await screen.findByRole("button", { name: "Fixture live input" });
    expect(input).toHaveProperty("disabled", false);
    view.rerender(<Workspace visible={false} />);
    expect(input.isConnected).toBe(false);
    expect(screen.queryByRole("button", { name: "Fixture live input" })).toBeNull();
    await waitFor(() =>
      expect(mocks.closeDevicePreview).toHaveBeenCalledWith(
        "host-thread",
        expect.objectContaining({ id: "preview-1" }),
      ),
    );
    expect(mocks.deviceFrame).not.toHaveBeenCalled();
    expect(mocks.detachDevice).not.toHaveBeenCalled();
    view.rerender(<Workspace />);
    expect(await screen.findByRole("button", { name: "Fixture live input" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(mocks.attachDevice).toHaveBeenCalledOnce();
    expect(mocks.openDevicePreview).toHaveBeenCalledTimes(2);
  });

  it("retires a late attach on its creating host without carrying its session to the replacement", async () => {
    setup();
    const pending = Promise.withResolvers<DeviceSession>();
    mocks.attachDevice.mockReturnValueOnce(pending.promise);
    const view = render(<Workspace />);
    fireEvent.click(await screen.findByRole("button", { name: /Fixture Emulator/ }));
    fireEvent.click(screen.getByRole("button", { name: "Control" }));
    fireEvent.click(screen.getByRole("button", { name: "Attach" }));
    await waitFor(() => expect(mocks.attachDevice).toHaveBeenCalledOnce());
    view.rerender(<Workspace key="replacement" threadId="replacement" />);
    routing.replacement = true;
    await act(async () =>
      pending.resolve({
        version: 1,
        id: "late-lease",
        generation,
        threadId: "host-thread",
        device,
        expiresAt: Date.now() + 60000,
        access: "control",
        agentAccess: "none",
      }),
    );
    await waitFor(() =>
      expect(mocks.detachDevice).toHaveBeenCalledWith("host-thread", "late-lease"),
    );
    expect(mocks.otherDetach).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: /Fixture Emulator/ }));
    expect(screen.getByRole("button", { name: "View only" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(
      screen.queryByRole("button", { name: /Agent access|Agent control|Agent viewing/ }),
    ).toBeNull();
    expect(mocks.attachDevice).toHaveBeenCalledOnce();
  });

  it("starts a stopped device through a temporary control lease without polling it", async () => {
    setup();
    mocks.deviceInventory.mockResolvedValue({
      version: 1,
      generation,
      platforms: [],
      devices: [{ ...device, state: "stopped" }],
    });
    render(<Workspace />);
    fireEvent.click(await screen.findByRole("button", { name: /Fixture Emulator/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start device" }));
    await waitFor(() =>
      expect(mocks.deviceAction).toHaveBeenCalledWith("host-thread", "lease-1", { kind: "start" }),
    );
    await waitFor(() => expect(mocks.detachDevice).toHaveBeenCalledOnce());
    expect(mocks.attachDevice).toHaveBeenCalledWith(
      "host-thread",
      expect.objectContaining({ access: "control", agentAccess: "none" }),
    );
    expect(mocks.deviceFrame).not.toHaveBeenCalled();
  });

  it.each(["success", "expired"] as const)(
    "ignores an old inspection's %s after replacement without clearing the new operation's busy state",
    async (outcome) => {
      setup();
      const old = Promise.withResolvers<{ text: string }>();
      const current = Promise.withResolvers<{ text: string }>();
      mocks.inspectDevice.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
      const view = render(<Workspace />);
      await attachControl();
      await headerAction("Inspect");
      await waitFor(() => expect(mocks.inspectDevice).toHaveBeenCalledTimes(1));
      await reattach();
      await headerAction("Inspect");
      await waitFor(() => expect(mocks.inspectDevice).toHaveBeenCalledTimes(2));

      await act(async () => {
        if (outcome === "expired")
          old.reject(
            new RemoteClientError("Old device access expired.", 410, "device_session_expired"),
          );
        else old.resolve({ text: "old hierarchy" });
      });
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByRole("button", { name: "Detach" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Home" })).toHaveProperty("disabled", true);
      expect(screen.queryByLabelText("Device accessibility")).toBeNull();

      await act(async () => current.resolve({ text: "replacement hierarchy" }));
      expect(screen.getByLabelText("Device accessibility").textContent).toBe(
        "replacement hierarchy",
      );
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Home" })).toHaveProperty("disabled", false),
      );
      view.unmount();
      await waitFor(() =>
        expect(mocks.detachDevice).toHaveBeenLastCalledWith("host-thread", "lease-2"),
      );
    },
  );

  it("uses the composer arrow and blocks duplicate pending text submissions", async () => {
    setup();
    const pending = Promise.withResolvers<unknown>();
    mocks.deviceAction.mockReturnValueOnce(pending.promise);
    render(<Workspace />);
    await attachControl();
    const input = screen.getByRole("textbox", { name: "Type on device" });
    const submit = screen.getByRole("button", { name: "Send" });
    expect(submit.querySelector(".lucide-arrow-up")).not.toBeNull();
    expect(submit).toHaveProperty("disabled", true);
    fireEvent.change(input, { target: { value: "device text" } });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(mocks.deviceAction).toHaveBeenCalledWith("host-thread", "lease-1", {
        kind: "text",
        text: "device text",
      }),
    );
    expect(input).toHaveProperty("disabled", true);
    expect(submit).toHaveProperty("disabled", true);
    fireEvent.submit(input.closest("form")!);
    expect(mocks.deviceAction).toHaveBeenCalledOnce();
    await act(async () => pending.resolve({}));
    await waitFor(() => expect(input).toHaveProperty("value", ""));
    expect(submit).toHaveProperty("disabled", true);
  });

  it("preserves replacement text when an old text action finishes", async () => {
    setup();
    const old = Promise.withResolvers<unknown>();
    mocks.deviceAction.mockReturnValueOnce(old.promise);
    render(<Workspace />);
    await attachControl();
    fireEvent.change(screen.getByRole("textbox", { name: "Type on device" }), {
      target: { value: "old text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(mocks.deviceAction).toHaveBeenCalledWith("host-thread", "lease-1", {
        kind: "text",
        text: "old text",
      }),
    );
    await reattach();
    fireEvent.change(screen.getByRole("textbox", { name: "Type on device" }), {
      target: { value: "replacement text" },
    });
    await act(async () => old.resolve({}));
    expect(screen.getByRole("textbox", { name: "Type on device" })).toHaveProperty(
      "value",
      "replacement text",
    );
  });

  it("still reports and clears an expired current lease", async () => {
    setup();
    mocks.inspectDevice.mockRejectedValueOnce(
      new RemoteClientError("Device access expired.", 410, "device_session_expired"),
    );
    render(<Workspace />);
    await attachControl();
    await headerAction("Inspect");
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Device access expired.",
    );
    expect(screen.queryByRole("button", { name: "Detach" })).toBeNull();
    expect(screen.getByRole("button", { name: "Attach" })).toBeTruthy();
  });

  it("renders split Navigation, Input, and Capture & View groups with Enter, Backspace, gated live Recents, and inspector copy/close", async () => {
    setup();
    const pressRecents = vi.fn<(button: "home" | "back" | "recents") => void>();
    liveFixture.status = "connecting";
    liveFixture.pressButton = pressRecents;
    mocks.environment.mockResolvedValue({
      capabilities: {
        deviceWorkspace: { versions: [1], livePreview: { versions: [1], modes: ["h264"] } },
      },
    });
    mocks.openDevicePreview.mockResolvedValue({
      version: 1,
      id: "preview-1",
      sessionId: "lease-1",
      generation,
      platform: "android",
      clientDeviceId: "emulator-fixture",
      access: "control",
      mode: "h264",
      expiresAt: Date.now() + 60000,
    });
    const view = render(<Workspace />);
    await attachControl();
    expect(screen.getByTestId("device-workspace").getAttribute("data-placement")).toBe("right");
    expect(screen.queryByRole("button", { name: /Dock to (bottom|right) panel/ })).toBeNull();
    expect(screen.getByTestId("device-session-layout")).toContainElement(
      screen.getByTestId("device-controls"),
    );
    expect(screen.getByRole("group", { name: "Navigation controls" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Input controls" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Capture and view controls" })).toBeTruthy();

    // Honest status badge: "Connecting" while grant is minted but client has not decoded a frame yet
    await waitFor(() =>
      expect(screen.getByTestId("device-stream-status").textContent).toBe("Connecting"),
    );
    expect(screen.queryByRole("button", { name: "Recents" })).toBeNull();

    // Once client reports "streaming", badge becomes "Live" and Android Recents unlocks
    liveFixture.status = "streaming";
    view.rerender(<Workspace />);
    await waitFor(() =>
      expect(screen.getByTestId("device-stream-status").textContent).toBe("Live"),
    );
    const recentsBtn = await screen.findByRole("button", { name: "Recents" });
    fireEvent.click(recentsBtn);
    expect(pressRecents).toHaveBeenCalledWith("recents");

    // Explicit Enter and Backspace controls
    fireEvent.click(screen.getByRole("button", { name: "Enter" }));
    await waitFor(() =>
      expect(mocks.deviceAction).toHaveBeenCalledWith("host-thread", "lease-1", {
        kind: "key",
        key: "enter",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Backspace" }));
    await waitFor(() =>
      expect(mocks.deviceAction).toHaveBeenCalledWith("host-thread", "lease-1", {
        kind: "key",
        key: "backspace",
      }),
    );

    // Toggle text input drawer
    const textToggle = screen.getByRole("button", { name: "Toggle text input" });
    expect(screen.getByRole("textbox", { name: "Type on device" })).toBeTruthy();
    fireEvent.click(textToggle);
    expect(screen.queryByRole("textbox", { name: "Type on device" })).toBeNull();
    fireEvent.click(textToggle);
    expect(screen.getByRole("textbox", { name: "Type on device" })).toBeTruthy();

    // Framed / Flat toggle
    expect(
      screen.getByRole("button", { name: "Fixture live input" }).getAttribute("data-framed"),
    ).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Framed preview" }));
    expect(
      screen.getByRole("button", { name: "Fixture live input" }).getAttribute("data-framed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Flat preview" }));
    expect(
      screen.getByRole("button", { name: "Fixture live input" }).getAttribute("data-framed"),
    ).toBe("false");

    // Inspect and Close inspector
    fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
    expect(await screen.findByLabelText("Device accessibility")).toHaveProperty(
      "textContent",
      "<hierarchy/>",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close inspector" }));
    expect(screen.queryByLabelText("Device accessibility")).toBeNull();
  });

  it("renders a single deduplicated live error alert with Retry live and Use snapshots actions", async () => {
    setup();
    mocks.environment.mockResolvedValue({
      capabilities: {
        deviceWorkspace: { versions: [1], livePreview: { versions: [1], modes: ["h264"] } },
      },
    });
    mocks.openDevicePreview.mockRejectedValueOnce(new Error("WebRTC transport failed."));
    render(<Workspace />);
    await attachControl();
    const alerts = await screen.findAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.textContent).toContain(
      "Live preview is unavailable. Retry or use snapshots.",
    );
    expect(screen.getByRole("button", { name: "Retry live" })).toBeTruthy();
    const fallbackButtons = screen.getAllByRole("button", { name: "Use snapshots" });
    fireEvent.click(fallbackButtons[fallbackButtons.length - 1]!);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
