// Pauses the always-on, compositor-driven status-icon animations (the "working"
// shine sweep and the attention/finished pulses) whenever the app window is
// hidden or unfocused. Those animations otherwise keep the GPU compositor
// producing frames at the full display refresh (~120Hz on a ProMotion panel)
// for as long as any thread is working — even while the window sits in the
// background. The static glow/colour on the icons is untouched, so a
// backgrounded window still shows which threads are busy; we just stop driving
// the GPU while nobody is looking at it.
//
// Chromium already stops compositing a fully hidden/occluded page (the window's
// `backgroundThrottling` default), but a window that is merely *unfocused*
// (another app in front, or a different window on the same screen) stays
// "visible" and keeps animating at full cost. This guard closes that gap by
// toggling attributes that styles.css keys `animation-play-state: paused` off.

function syncAnimationActivity(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.toggleAttribute("data-app-hidden", document.visibilityState === "hidden");
  // `hasFocus()` is false when the renderer's window isn't the key window
  // (including when DevTools is focused in dev — harmless, the sweep just pauses).
  root.toggleAttribute("data-app-unfocused", !document.hasFocus());
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  document.addEventListener("visibilitychange", syncAnimationActivity);
  window.addEventListener("focus", syncAnimationActivity);
  window.addEventListener("blur", syncAnimationActivity);
  syncAnimationActivity();
}

export {};
