// Renderer-side helper for recognizing a microphone-permission denial so the
// composer can offer an actionable "Open Settings" path instead of a dead-end
// error. getUserMedia rejects with a NotAllowedError/SecurityError DOMException
// when the OS (or Chromium) denies microphone access.
export function isMicrophoneAccessDeniedError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "SecurityError")
  );
}
