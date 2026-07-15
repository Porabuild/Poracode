// Tracks whether the app window is hidden or unfocused so always-on animations
// can reduce their update rate in the background without stopping completely.
// At full speed those animations otherwise keep the GPU compositor producing
// frames for as long as any thread is working, even while the window is not the
// active app.
//
// Chromium already stops compositing a fully hidden/occluded page (the window's
// `backgroundThrottling` default), but a window that is merely *unfocused*
// (another app in front, or a different window on the same screen) stays
// "visible" and keeps animating at full cost. These attributes let the CSS and
// JS animation drivers use a lower background cadence instead.

function syncAnimationActivity(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.toggleAttribute("data-app-hidden", document.visibilityState === "hidden");
  // `hasFocus()` is false when the renderer's window isn't the key window
  // (including when DevTools is focused in dev — harmless, the sweep just slows).
  root.toggleAttribute("data-app-unfocused", !document.hasFocus());
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  document.addEventListener("visibilitychange", syncAnimationActivity);
  window.addEventListener("focus", syncAnimationActivity);
  window.addEventListener("blur", syncAnimationActivity);
  syncAnimationActivity();
}

export {};
