import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { BrowserConnectionPage } from "./BrowserConnectionPage";

const state = vi.hoisted(() => ({
  pairServer: vi.fn<() => Promise<void>>(),
  connectAll: vi.fn<() => Promise<void>>(),
}));

const decodeQrImageFile = vi.hoisted(() => vi.fn<(file: File) => Promise<string | null>>());

const install = vi.hoisted(() => ({
  canInstall: false,
  ios: false,
  promptInstall: vi.fn<() => Promise<boolean>>(),
}));

vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: (selector: (value: typeof state) => unknown) => selector(state),
}));

const asyncOp = vi.hoisted(() => ({ busy: false }));

vi.mock("@/renderer/hooks/useAsyncOperation", () => ({
  useAsyncOperation: () => ({
    busy: asyncOp.busy,
    error: null,
    run: (operation: () => Promise<void>) => operation(),
  }),
}));

vi.mock("@/renderer/pwa/install", () => ({
  useCanInstall: () => install.canInstall,
  isIosInstallBrowser: () => install.ios,
  promptInstall: () => install.promptInstall(),
}));

vi.mock("@/renderer/utils/qrImage", () => ({
  decodeQrImageFile: (file: File) => decodeQrImageFile(file),
}));

const PAIRING_URL = "http://127.0.0.1:49152/#token=lc_pair_test";

/** Coarse pointer = phone/tablet, the only surface where scanning is offered. */
function setPointer(kind: "coarse" | "fine") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query.includes("pointer: coarse") ? kind === "coarse" : query.includes("dark"),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

describe("BrowserConnectionPage", () => {
  beforeEach(() => {
    state.pairServer.mockReset();
    state.connectAll.mockReset();
    decodeQrImageFile.mockReset();
    install.canInstall = false;
    install.ios = false;
    install.promptInstall.mockReset();
    asyncOp.busy = false;
    setPointer("coarse");
  });

  it("replaces the scan target with the handshake animation while pairing", () => {
    asyncOp.busy = true;
    render(<BrowserConnectionPage />);

    expect(screen.getByTestId("pairing-progress")).toBeInTheDocument();
    expect(screen.getByText("Pairing…")).toBeInTheDocument();
  });

  it("recommends installing to the home screen when the browser offers it", () => {
    install.canInstall = true;
    render(<BrowserConnectionPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add to Home Screen" }));

    expect(install.promptInstall).toHaveBeenCalled();
    expect(
      screen.getByText("Install Poracode for faster access and offline launch."),
    ).toBeInTheDocument();
  });

  it("shows the Safari install recipe when there is no install prompt", () => {
    install.ios = true;
    render(<BrowserConnectionPage />);

    expect(screen.queryByRole("button", { name: "Add to Home Screen" })).not.toBeInTheDocument();
    expect(screen.getByText("In Safari, tap Share, then Add to Home Screen.")).toBeInTheDocument();
  });

  it("leads with the scan step and hides the manual URL form", () => {
    render(<BrowserConnectionPage />);

    expect(screen.getByText("Connect to Your Desktop")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan QR code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Manual URL/ })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Pairing URL" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("returns to the scan step from the manual step", () => {
    render(<BrowserConnectionPage />);

    fireEvent.click(screen.getByRole("button", { name: /Manual URL/ }));
    expect(screen.getByRole("textbox", { name: "Pairing URL" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scan QR code" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("button", { name: "Scan QR code" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Pairing URL" })).not.toBeInTheDocument();
  });

  it("pairs from a pasted pairing URL on the manual step", async () => {
    render(<BrowserConnectionPage />);

    fireEvent.click(screen.getByRole("button", { name: /Manual URL/ }));

    const input = screen.getByRole("textbox", { name: "Pairing URL" });
    fireEvent.change(input, { target: { value: PAIRING_URL } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(state.pairServer).toHaveBeenCalledWith({
      endpoint: "http://127.0.0.1:49152",
      token: "lc_pair_test",
    });
    await waitFor(() => expect(state.connectAll).toHaveBeenCalled());
  });

  it("rejects manual input that is not a pairing URL", () => {
    render(<BrowserConnectionPage />);

    fireEvent.click(screen.getByRole("button", { name: /Manual URL/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Pairing URL" }), {
      target: { value: "not-a-url" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter the pairing URL shown on your desktop.",
    );
    expect(state.pairServer).not.toHaveBeenCalled();
  });

  it("pairs from a scanned QR image", async () => {
    decodeQrImageFile.mockResolvedValue(PAIRING_URL);
    render(<BrowserConnectionPage />);

    fireEvent.change(screen.getByLabelText("QR Code"), {
      target: { files: [new File(["qr"], "qr.png", { type: "image/png" })] },
    });

    await waitFor(() =>
      expect(state.pairServer).toHaveBeenCalledWith({
        endpoint: "http://127.0.0.1:49152",
        token: "lc_pair_test",
      }),
    );
    expect(state.connectAll).toHaveBeenCalled();
  });

  describe("desktop pointer", () => {
    beforeEach(() => setPointer("fine"));

    it("leads with the pairing URL form and offers no scan action", () => {
      render(<BrowserConnectionPage />);

      expect(screen.getByRole("textbox", { name: "Pairing URL" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Scan QR code" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("QR Code")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Manual URL/ })).not.toBeInTheDocument();
    });

    it("pairs by submitting the URL field with Enter", async () => {
      render(<BrowserConnectionPage />);

      const input = screen.getByRole("textbox", { name: "Pairing URL" });
      fireEvent.change(input, { target: { value: PAIRING_URL } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(state.pairServer).toHaveBeenCalledWith({
        endpoint: "http://127.0.0.1:49152",
        token: "lc_pair_test",
      });
      await waitFor(() => expect(state.connectAll).toHaveBeenCalled());
    });

    it("shows the handshake animation in place of the app icon while pairing", () => {
      asyncOp.busy = true;
      render(<BrowserConnectionPage />);

      expect(screen.getByTestId("pairing-progress")).toBeInTheDocument();
      expect(screen.getByText("Pairing…")).toBeInTheDocument();
    });

    it("labels the install action for desktop", () => {
      install.canInstall = true;
      render(<BrowserConnectionPage />);

      expect(screen.getByRole("button", { name: "Install app" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add to Home Screen" })).not.toBeInTheDocument();
    });
  });
});
