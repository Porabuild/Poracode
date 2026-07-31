// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { DesktopsView, type DesktopsViewProps } from "./DesktopsView";
import type { StoredDesktop } from "../storage";

const platform = vi.hoisted(() => ({ native: false }));
const media = { desktopPointer: false };

// The QR scanner touches the camera / a decode lib, and the install button reads
// PWA install state — neither is exercised here, so stub them out of the tree.
vi.mock("../QrScanner", () => ({ QrScanner: () => null }));
vi.mock("../pwaInstall", () => ({
  useCanInstall: () => false,
  isStandaloneDisplay: () => false,
  isNativeApp: () => platform.native,
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
    onProbeSsh: vi.fn<DesktopsViewProps["onProbeSsh"]>(async () => ({
      fingerprint: "SHA256:test",
      algorithm: "ssh-ed25519",
    })),
    onPairSsh: vi.fn<DesktopsViewProps["onPairSsh"]>(async () => {}),
    ...overrides,
  };
  render(<DesktopsView {...props} />);
  return props;
}

describe("DesktopsView", () => {
  beforeEach(() => {
    Element.prototype.getAnimations = () => [];
    media.desktopPointer = false;
    window.matchMedia = vi.fn<(query: string) => MediaQueryList>((query) => ({
      matches: media.desktopPointer && query.includes("pointer: fine"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }));
  });

  afterEach(() => {
    platform.native = false;
    // Unmount before wiping the body: the drawer portals into <body> and this
    // hook runs before RTL auto-cleanup (afterEach is LIFO).
    cleanup();
    document.body.innerHTML = "";
  });

  it("shows an empty state and hides the pairing form until the FAB is pressed", async () => {
    renderView();
    expect(screen.getByText("No connections yet")).toBeTruthy();
    // The pairing form is behind the FAB, not rendered under the list.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByLabelText("Endpoint")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pair a connection" }));
    });
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

  it("opens connection actions from a desktop right click", async () => {
    media.desktopPointer = true;
    const props = renderView({ desktops: [desktop], activeDesktopId: "d1" });
    const row = screen.getByText("H1FCM6T4GX").closest("button");
    expect(row).toBeTruthy();
    fireEvent.click(row!);
    expect(props.onSwitch).toHaveBeenCalledWith(desktop);
    expect(screen.queryByRole("dialog", { name: "H1FCM6T4GX" })).toBeNull();
    await act(async () => {
      fireEvent.contextMenu(row!);
    });
    expect(screen.getByRole("dialog", { name: "H1FCM6T4GX" })).toBeTruthy();
  });

  it("shows the pairing form directly, without method tabs, outside the native app", async () => {
    media.desktopPointer = true;
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Pair a connection" }));
    expect(await screen.findByLabelText("Endpoint")).toBeTruthy();
    expect(screen.getByLabelText("Pairing token")).toBeTruthy();
    expect(
      screen.getByRole("dialog", { name: "Pair a connection" }).getAttribute("data-fit-content"),
    ).toBe("true");
    // The broken Local tab is gone; with a single method left there are no tabs.
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it.each(["Endpoint", "Pairing token"])(
    "splits a pairing link pasted into the %s field",
    (fieldLabel) => {
      const props = renderView();
      fireEvent.click(screen.getByRole("button", { name: "Pair a connection" }));
      fireEvent.change(screen.getByLabelText(fieldLabel), {
        target: {
          value:
            "https://poracode.com/pair?host=https%3A%2F%2Fdesktop.example.test%2F#token=lc_pair_test",
        },
      });

      expect(props.onEndpointChange).toHaveBeenCalledWith("https://desktop.example.test");
      expect(props.onTokenChange).toHaveBeenCalledWith("lc_pair_test");
    },
  );

  it("auto-opens the pairing drawer when a deep-link credential is present", async () => {
    await act(async () => {
      renderView({ showPairingHint: true });
    });
    expect(screen.getByRole("dialog", { name: "Pair a connection" })).toBeTruthy();
    expect(screen.getByText("Pairing link detected.")).toBeTruthy();
  });

  it("offers host-key verified SSH pairing in the native app", async () => {
    platform.native = true;
    const onProbeSsh = vi.fn<DesktopsViewProps["onProbeSsh"]>(async () => ({
      fingerprint: "SHA256:abc123",
      algorithm: "ssh-ed25519",
    }));
    const onPairSsh = vi.fn<DesktopsViewProps["onPairSsh"]>(async () => {});
    renderView({ onProbeSsh, onPairSsh });
    fireEvent.click(screen.getByRole("button", { name: "Pair a connection" }));
    expect(
      screen.getByRole("dialog", { name: "Pair a connection" }).getAttribute("data-fit-content"),
    ).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "SSH" }));
    });
    fireEvent.change(screen.getByLabelText("SSH target"), {
      target: { value: "dev@example.com" },
    });
    const passwordInput = document.querySelector<HTMLInputElement>('input[type="password"]');
    expect(passwordInput).toBeTruthy();
    fireEvent.change(passwordInput!, { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify host key" }));
    expect(await screen.findByText("SHA256:abc123")).toBeTruthy();
    expect(onProbeSsh).toHaveBeenCalledWith("dev@example.com", 22);
    fireEvent.click(screen.getByRole("button", { name: "Trust and connect" }));
    expect(onPairSsh).toHaveBeenCalledWith({
      target: "dev@example.com",
      port: 22,
      fingerprint: "SHA256:abc123",
      authentication: { kind: "password", password: "secret" },
    });
  });
});
