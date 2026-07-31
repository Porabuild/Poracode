import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getMediaAccessStatus = vi.hoisted(() => vi.fn<(mediaType: string) => string>());
const askForMediaAccess = vi.hoisted(() => vi.fn<(mediaType: string) => Promise<boolean>>());
const openExternal = vi.hoisted(() => vi.fn<(url: string) => Promise<void>>());

vi.mock("electron", () => ({
  systemPreferences: { getMediaAccessStatus, askForMediaAccess },
  shell: { openExternal },
}));

import {
  installSessionPermissions,
  isNavigationUrlAllowed,
  openMicrophoneSettings,
} from "./permissions";

type FakeWebContents = { getType(): string };
type RequestHandler = (
  webContents: FakeWebContents | null,
  permission: string,
  callback: (granted: boolean) => void,
) => void;

function createFakeSession() {
  let requestHandler: RequestHandler | null = null;
  const session = {
    setPermissionRequestHandler: vi.fn<(handler: RequestHandler) => void>((handler) => {
      requestHandler = handler;
    }),
    setPermissionCheckHandler: vi.fn<() => boolean>(),
  };
  installSessionPermissions(session as unknown as Parameters<typeof installSessionPermissions>[0]);
  return {
    session,
    getRequestHandler: () => requestHandler,
  };
}

function installAndCaptureRequestHandler(): RequestHandler {
  const { getRequestHandler } = createFakeSession();
  const requestHandler = getRequestHandler();
  if (!requestHandler) {
    throw new Error("installSessionPermissions did not register a request handler");
  }
  return requestHandler;
}

// The handler may answer synchronously (non-media) or asynchronously (media on
// macOS, after the OS prompt resolves); a promise around the callback covers both.
function requestPermission(
  handler: RequestHandler,
  webContents: FakeWebContents | null,
  permission: string,
): Promise<boolean> {
  return new Promise((resolve) => handler(webContents, permission, resolve));
}

const windowContents: FakeWebContents = { getType: () => "window" };
const webviewContents: FakeWebContents = { getType: () => "webview" };

const originalPlatform = process.platform;
function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
}

describe("isNavigationUrlAllowed", () => {
  it("allows http(s) navigation", () => {
    expect(isNavigationUrlAllowed("https://example.com/doc.pdf")).toBe(true);
    expect(isNavigationUrlAllowed("http://localhost:3000/")).toBe(true);
  });

  it("allows local PDF file URLs for in-app preview", () => {
    expect(isNavigationUrlAllowed("file:///C:/Users/me/Biometric%20Reuse.pdf")).toBe(true);
    expect(isNavigationUrlAllowed("file:///Users/me/report.PDF")).toBe(true);
  });

  it("blocks non-PDF local file URLs", () => {
    expect(isNavigationUrlAllowed("file:///C:/Users/me/secret.txt")).toBe(false);
    expect(isNavigationUrlAllowed("file:///etc/passwd")).toBe(false);
  });

  it("blocks dangerous schemes", () => {
    expect(isNavigationUrlAllowed("javascript:alert(1)")).toBe(false);
    expect(isNavigationUrlAllowed("chrome://settings")).toBe(false);
  });
});

// Drain microtasks so a stray *second* callback invocation (e.g. a dropped
// `return` after callback(false) falling through to the media branch) is
// observed, not just the first.
const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) so a mockReturnValue/mockResolvedValue set
  // in one test cannot leak its implementation into a later test that omits it.
  vi.resetAllMocks();
  // The mic path logs diagnostics via console.error on the non-granted branches;
  // silence them so test output stays pristine.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
});

