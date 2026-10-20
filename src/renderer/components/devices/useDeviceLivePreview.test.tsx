import { randomUUID } from "node:crypto";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DevicePreview } from "@/shared/devicePreview";
import type { DeviceSession } from "@/shared/deviceWorkspace";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useDeviceLivePreview } from "./useDeviceLivePreview";

const mocks = vi.hoisted(() => ({
  endpoint: "https://host.example",
  environment: vi.fn<
    () => Promise<{
      capabilities: {
        deviceWorkspace: {
          versions: number[];
          livePreview: { versions: number[]; modes: string[] };
        };
      };
    }>
  >(async () => ({
    capabilities: {
      deviceWorkspace: { versions: [1], livePreview: { versions: [1], modes: ["h264"] } },
    },
  })),
  openDevicePreview: vi.fn<(_id: string, _lease: string) => Promise<DevicePreview>>(),
  renewDevicePreview: vi.fn<() => Promise<DevicePreview>>(),
  closeDevicePreview: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  devicePreviewBaseUrl: vi.fn<() => string>(() => "https://host.example/bound-preview"),
  transport: {
    fetch: vi.fn<() => Promise<Response>>(),
    createWebSocket: vi.fn<() => Promise<WebSocket>>(),
  },
}));
vi.mock("./deviceClient", () => ({
  withThreadDeviceClient: (
    _thread: string,
    invoke: (client: typeof mocks, id: string) => Promise<unknown>,
  ) => invoke(mocks, "host-thread"),
}));
vi.mock("./devicePreviewTransport", () => ({
  createDevicePreviewTransport: () => mocks.transport,
}));
afterEach(() => {
  vi.clearAllMocks();
  mocks.closeDevicePreview.mockResolvedValue();
});

function lease(): DeviceSession {
  return {
    version: 1,
    generation: randomUUID(),
    id: randomUUID(),
    threadId: "host-thread",
    device: {
      id: "android:Fixture",
      platform: "android",
      name: "Fixture",
      state: "running",
      input: true,
      accessibility: true,
    },
    access: "view",
    agentAccess: "none",
    expiresAt: Date.now() + 60_000,
  };
}
function preview(session: DeviceSession): DevicePreview {
  return {
    version: 1,
    id: randomUUID(),
    generation: session.generation,
    sessionId: session.id,
    platform: "android",
    clientDeviceId: "emulator-5554",
    access: session.access,
    mode: "h264",
    expiresAt: session.expiresAt,
  };
}
const noDenied = () => {};
function Probe({
  session,
  enabled = true,
  modal = false,
  denied = noDenied,
}: {
  session: DeviceSession | null;
  enabled?: boolean;
  modal?: boolean;
  denied?: (error: unknown, sessionId: string) => void;
}) {
  const live = useDeviceLivePreview("local-thread", session, enabled, denied);
  return (
    <div data-testid="probe" data-modal={modal} data-preview={live.state?.preview.id ?? ""}>
      <button type="button" onClick={live.retry}>
        retry
      </button>
      {live.error ? <p role="alert">{live.error}</p> : null}
    </div>
  );
}

