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
): RemoteAccessPairingInfo {
  return {
    status: "ready",
    httpBaseUrl: "https://desktop.tailnet.ts.net/",
    localHttpBaseUrl: "http://192.168.1.20:49152",
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

  it("switches the displayed endpoint and QR code from Tailscale to local", async () => {
    render(<RemoteAccessSettings />);

    expect(await screen.findByText("https://desktop.tailnet.ts.net")).toBeInTheDocument();
    await waitFor(() => {
      expect(toDataURLMock).toHaveBeenCalledWith(
        "https://poracode.com/pair?host=https%3A%2F%2Fdesktop.tailnet.ts.net#token=lc_pair_test",
        expect.any(Object),
      );
    });

    fireEvent.click(screen.getByRole("radio", { name: "Local" }));

    expect(await screen.findByText("http://192.168.1.20:49152")).toBeInTheDocument();
    await waitFor(() => {
      expect(toDataURLMock).toHaveBeenCalledWith(
        "https://poracode.com/pair?host=http%3A%2F%2F192.168.1.20%3A49152#token=lc_pair_test",
        expect.any(Object),
      );
    });
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
});
