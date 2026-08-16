import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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

/** What the live scanner's decoder reports for every frame it is handed. */
const liveDecode = vi.hoisted(() => vi.fn<() => Promise<string | null>>());

vi.mock("@/renderer/utils/qrDecode", () => ({
  createQrDecoder: () => ({ decode: () => liveDecode() }),
}));

const PAIRING_URL = "http://127.0.0.1:49152/#token=lc_pair_test";

/**
 * jsdom's video element never has a frame: `readyState` and `videoWidth` are
 * read-only zeros, so the scan loop would skip every frame. Report a decodable
 * frame and make `play()` resolve instead of throwing "not implemented".
 */
function stubPlayableVideo() {
  Object.defineProperty(window.HTMLMediaElement.prototype, "readyState", {
    configurable: true,
    get: () => 4,
  });
  Object.defineProperty(window.HTMLVideoElement.prototype, "videoWidth", {
    configurable: true,
    get: () => 640,
  });
  Object.defineProperty(window.HTMLVideoElement.prototype, "videoHeight", {
    configurable: true,
    get: () => 480,
  });
  window.HTMLMediaElement.prototype.play = vi.fn<() => Promise<void>>(() => Promise.resolve());
}

/** The scan card's accessible name. */
const SCAN_CARD = "Scan the desktop pairing code with the camera";

function setCamera(options: {
  /**
   * true = usable. false = provably unusable, so the surface hides the scan card
   * entirely. undefined = an environment that won't say, where the card stays and
   * the scanner itself reports why it can't start.
   */
  readonly secure: boolean | undefined;
  readonly getUserMedia?: unknown;
  /** false = enumeration reports devices but no video input. */
  readonly videoInputs?: boolean;
}) {
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value: options.secure,
  });
  const devices =
    options.videoInputs === false ? [{ kind: "audioinput" }] : [{ kind: "videoinput" }];
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia:
        options.getUserMedia === undefined
          ? () => Promise.resolve({ getTracks: () => [] })
          : options.getUserMedia,
      enumerateDevices: () => Promise.resolve(devices),
    },
  });
}

/** Opens the live scanner from the landing screen. */
function openScanner() {
  fireEvent.click(screen.getByRole("button", { name: SCAN_CARD }));
}

