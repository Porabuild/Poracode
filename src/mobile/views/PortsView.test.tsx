// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ActivePortForward,
  RemotePortEnterResult,
  RemotePortForwardResult,
  RemotePortsState,
} from "@/shared/remote";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { StoredDesktop } from "../storage";
import { RemoteClientError } from "../remoteClient";
import { PortsView } from "./PortsView";

const client = vi.hoisted(() => ({
  listPorts: vi.fn<() => Promise<RemotePortsState>>(),
  startPortForward: vi.fn<(targetPort: number) => Promise<RemotePortForwardResult>>(),
  stopPortForward: vi.fn<(id: string) => Promise<void>>(),
  enterPortForward: vi.fn<(id: string) => Promise<RemotePortEnterResult>>(),
}));

vi.mock("../bridge", () => ({
  getRemoteBridgeClient: () => client,
}));

const activeDesktop = vi.hoisted(
  () =>
    ({
      desktopId: "d1",
      label: "Poracode on H1FCM6T4GX",
      endpoint: "http://10.0.2.2:38999/",
      appVersion: "1.0.0",
      accessToken: "tok",
      tokenExpiresAt: "2026-12-01T00:00:00.000Z",
      scopes: ["ports:forward"],
      lastSeenSeq: 0,
      pairedAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    }) satisfies StoredDesktop,
);

vi.mock("../remoteContext", () => ({
  useRemote: () => ({ activeDesktop }),
}));

const openExternal = vi.hoisted(() => vi.fn<(url: string) => Promise<void>>(async () => {}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ openExternal }),
}));

