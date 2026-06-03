import { toast } from "@heroui/react";
import { isMac, isWindows, readBridge } from "@/renderer/bridge";
import { friendlyError } from "@/shared/messages";
import { isMicrophoneAccessDeniedError } from "./voicePermission";

export function formatVoiceError(error: unknown): string {
  if (isMicrophoneAccessDeniedError(error)) {
    return "Microphone permission was denied.";
  }
  if (
    error instanceof DOMException &&
    (error.name === "NotFoundError" || error.name === "DevicesNotFoundError")
  ) {
    return "No microphone found.";
  }
  return friendlyError(error);
}

// A denied microphone is recoverable, but only by re-enabling it in OS settings
// (macOS won't re-prompt once denied). Surface an actionable toast that opens
// the right privacy pane instead of a dead-end error. The deep link only exists
// on macOS/Windows, so fall back to the plain message elsewhere.
export function showVoiceCaptureError(error: unknown): void {
  if (isMicrophoneAccessDeniedError(error) && (isMac() || isWindows())) {
    toast.danger("Microphone access is off.", {
      description: "Enable microphone access in your system settings, then try again.",
      actionProps: {
        children: "Open Settings",
        onPress: () => {
          void readBridge().openMicrophoneSettings();
        },
      },
      timeout: 0,
    });
    return;
  }
  toast.danger(formatVoiceError(error));
}
