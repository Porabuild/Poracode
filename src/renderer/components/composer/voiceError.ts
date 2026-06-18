import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { isMac, isWindows, readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import { friendlyError } from "@/shared/messages";
import { isMicrophoneAccessDeniedError } from "./voicePermission";

export function formatVoiceError(error: unknown): string {
  if (isMicrophoneAccessDeniedError(error)) {
    return i18n._(msg`Microphone permission was denied.`);
  }
  if (
    error instanceof DOMException &&
    (error.name === "NotFoundError" || error.name === "DevicesNotFoundError")
  ) {
    return i18n._(msg`No microphone found.`);
  }
  return friendlyError(error);
}

// A denied microphone is recoverable, but only by re-enabling it in OS settings
// (macOS won't re-prompt once denied). Surface an actionable toast that opens
// the right privacy pane instead of a dead-end error. The deep link only exists
// on macOS/Windows, so fall back to the plain message elsewhere.
export function showVoiceCaptureError(error: unknown): void {
  if (isMicrophoneAccessDeniedError(error) && (isMac() || isWindows())) {
    toast.danger(i18n._(msg`Microphone access is off.`), {
      description: i18n._(msg`Enable microphone access in your system settings, then try again.`),
      actionProps: {
        children: i18n._(msg`Open Settings`),
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