/** A never-resolving promise, so a `load()` call can be held "in flight"
 * until the test explicitly resolves it. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function forward(overrides: Partial<ActivePortForward> = {}): ActivePortForward {
  return { id: "fwd-1", targetPort: 3000, listenPort: 41234, createdAt: 0, ...overrides };
}

describe("PortsView", () => {
  afterEach(() => {
    client.listPorts.mockReset();
    client.startPortForward.mockReset();
    client.stopPortForward.mockReset();
    client.enterPortForward.mockReset();
    openExternal.mockReset();
  });

  it("does not let a stale load() response clobber an optimistic startForward update", async () => {
    // The initial mount `load()` resolves normally so the FAB (manual-entry
    // drawer trigger) renders.
    client.listPorts.mockResolvedValueOnce({ detected: [], forwards: [] });
    render(<PortsView />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Forward a port" })).toBeTruthy(),
    );

    // A manual refresh is issued and held pending (generation 2).
    const staleLoad = deferred<RemotePortsState>();
    client.listPorts.mockReturnValueOnce(staleLoad.promise);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(client.listPorts).toHaveBeenCalledTimes(2));

    // Before that stale load resolves, forward a port via the manual-entry
    // drawer opened from the FAB. This bumps the generation (invalidating the
    // pending refresh) and applies its own optimistic update; its reconcile
    // load() is held pending too.
    client.startPortForward.mockResolvedValue({
      forward: forward(),
    });
    const reconcileLoad = deferred<RemotePortsState>();
    client.listPorts.mockReturnValueOnce(reconcileLoad.promise);

    fireEvent.click(screen.getByRole("button", { name: "Forward a port" }));
    const portInput = screen.getByLabelText("Port");
    fireEvent.change(portInput, { target: { value: "3000" } });
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));

    await waitFor(() => expect(client.startPortForward).toHaveBeenCalledWith(3000));
    await waitFor(() => expect(screen.getByText("Port 3000")).toBeTruthy());

    // Now let the stale refresh (generation 2, issued before the forward
    // existed) resolve with an empty snapshot — applying it would erase the
    // just-started forward from the list.
    await act(async () => {
      staleLoad.resolve({ detected: [], forwards: [] });
      await Promise.resolve();
    });

    expect(screen.getByText("Port 3000")).toBeTruthy();
  });

  it("does not resurrect a just-stopped forward when a stale load() resolves afterward", async () => {
    const activeForward = forward();
    client.listPorts.mockResolvedValueOnce({ detected: [], forwards: [activeForward] });
    client.stopPortForward.mockResolvedValue(undefined);
    const staleLoad = deferred<RemotePortsState>();
    // The refresh button issues a second load(); hold it pending so we can
    // resolve it (stale) after the stop already landed.
    client.listPorts.mockReturnValueOnce(staleLoad.promise);
    // The reconcile load() triggered by stopForward itself; keep it pending.
    const reconcileLoad = deferred<RemotePortsState>();
    client.listPorts.mockReturnValueOnce(reconcileLoad.promise);

    render(<PortsView />);
    await waitFor(() => expect(screen.getByText("Port 3000")).toBeTruthy());

    // Kick off a manual refresh (generation N) and, before it resolves, stop
    // the forward (generation N+1's optimistic update wins). Stop forwarding
    // sits behind the row's long-press action sheet, mirroring Connections/
    // Projects (no permanently-visible icon buttons).
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(client.listPorts).toHaveBeenCalledTimes(2));

    fireEvent.contextMenu(screen.getByText("Port 3000"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Stop forwarding" }));
    await waitFor(() => expect(client.stopPortForward).toHaveBeenCalledWith(activeForward.id));
    await waitFor(() => expect(screen.queryByText("Port 3000")).toBeNull());

    // The stale refresh resolves after the stop — it must not bring the
    // forward back.
    await act(async () => {
      staleLoad.resolve({ detected: [], forwards: [activeForward] });
      await Promise.resolve();
    });

    expect(screen.queryByText("Port 3000")).toBeNull();
  });

  it("opens the enter URL returned by startPortForward when starting a fresh forward", async () => {
    client.listPorts.mockResolvedValueOnce({
      detected: [{ port: 3000, protocol: "http" }],
      forwards: [],
    });
    client.startPortForward.mockResolvedValueOnce({
      forward: forward(),
      enterPath: "/forward/fwd-1/enter?fwt=tok-fresh",
    });
    client.listPorts.mockResolvedValueOnce({ detected: [], forwards: [forward()] });

    render(<PortsView />);
    await waitFor(() => expect(screen.getByText("Web server")).toBeTruthy());

    fireEvent.click(screen.getByText("Web server"));

    await waitFor(() =>
      expect(openExternal).toHaveBeenCalledWith(
        "http://10.0.2.2:38999/forward/fwd-1/enter?fwt=tok-fresh",
      ),
    );
  });

  it("falls back to the raw LAN forward URL when the desktop hasn't minted an enter path", async () => {
    client.listPorts.mockResolvedValueOnce({
      detected: [{ port: 3000, protocol: "http" }],
      forwards: [],
    });
    // No `enterPath`: an older desktop build that predates the authenticated
    // proxy. The endpoint is direct (plain LAN http), so the raw listener URL
    // is still reachable.
    client.startPortForward.mockResolvedValueOnce({
      forward: forward(),
    });
    client.listPorts.mockResolvedValueOnce({ detected: [], forwards: [forward()] });

    render(<PortsView />);
    await waitFor(() => expect(screen.getByText("Web server")).toBeTruthy());

    fireEvent.click(screen.getByText("Web server"));

    await waitFor(() => expect(openExternal).toHaveBeenCalledWith("http://10.0.2.2:41234/"));
  });

  it("mints a fresh enter token and opens it when tapping an already-active forward", async () => {
    const activeForward = forward();
    client.listPorts.mockResolvedValueOnce({ detected: [], forwards: [activeForward] });
    client.enterPortForward.mockResolvedValueOnce({
      enterPath: "/forward/fwd-1/enter?fwt=tok-new",
    });

    render(<PortsView />);
    await waitFor(() => expect(screen.getByText("Port 3000")).toBeTruthy());

    fireEvent.click(screen.getByText("Port 3000"));

    await waitFor(() => expect(client.enterPortForward).toHaveBeenCalledWith(activeForward.id));
    await waitFor(() =>
      expect(openExternal).toHaveBeenCalledWith(
        "http://10.0.2.2:38999/forward/fwd-1/enter?fwt=tok-new",
      ),
    );
  });

  it("refreshes the list instead of opening a dead link when the forward is already closed", async () => {
    const activeForward = forward();
    client.listPorts.mockResolvedValueOnce({ detected: [], forwards: [activeForward] });
    client.enterPortForward.mockRejectedValueOnce(
      new RemoteClientError("Port forward not found.", 404, "forward_not_found"),
    );
    // The refresh triggered by the `forward_not_found` catch: the forward is
    // gone server-side too, so the row disappears.
    client.listPorts.mockResolvedValueOnce({ detected: [], forwards: [] });

    render(<PortsView />);
    await waitFor(() => expect(screen.getByText("Port 3000")).toBeTruthy());

    fireEvent.click(screen.getByText("Port 3000"));

    await waitFor(() => expect(client.enterPortForward).toHaveBeenCalledWith(activeForward.id));
    await waitFor(() => expect(client.listPorts).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("Port 3000")).toBeNull());
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("shows the port as the primary title and the PORT_LABELS framework guess as a secondary hint", async () => {
    client.listPorts.mockResolvedValueOnce({
      detected: [{ port: 4321, protocol: "http", label: "Astro" }],
      forwards: [],
    });

    render(<PortsView />);
    await waitFor(() => expect(screen.getByText("localhost:4321")).toBeTruthy());
    // "Astro" is a guess (from the port), not a fact — it renders as the
    // row's secondary meta text, not the title.
    expect(screen.getByText("Astro")).toBeTruthy();

    client.startPortForward.mockResolvedValueOnce({
      forward: forward({ targetPort: 4321 }),
      enterPath: "/forward/fwd-1/enter?fwt=tok",
    });
    client.listPorts.mockResolvedValueOnce({
      detected: [],
      forwards: [forward({ targetPort: 4321 })],
    });
    fireEvent.click(screen.getByText("localhost:4321"));
    await waitFor(() => expect(client.startPortForward).toHaveBeenCalledWith(4321));
  });

  it("hides an already-forwarded port from Detected", async () => {
    client.listPorts.mockResolvedValueOnce({
      detected: [
        { port: 3000, protocol: "http" },
        { port: 4321, protocol: "http" },
      ],
      forwards: [forward({ targetPort: 3000 })],
    });

    render(<PortsView />);
    await waitFor(() => expect(screen.getByText("Port 3000")).toBeTruthy());

    // 3000 already has an active forward, so its Detected row is redundant
    // with the Active forwards row above it and is dropped...
    expect(screen.queryByText("localhost:3000")).toBeNull();
    // ...while 4321 (not yet forwarded) still shows.
    expect(screen.getByText("localhost:4321")).toBeTruthy();
  });

  it("hides the Detected section entirely once its only detection is already forwarded", async () => {
    client.listPorts.mockResolvedValueOnce({
      detected: [{ port: 3000, protocol: "http" }],
      forwards: [forward({ targetPort: 3000 })],
    });

    render(<PortsView />);
    await waitFor(() => expect(screen.getByText("Port 3000")).toBeTruthy());

    // An empty Detected list right below a populated Active forwards list
    // would misleadingly suggest nothing is running, so the whole section
    // (heading included) is hidden instead.
    expect(screen.queryByText("Detected")).toBeNull();
  });
});