describe("installSessionPermissions media requests on macOS", () => {
  beforeEach(() => setPlatform("darwin"));

  it("allows media when OS microphone access is already granted, without re-prompting", async () => {
    getMediaAccessStatus.mockReturnValue("granted");
    const handler = installAndCaptureRequestHandler();
    await expect(requestPermission(handler, windowContents, "media")).resolves.toBe(true);
    expect(askForMediaAccess).not.toHaveBeenCalled();
  });

  it("prompts for OS microphone access when undetermined and allows on grant", async () => {
    getMediaAccessStatus.mockReturnValue("not-determined");
    askForMediaAccess.mockResolvedValue(true);
    const handler = installAndCaptureRequestHandler();
    await expect(requestPermission(handler, windowContents, "media")).resolves.toBe(true);
    expect(askForMediaAccess).toHaveBeenCalledTimes(1);
    expect(askForMediaAccess).toHaveBeenCalledWith("microphone");
  });

  it("denies media when the user declines the OS microphone prompt", async () => {
    getMediaAccessStatus.mockReturnValue("not-determined");
    askForMediaAccess.mockResolvedValue(false);
    const handler = installAndCaptureRequestHandler();
    await expect(requestPermission(handler, windowContents, "media")).resolves.toBe(false);
  });

  // "restricted" (MDM/policy block) shares a branch with "denied"; exercise both
  // so a future split of the two paths can't silently regress.
  it.each(["denied", "restricted"])(
    "denies media without prompting when OS access is %s",
    async (status) => {
      getMediaAccessStatus.mockReturnValue(status);
      const handler = installAndCaptureRequestHandler();
      await expect(requestPermission(handler, windowContents, "media")).resolves.toBe(false);
      expect(askForMediaAccess).not.toHaveBeenCalled();
    },
  );

  it("denies media when the OS prompt throws rather than hanging the request", async () => {
    getMediaAccessStatus.mockReturnValue("not-determined");
    askForMediaAccess.mockRejectedValue(new Error("TCC unavailable"));
    const handler = installAndCaptureRequestHandler();
    await expect(requestPermission(handler, windowContents, "media")).resolves.toBe(false);
  });

  it("denies media for non-window web contents without querying the OS", async () => {
    const handler = installAndCaptureRequestHandler();
    await expect(requestPermission(handler, webviewContents, "media")).resolves.toBe(false);
    expect(getMediaAccessStatus).not.toHaveBeenCalled();
    expect(askForMediaAccess).not.toHaveBeenCalled();
  });

  it("invokes the callback exactly once on the async granted media path", async () => {
    getMediaAccessStatus.mockReturnValue("granted");
    const handler = installAndCaptureRequestHandler();
    const callback = vi.fn<(granted: boolean) => void>();
    handler(windowContents, "media", callback);
    await flushMicrotasks();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(true);
  });

  it("invokes the callback exactly once when denying a non-window media request", async () => {
    const handler = installAndCaptureRequestHandler();
    const callback = vi.fn<(granted: boolean) => void>();
    handler(webviewContents, "media", callback);
    await flushMicrotasks();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(false);
  });
});

describe("installSessionPermissions media requests off macOS", () => {
  beforeEach(() => setPlatform("win32"));

  it("allows media for a window without querying the OS", async () => {
    const handler = installAndCaptureRequestHandler();
    await expect(requestPermission(handler, windowContents, "media")).resolves.toBe(true);
    expect(getMediaAccessStatus).not.toHaveBeenCalled();
    expect(askForMediaAccess).not.toHaveBeenCalled();
  });
});

describe("openMicrophoneSettings", () => {
  it("opens the macOS Microphone privacy pane", async () => {
    setPlatform("darwin");
    await openMicrophoneSettings();
    expect(openExternal).toHaveBeenCalledWith(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    );
  });

  it("opens the Windows microphone privacy settings", async () => {
    setPlatform("win32");
    await openMicrophoneSettings();
    expect(openExternal).toHaveBeenCalledWith("ms-settings:privacy-microphone");
  });

  it("does nothing on platforms without a settings deep link", async () => {
    setPlatform("linux");
    await openMicrophoneSettings();
    expect(openExternal).not.toHaveBeenCalled();
  });
});

describe("installSessionPermissions non-media permissions", () => {
  beforeEach(() => setPlatform("darwin"));

  it("allows allow-listed permissions without touching the OS prompt", async () => {
    const handler = installAndCaptureRequestHandler();
    await expect(requestPermission(handler, windowContents, "clipboard-read")).resolves.toBe(true);
    expect(getMediaAccessStatus).not.toHaveBeenCalled();
  });

  it("denies permissions outside the allow-list", async () => {
    const handler = installAndCaptureRequestHandler();
    await expect(requestPermission(handler, windowContents, "geolocation")).resolves.toBe(false);
  });
});
