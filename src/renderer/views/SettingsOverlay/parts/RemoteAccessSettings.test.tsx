import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteAccessTailscaleStatus } from "@/shared/ipc";
import type { RemoteAccessPairingInfo } from "@/shared/remote";
import { RemoteAccessSettings } from "./RemoteAccessSettings";

const { bridgeMock, pairingChangedState, sharedSettingsState, toDataURLMock } = vi.hoisted(() => ({
  bridgeMock: {
    getRemoteAccessPairing: vi.fn<() => Promise<RemoteAccessPairingInfo>>(),
    refreshRemoteAccessPairing: vi.fn<() => Promise<RemoteAccessPairingInfo>>(),
    onRemoteAccessPairingChanged:
      vi.fn<(listener: (info: RemoteAccessPairingInfo) => void) => () => void>(),
    getRemoteAccessTailscaleStatus: vi.fn<() => Promise<RemoteAccessTailscaleStatus>>(),
    openExternal: vi.fn<(url: string) => Promise<void>>(),
  },
  pairingChangedState: {
    listener: null as ((info: RemoteAccessPairingInfo) => void) | null,
  },
  sharedSettingsState: {
    remoteAccessTailscaleHttps: true,
    remoteAccessAdvertisedUrl: "",
    remotePushEnabled: true,
    setRemotePushEnabled: vi.fn<(enabled: boolean) => void>(),
    remotePushRedactContent: false,
    setRemotePushRedactContent: vi.fn<(redact: boolean) => void>(),
  },
  toDataURLMock: vi.fn<(value: string, options: unknown) => Promise<string>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridgeMock,
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (state: typeof sharedSettingsState) => unknown) =>
    selector(sharedSettingsState),
}));

vi.mock("qrcode", () => ({
  toDataURL: toDataURLMock,
}));