function setPresentation(options: {
  readonly viewport: "compact" | "desktop";
  readonly pointer?: "coarse" | "fine";
}) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches:
        query === "(max-width: 767px)"
          ? options.viewport === "compact"
          : query.includes("pointer: coarse")
            ? options.pointer === "coarse"
            : query.includes("dark"),
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
    liveDecode.mockReset();
    liveDecode.mockResolvedValue(null);
    setPresentation({ viewport: "compact", pointer: "coarse" });
    stubPlayableVideo();
    setCamera({ secure: true });
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

  it("leads with scanning and keeps the paste route collapsed", () => {
    render(<BrowserConnectionPage />);

    // The heading is the Pora·code wordmark, which reads as "Poracode" to AT.
    expect(screen.getByRole("heading")).toHaveAccessibleName("Poracode");
    expect(screen.getByRole("button", { name: SCAN_CARD })).toBeInTheDocument();
    // Almost everyone scans, so pasting a link is one tap away rather than on screen.
    const disclosure = screen.getByRole("button", { name: /Other ways to connect/ });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Pairing URL" })).not.toBeInTheDocument();
  });

  it("reveals the paste route from the disclosure and pairs from it", async () => {
    render(<BrowserConnectionPage />);

    fireEvent.click(screen.getByRole("button", { name: /Other ways to connect/ }));

    const input = screen.getByRole("textbox", { name: "Pairing URL" });
    fireEvent.change(input, { target: { value: PAIRING_URL } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(state.pairServer).toHaveBeenCalledWith({
      endpoint: "http://127.0.0.1:49152",
      token: "lc_pair_test",
    });
    await waitFor(() => expect(state.connectAll).toHaveBeenCalled());
  });

  it("opens the paste route in a bottom drawer and restores scanning when it closes", () => {
    render(<BrowserConnectionPage />);

    fireEvent.click(screen.getByRole("button", { name: /Other ways to connect/ }));

    const drawer = screen.getByRole("dialog", { name: "Other ways to connect" });
    expect(within(drawer).getByRole("textbox", { name: "Pairing URL" })).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));

    expect(screen.getByRole("button", { name: SCAN_CARD })).toBeInTheDocument();
  });

  it("keeps the QR action primary and paste route collapsed when the camera cannot be used", () => {
    // Capability failures are explained after the user chooses scanning; they
    // must not replace the connection-first screen or auto-open its drawer.
    setCamera({ secure: false });
    render(<BrowserConnectionPage />);

    const disclosure = screen.getByRole("button", { name: /Other ways to connect/ });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Pairing URL" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: SCAN_CARD })).toBeInTheDocument();

    fireEvent.click(disclosure);
    expect(screen.getByRole("textbox", { name: "Pairing URL" })).toBeInTheDocument();
  });

  it("does not replace the QR action or auto-open when enumeration reports no camera", async () => {
    setCamera({ secure: true, videoInputs: false });
    render(<BrowserConnectionPage />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: SCAN_CARD })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /Other ways to connect/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("textbox", { name: "Pairing URL" })).not.toBeInTheDocument();
  });

  it("does not auto-open the paste route when the camera API is unavailable", () => {
    setCamera({ secure: true, getUserMedia: null });
    render(<BrowserConnectionPage />);

    expect(screen.getByRole("button", { name: /Other ways to connect/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: SCAN_CARD })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Pairing URL" })).not.toBeInTheDocument();
  });

  it("rejects pasted input that is not a pairing URL", () => {
    render(<BrowserConnectionPage />);

    fireEvent.click(screen.getByRole("button", { name: /Other ways to connect/ }));
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

    const input = screen.getByLabelText("QR Code");
    expect(input).not.toHaveAttribute("capture");
    fireEvent.change(input, {
      target: { files: [new File(["qr"], "qr.png", { type: "image/png" })] },
    });
    expect(input).toHaveValue("");

    await waitFor(() =>
      expect(state.pairServer).toHaveBeenCalledWith({
        endpoint: "http://127.0.0.1:49152",
        token: "lc_pair_test",
      }),
    );
    expect(state.connectAll).toHaveBeenCalled();
  });

  describe("live camera scanner", () => {
    it("pairs from a code decoded off the camera feed", async () => {
      liveDecode.mockResolvedValue(PAIRING_URL);
      render(<BrowserConnectionPage />);

      openScanner();

      await waitFor(() =>
        expect(state.pairServer).toHaveBeenCalledWith({
          endpoint: "http://127.0.0.1:49152",
          token: "lc_pair_test",
        }),
      );
      // A successful decode closes the scanner and hands off to the handshake.
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Scan pairing QR code" }),
        ).not.toBeInTheDocument(),
      );
    });

    // Documents the invariant rather than reproducing a failure: in jsdom the
    // unmount happens to cancel the loop before it can decode twice anyway. The
    // scanner latches explicitly so a real browser's timing can't spend the
    // single-use pairing token more than once.
    it("stops decoding once a code is accepted", async () => {
      // The camera keeps the same code in frame the whole time.
      liveDecode.mockResolvedValue(PAIRING_URL);
      render(<BrowserConnectionPage />);

      openScanner();

      await waitFor(() => expect(state.pairServer).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 350));
      expect(liveDecode).toHaveBeenCalledTimes(1);
      expect(state.pairServer).toHaveBeenCalledTimes(1);
    });

    it("keeps scanning and corrects the user when the code is not a pairing code", async () => {
      liveDecode.mockResolvedValue("https://example.com/not-pairing");
      render(<BrowserConnectionPage />);

      openScanner();

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "That isn't a Poracode pairing code.",
      );
      // Still open: a stray code must not dump the user back to the start.
      expect(screen.getByRole("dialog", { name: "Scan pairing QR code" })).toBeInTheDocument();
      expect(state.pairServer).not.toHaveBeenCalled();
    });

    it("explains that scanning needs a secure context instead of hanging", async () => {
      // An environment that doesn't report secure-context status keeps the scan
      // card, so the scanner is where the user finds out it cannot start.
      setCamera({ secure: undefined });
      render(<BrowserConnectionPage />);

      openScanner();

      expect(await screen.findByText("Scanning needs a secure connection")).toBeInTheDocument();
      const dialog = screen.getByRole("dialog", { name: "Scan pairing QR code" });
      expect(
        within(dialog).getByRole("button", { name: /Paste pairing link/ }),
      ).toBeInTheDocument();
    });

    it("reports a blocked camera with a way forward", async () => {
      const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
      setCamera({ secure: true, getUserMedia: () => Promise.reject(denied) });
      render(<BrowserConnectionPage />);

      openScanner();

      expect(await screen.findByText("Camera access blocked")).toBeInTheDocument();
    });

    it("opens the collapsed paste route when falling back from the scanner", async () => {
      setCamera({ secure: undefined });
      render(<BrowserConnectionPage />);

      openScanner();
      const dialog = await screen.findByRole("dialog", { name: "Scan pairing QR code" });
      fireEvent.click(within(dialog).getByRole("button", { name: /Paste pairing link/ }));

      // Closing onto a still-collapsed disclosure would leave no visible way
      // forward, so backing out has to expand it.
      expect(screen.getByRole("textbox", { name: "Pairing URL" })).toBeInTheDocument();
      expect(
        screen.queryByRole("dialog", { name: "Scan pairing QR code" }),
      ).not.toBeInTheDocument();
    });
  });

  it("shows mobile pairing at compact width even with a fine pointer", () => {
    setPresentation({ viewport: "compact", pointer: "fine" });
    render(<BrowserConnectionPage />);

    expect(screen.getByRole("button", { name: SCAN_CARD })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Other ways to connect/ })).toBeInTheDocument();
  });

  describe("desktop-width browser", () => {
    beforeEach(() => setPresentation({ viewport: "desktop", pointer: "fine" }));

    it("shows the pairing URL field outright and offers no scan route", () => {
      render(<BrowserConnectionPage />);

      // The desktop showing the code is usually this same screen, so a webcam
      // scan is not a real option and the field is not worth demoting.
      expect(screen.getByRole("textbox", { name: "Pairing URL" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: SCAN_CARD })).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Other ways to connect/ }),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText("QR Code")).not.toBeInTheDocument();
    });

    it("keeps the desktop presentation on a wide touch-capable screen", () => {
      setPresentation({ viewport: "desktop", pointer: "coarse" });
      render(<BrowserConnectionPage />);

      expect(screen.getByRole("textbox", { name: "Pairing URL" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: SCAN_CARD })).not.toBeInTheDocument();
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