describe("preview authority above responsive mounts", () => {
  it("renders without a lease or stale error and never opens capture", () => {
    const view = render(<Probe session={null} />);
    expect(screen.getByTestId("probe").dataset.preview).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.openDevicePreview).not.toHaveBeenCalled();
    view.unmount();
  });

  it("keeps one lease/preview across responsive rerenders and closes its exact ID once", async () => {
    const session = lease();
    const value = preview(session);
    mocks.openDevicePreview.mockResolvedValue(value);
    const view = render(<Probe session={session} />);
    await waitFor(() => expect(screen.getByTestId("probe").dataset.preview).toBe(value.id));
    view.rerender(<Probe session={session} modal />);
    expect(screen.getByTestId("probe").dataset.preview).toBe(value.id);
    expect(mocks.openDevicePreview).toHaveBeenCalledTimes(1);
    expect(mocks.closeDevicePreview).not.toHaveBeenCalled();
    view.unmount();
    await waitFor(() =>
      expect(mocks.closeDevicePreview).toHaveBeenCalledExactlyOnceWith("host-thread", value),
    );
  });

  it("joins a held old setup/close before retry and cannot install it over a replacement lease", async () => {
    const oldLease = lease();
    const nextLease = lease();
    const oldValue = preview(oldLease);
    const nextValue = preview(nextLease);
    const heldSetup = Promise.withResolvers<DevicePreview>();
    const heldClose = Promise.withResolvers<void>();
    mocks.openDevicePreview.mockReturnValueOnce(heldSetup.promise).mockResolvedValueOnce(nextValue);
    mocks.closeDevicePreview.mockReturnValueOnce(heldClose.promise);
    const denied = vi.fn<(error: unknown, sessionId: string) => void>();
    const view = render(<Probe session={oldLease} denied={denied} />);
    await waitFor(() => expect(mocks.openDevicePreview).toHaveBeenCalledTimes(1));
    view.rerender(<Probe session={nextLease} denied={denied} />);
    await act(async () => heldSetup.resolve(oldValue));
    expect(screen.getByTestId("probe").dataset.preview).toBe("");
    expect(mocks.closeDevicePreview).toHaveBeenCalledExactlyOnceWith("host-thread", oldValue);
    expect(mocks.openDevicePreview).toHaveBeenCalledTimes(1);
    await act(async () => heldClose.resolve());
    await waitFor(() => expect(screen.getByTestId("probe").dataset.preview).toBe(nextValue.id));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(denied).not.toHaveBeenCalled();
    view.unmount();
    await waitFor(() =>
      expect(mocks.closeDevicePreview).toHaveBeenLastCalledWith("host-thread", nextValue),
    );
  });

  it("keeps a cancelled prior request's failure out of the replacement error/consent state", async () => {
    const oldLease = lease();
    const nextLease = lease();
    const nextValue = preview(nextLease);
    const oldSetup = Promise.withResolvers<DevicePreview>();
    mocks.openDevicePreview.mockReturnValueOnce(oldSetup.promise).mockResolvedValueOnce(nextValue);
    const denied = vi.fn<(error: unknown, sessionId: string) => void>();
    const view = render(<Probe session={oldLease} denied={denied} />);
    await waitFor(() => expect(mocks.openDevicePreview).toHaveBeenCalledTimes(1));
    view.rerender(<Probe session={nextLease} denied={denied} />);
    await act(async () => oldSetup.reject(new Error("old setup failed")));
    await waitFor(() => expect(screen.getByTestId("probe").dataset.preview).toBe(nextValue.id));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(denied).not.toHaveBeenCalled();
    view.unmount();
  });

  it("joins a snapshot-mode close before reopening and preserves the same consent", async () => {
    const session = lease();
    const first = preview(session);
    const next = preview(session);
    mocks.openDevicePreview.mockResolvedValueOnce(first).mockResolvedValueOnce(next);
    const close = Promise.withResolvers<void>();
    mocks.closeDevicePreview.mockReturnValueOnce(close.promise);
    const view = render(<Probe session={session} />);
    await waitFor(() => expect(screen.getByTestId("probe").dataset.preview).toBe(first.id));
    view.rerender(<Probe session={session} enabled={false} />);
    view.rerender(<Probe session={session} />);
    expect(mocks.openDevicePreview).toHaveBeenCalledTimes(1);
    await act(async () => close.resolve());
    await waitFor(() => expect(screen.getByTestId("probe").dataset.preview).toBe(next.id));
    expect(session.access).toBe("view");
    expect(session.agentAccess).toBe("none");
    view.unmount();
  });

  it("refuses a changed access grant and allows an explicit retry without elevating consent", async () => {
    const session = lease();
    const invalid = { ...preview(session), access: "control" as const };
    const correct = preview(session);
    const denied = vi.fn<(error: unknown, sessionId: string) => void>();
    mocks.openDevicePreview.mockResolvedValueOnce(invalid).mockResolvedValueOnce(correct);
    const view = render(<Probe session={session} denied={denied} />);
    await waitFor(() =>
      expect(denied).toHaveBeenCalledWith(expect.objectContaining({ status: 410 }), session.id),
    );
    expect(screen.getByTestId("probe").dataset.preview).toBe("");
    expect(mocks.closeDevicePreview).toHaveBeenCalledWith("host-thread", invalid);
    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    await waitFor(() => expect(screen.getByTestId("probe").dataset.preview).toBe(correct.id));
    expect(session.access).toBe("view");
    view.unmount();
  });
});