/** ISO expiry `offsetMs` from now, for the countdown / rotation scheduling. */
function expiryFromNow(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

/** A ready server; the code is fresh by default, so nothing rotates on open. */
function readyInfo(
  token: string,
  pairingExpiresAt: string = expiryFromNow(10 * 60_000),
): Extract<RemoteAccessPairingInfo, { status: "ready" }> {
  return {
    status: "ready",
    httpBaseUrl: "https://desktop.tailnet.ts.net/",
    localHttpBaseUrl: "http://192.168.1.20:49152",
    loopbackHttpBaseUrl: "http://127.0.0.1:49152",
    lanHttpBaseUrl: "http://192.168.1.20:49152",
    tailnetHttpBaseUrl: "http://100.64.1.20:49152",
    tailscaleHttpBaseUrl: "https://desktop.tailnet.ts.net",
    wsBaseUrl: "wss://desktop.tailnet.ts.net/",
    pairingUrl: `https://poracode.com/pair?host=https%3A%2F%2Fdesktop.tailnet.ts.net%2F#token=${token}`,
    pairingExpiresAt,
    sessions: [],
  };
}

describe("RemoteAccessSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeMock.getRemoteAccessPairing.mockResolvedValue(readyInfo("lc_pair_test"));
    bridgeMock.refreshRemoteAccessPairing.mockImplementation(() =>
      bridgeMock.getRemoteAccessPairing(),
    );
    pairingChangedState.listener = null;
    bridgeMock.onRemoteAccessPairingChanged.mockImplementation((listener) => {
      pairingChangedState.listener = listener;
      return () => {
        if (pairingChangedState.listener === listener) pairingChangedState.listener = null;
      };
    });
    bridgeMock.getRemoteAccessTailscaleStatus.mockResolvedValue({
      enabled: true,
      daemon: "running",
      serveActive: true,
      httpsUrl: "https://desktop.tailnet.ts.net",
    });
    toDataURLMock.mockResolvedValue("data:image/png;base64,test");
  });

  it("does not render a prevent-sleep control in remote access settings", () => {
    render(<RemoteAccessSettings />);

    expect(
      screen.queryByRole("switch", { name: "Prevent sleep during remote access" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Prevent sleep during remote access")).not.toBeInTheDocument();
    expect(screen.queryByText("Prevent system sleep")).not.toBeInTheDocument();
  });

  it("switches the displayed endpoint and QR code from Tailscale to LAN", async () => {
    render(<RemoteAccessSettings />);

    expect(await screen.findByText("https://desktop.tailnet.ts.net")).toBeInTheDocument();
    await waitFor(() => {
      expect(toDataURLMock).toHaveBeenCalledWith(
        "https://poracode.com/pair?host=https%3A%2F%2Fdesktop.tailnet.ts.net#token=lc_pair_test",
        expect.any(Object),
      );
    });

    fireEvent.click(screen.getByRole("radio", { name: "LAN" }));

    expect(await screen.findByText("http://192.168.1.20:49152")).toBeInTheDocument();
    await waitFor(() => {
      expect(toDataURLMock).toHaveBeenCalledWith(
        "https://poracode.com/pair?host=http%3A%2F%2F192.168.1.20%3A49152#token=lc_pair_test",
        expect.any(Object),
      );
    });
  });

  it("keeps the local link on loopback and opens that selected endpoint", async () => {
    render(<RemoteAccessSettings />);
    fireEvent.click(await screen.findByRole("radio", { name: "Local" }));
    expect(await screen.findByText("http://127.0.0.1:49152")).toBeInTheDocument();
    expect(screen.getByText("Only works on this computer.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(bridgeMock.openExternal).toHaveBeenCalledWith(
      "http://127.0.0.1:49152/#token=lc_pair_test",
    );
  });

  it("offers the Tailscale IP when HTTPS serve is unavailable", async () => {
    const info = readyInfo("lc_pair_tailnet");
    Reflect.deleteProperty(info, "tailscaleHttpBaseUrl");
    info.httpBaseUrl = `${info.localHttpBaseUrl}/`;
    bridgeMock.getRemoteAccessPairing.mockResolvedValue(info);
    render(<RemoteAccessSettings />);
    expect(await screen.findByText("http://100.64.1.20:49152")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Tailscale" })).toBeChecked();
  });

  it("disables unavailable network links and has no separate network access switch", async () => {
    const info = readyInfo("lc_pair_local");
    Reflect.deleteProperty(info, "lanHttpBaseUrl");
    Reflect.deleteProperty(info, "tailnetHttpBaseUrl");
    Reflect.deleteProperty(info, "tailscaleHttpBaseUrl");
    info.httpBaseUrl = "http://127.0.0.1:49152/";
    info.localHttpBaseUrl = "http://127.0.0.1:49152";
    bridgeMock.getRemoteAccessPairing.mockResolvedValue(info);
    render(<RemoteAccessSettings />);
    expect(await screen.findByRole("radio", { name: "LAN" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Tailscale" })).toBeDisabled();
    expect(screen.queryByRole("switch", { name: "Network access" })).not.toBeInTheDocument();
  });

  it("shows device presence and last connection time, and updates on disconnect", async () => {
    const info = readyInfo("lc_pair_devices");
    const lastConnectedAt = "2026-10-15T08:30:00.000Z";
    info.sessions = [
      {
        id: "mac",
        scopes: ["session:read"],
        client: { label: "MacBook", deviceType: "desktop", os: "macOS" },
        issuedAt: lastConnectedAt,
        expiresAt: "2026-10-16T08:30:00.000Z",
        connected: true,
        lastConnectedAt,
      },
    ];
    bridgeMock.getRemoteAccessPairing.mockResolvedValue(info);
    render(<RemoteAccessSettings />);
    fireEvent.click(await screen.findByRole("button", { name: /Paired devices/ }));
    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(screen.getByText(/^Last connected:/)).not.toHaveTextContent("unknown");
    act(() => {
      pairingChangedState.listener?.({
        ...info,
        sessions: info.sessions.map((session) => ({ ...session, connected: false })),
      });
    });
    expect(await screen.findByText("Disconnected")).toBeInTheDocument();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
  });

  it("does not invent a connection time for legacy paired devices", async () => {
    const info = readyInfo("lc_pair_legacy_device");
    info.sessions = [
      {
        id: "legacy",
        scopes: ["session:read"],
        issuedAt: "2026-10-15T08:30:00.000Z",
        expiresAt: "2026-10-16T08:30:00.000Z",
      },
    ];
    bridgeMock.getRemoteAccessPairing.mockResolvedValue(info);
    render(<RemoteAccessSettings />);
    fireEvent.click(await screen.findByRole("button", { name: /Paired devices/ }));
    expect(await screen.findByText("Last connected: unknown")).toBeInTheDocument();
  });

  it("opens the canonical desktop client in a browser", async () => {
    render(<RemoteAccessSettings />);

    fireEvent.click(await screen.findByRole("button", { name: "Open" }));

    expect(bridgeMock.openExternal).toHaveBeenCalledWith(
      "https://desktop.tailnet.ts.net/#token=lc_pair_test",
    );
  });

  it("shows the rotated pairing code when a device pairs", async () => {
    render(<RemoteAccessSettings />);

    expect(await screen.findByText("lc_pair_test")).toBeInTheDocument();
    act(() => {
      pairingChangedState.listener?.(readyInfo("lc_pair_rotated"));
    });

    expect(await screen.findByText("lc_pair_rotated")).toBeInTheDocument();
    expect(screen.queryByText("lc_pair_test")).not.toBeInTheDocument();
  });

  it("mints on open when the server's code has already lapsed", async () => {
    // The server mints its startup code once, with a 10-minute TTL; a panel
    // opened later must not show a credential the desktop has already dropped.
    bridgeMock.getRemoteAccessPairing.mockResolvedValue(
      readyInfo("lc_pair_lapsed", expiryFromNow(-60_000)),
    );
    bridgeMock.refreshRemoteAccessPairing.mockResolvedValue(readyInfo("lc_pair_fresh"));

    render(<RemoteAccessSettings />);

    expect(await screen.findByText("lc_pair_fresh")).toBeInTheDocument();
    expect(bridgeMock.refreshRemoteAccessPairing).toHaveBeenCalled();
  });

  it("counts down the displayed code's remaining validity", async () => {
    bridgeMock.getRemoteAccessPairing.mockResolvedValue(
      readyInfo("lc_pair_timed", expiryFromNow(5 * 60_000)),
    );

    render(<RemoteAccessSettings />);

    // 5:00, or 4:59 if the render lands after the first second ticks over.
    expect(await screen.findByText(/This code expires in [45]:\d\d/)).toBeInTheDocument();
    // A fresh code is left alone — no needless rotation just because it is shown.
    expect(bridgeMock.refreshRemoteAccessPairing).not.toHaveBeenCalled();
  });

  it("mints ahead of a code that is about to lapse", async () => {
    bridgeMock.getRemoteAccessPairing.mockResolvedValue(
      readyInfo("lc_pair_stale", expiryFromNow(10_000)),
    );
    bridgeMock.refreshRemoteAccessPairing.mockResolvedValue(
      readyInfo("lc_pair_renewed", expiryFromNow(10 * 60_000)),
    );

    render(<RemoteAccessSettings />);

    expect(await screen.findByText("lc_pair_renewed")).toBeInTheDocument();
  });

  it("retires the displayed code when New code is pressed", async () => {
    bridgeMock.refreshRemoteAccessPairing.mockResolvedValue(readyInfo("lc_pair_manual"));
    render(<RemoteAccessSettings />);

    expect(await screen.findByText("lc_pair_test")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New code" }));

    expect(await screen.findByText("lc_pair_manual")).toBeInTheDocument();
    expect(bridgeMock.refreshRemoteAccessPairing).toHaveBeenCalledTimes(1);
  });

  it("mints a viewer QR from the pairing access control", async () => {
    render(<RemoteAccessSettings />);
    expect(await screen.findByText("lc_pair_test")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Viewer" }));
    await waitFor(() => {
      expect(bridgeMock.refreshRemoteAccessPairing).toHaveBeenCalledWith({ preset: "viewer" });
    });
  });
});
