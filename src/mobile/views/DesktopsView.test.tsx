// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { DesktopsView, type DesktopsViewProps } from "./DesktopsView";
import type { StoredDesktop } from "../storage";

// The QR scanner touches the camera / a decode lib, and the install button reads
// PWA install state — neither is exercised here, so stub them out of the tree.
vi.mock("../QrScanner", () => ({ QrScanner: () => null }));
vi.mock("../pwaInstall", () => ({
  useCanInstall: () => false,
  isStandaloneDisplay: () => false,
  isNativeApp: () => false,
  promptInstall: vi.fn<() => Promise<void>>(),
}));

const desktop: StoredDesktop = {
  desktopId: "d1",
  label: "Poracode on H1FCM6T4GX",
  endpoint: "http://10.0.2.2:38999/",
  appVersion: "1.0.0",
  accessToken: "tok",
  tokenExpiresAt: "2026-12-01T00:00:00.000Z",
  scopes: [],
  lastSeenSeq: 0,
  pairedAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

function renderView(overrides?: Partial<DesktopsViewProps>) {
  const props: DesktopsViewProps = {
    desktops: [],
    activeDesktopId: null,
    manualEndpoint: "",
    manualToken: "",
    canPair: false,
    showPairingHint: false,
    onEndpointChange: vi.fn<(value: string) => void>(),
    onTokenChange: vi.fn<(value: string) => void>(),
    onPair: vi.fn<() => void>(),
    onScan: vi.fn<(value: string) => void>(),
    onSwitch: vi.fn<(desktop: StoredDesktop) => void>(),
    onRename: vi.fn<(desktop: StoredDesktop, label: string) => void>(),
    onForget: vi.fn<(desktop: StoredDesktop) => void>(),
    ...overrides,
  };
  render(<DesktopsView {...props} />);
  return props;
}

describe("DesktopsView", () => {
  afterEach(() => {
    // Unmount before wiping the body: the drawer portals into <body> and this
    // hook runs before RTL auto-cleanup (afterEach is LIFO).
    cleanup();
    document.body.innerHTML = "";
  });

  it("shows an empty state and hides the pairing form until the FAB is pressed", () => {
    renderView();
    expect(screen.getByText("No connections yet")).toBeTruthy();
    // The pairing form is behind the FAB, not rendered under the list.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByLabelText("Endpoint")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Pair a connection" }));
    expect(screen.getByRole("dialog", { name: "Pair a connection" })).toBeTruthy();
    expect(screen.getByLabelText("Endpoint")).toBeTruthy();
    expect(screen.getByLabelText("Pairing token")).toBeTruthy();
  });

  it("lists paired connections", () => {
    renderView({ desktops: [desktop], activeDesktopId: "d1" });
    // The brand prefix is stripped from the row title.
    expect(screen.getByText("H1FCM6T4GX")).toBeTruthy();
    expect(screen.queryByText("No connections yet")).toBeNull();
  });

  it("auto-opens the pairing drawer when a deep-link credential is present", () => {
    renderView({ showPairingHint: true });
    expect(screen.getByRole("dialog", { name: "Pair a connection" })).toBeTruthy();
    expect(screen.getByText("Pairing link detected.")).toBeTruthy();
  });
});
