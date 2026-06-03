import { beforeEach, describe, expect, it, vi } from "vitest";

type ToastOptions = {
  description?: string;
  actionProps?: { children?: string; onPress?: () => void };
  timeout?: number;
};
const dangerToast = vi.hoisted(() => vi.fn<(title: string, options?: ToastOptions) => void>());
const isMac = vi.hoisted(() => vi.fn<() => boolean>());
const isWindows = vi.hoisted(() => vi.fn<() => boolean>());
const openMicrophoneSettings = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock("@heroui/react", () => ({ toast: { danger: dangerToast } }));
vi.mock("@/renderer/bridge", () => ({
  isMac,
  isWindows,
  readBridge: () => ({ openMicrophoneSettings }),
}));
vi.mock("@/shared/messages", () => ({
  friendlyError: (error: unknown) =>
    `friendly:${error instanceof Error ? error.message : String(error)}`,
}));

import { formatVoiceError, showVoiceCaptureError } from "./voiceError";

beforeEach(() => {
  vi.resetAllMocks();
  isMac.mockReturnValue(false);
  isWindows.mockReturnValue(false);
  openMicrophoneSettings.mockResolvedValue(undefined);
});

describe("formatVoiceError", () => {
  it("labels a denied microphone", () => {
    expect(formatVoiceError(new DOMException("x", "NotAllowedError"))).toBe(
      "Microphone permission was denied.",
    );
  });

  it("labels a missing device", () => {
    expect(formatVoiceError(new DOMException("x", "NotFoundError"))).toBe("No microphone found.");
  });

  it("falls back to friendlyError for other errors", () => {
    expect(formatVoiceError(new Error("boom"))).toBe("friendly:boom");
  });
});

describe("showVoiceCaptureError", () => {
  it("on macOS, shows an actionable toast whose action opens microphone settings", () => {
    isMac.mockReturnValue(true);
    showVoiceCaptureError(new DOMException("x", "NotAllowedError"));
    expect(dangerToast).toHaveBeenCalledTimes(1);
    const [title, options] = dangerToast.mock.calls[0]!;
    expect(title).toBe("Microphone access is off.");
    expect(options?.actionProps?.children).toBe("Open Settings");
    options?.actionProps?.onPress?.();
    expect(openMicrophoneSettings).toHaveBeenCalledTimes(1);
  });

  it("on Windows, also shows the actionable toast", () => {
    isWindows.mockReturnValue(true);
    showVoiceCaptureError(new DOMException("x", "NotAllowedError"));
    const [title, options] = dangerToast.mock.calls[0]!;
    expect(title).toBe("Microphone access is off.");
    expect(options?.actionProps).toBeDefined();
  });

  it("on a platform without a settings deep link, falls back to the plain denial message", () => {
    // isMac and isWindows both false (e.g. Linux)
    showVoiceCaptureError(new DOMException("x", "NotAllowedError"));
    expect(dangerToast).toHaveBeenCalledWith("Microphone permission was denied.");
  });

  it("shows the plain message for non-permission errors even on macOS", () => {
    isMac.mockReturnValue(true);
    showVoiceCaptureError(new DOMException("x", "NotFoundError"));
    expect(dangerToast).toHaveBeenCalledWith("No microphone found.");
  });
});
