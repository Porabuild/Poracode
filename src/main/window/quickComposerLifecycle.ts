// Shared quick-composer device lifecycle for managed and standalone attach.
//
// Both modes run the same overlay state machine: submissions queue while the
// main renderer is not ready and flush exactly once on its ready ping (no loss
// when main is loading/closed, no duplicates on repeat pings); dismiss is a
// graceful overlay round-trip with main reveal; the file picker keeps
// blur/Escape suppression while open and refocuses a visible overlay after.
// The only per-mode difference is how the main window is recreated: managed
// uses the backend shell store, attach uses its ephemeral shell state. That
// (plus all Electron effects) is injected through the host, so this module
// imports Electron types only and stays unit-testable without mocks.
import type { BrowserWindow } from "electron";
import type { QuickComposerSubmission } from "@/shared/ipc";

export interface QuickComposerLifecycleHost {
  getMainWindow(): BrowserWindow | null;
  getOverlay(): BrowserWindow | null;
  setOverlay(window: BrowserWindow | null): void;
  createOverlay(): BrowserWindow;
  /** Recreate-or-return the main window (attach binds its ephemeral shell). */
  ensureMainWindow(showOnReady: boolean): BrowserWindow;
  showOverlay(window: BrowserWindow): void;
  /** Loading-aware main reveal (waits for ready-to-show when still loading). */
  revealMainWindow(window: BrowserWindow): void;
  deliverSubmission(window: BrowserWindow, submission: QuickComposerSubmission): void;
  requestOverlayDismiss(window: BrowserWindow): void;
  hideOverlay(window: BrowserWindow): void;
  pickFiles(owner: BrowserWindow): Promise<string[] | null>;
}

/** Post-submit grace period before the overlay dismisses (managed parity). */
export const QUICK_COMPOSER_SUBMIT_DISMISS_DELAY_MS = 800;
/** Grace period for the overlay's animated dismiss round-trip. */
export const QUICK_COMPOSER_REQUEST_DISMISS_DELAY_MS = 240;

export class QuickComposerLifecycle {
  private mainReady = false;
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;
  private revealMainAfterDismiss = false;
  private dialogOpen = false;
  private readonly pending: QuickComposerSubmission[] = [];

  constructor(private readonly host: QuickComposerLifecycleHost) {}

  isMainReady(): boolean {
    return this.mainReady;
  }

  isDialogOpen(): boolean {
    return this.dialogOpen;
  }

  pendingCount(): number {
    return this.pending.length;
  }

  markMainNotReady(): void {
    this.mainReady = false;
  }

  handleMainReady(): void {
    this.mainReady = true;
    this.flushSubmissions();
  }

  flushSubmissions(): void {
    if (!this.mainReady) return;
    const main = this.host.getMainWindow();
    if (!main || main.isDestroyed()) return;
    for (const submission of this.pending.splice(0)) {
      this.host.deliverSubmission(main, submission);
    }
  }

  handleSubmit(overlay: BrowserWindow, submission: QuickComposerSubmission): void {
    this.pending.push(submission);
    this.revealMainAfterDismiss = true;
    this.host.ensureMainWindow(false);
    this.flushSubmissions();
    this.restartDismissTimer(overlay, QUICK_COMPOSER_SUBMIT_DISMISS_DELAY_MS);
  }

  requestDismiss(overlay: BrowserWindow): void {
    if (overlay.isDestroyed()) return;
    this.host.requestOverlayDismiss(overlay);
    this.restartDismissTimer(overlay, QUICK_COMPOSER_REQUEST_DISMISS_DELAY_MS);
  }

  finishDismiss(overlay: BrowserWindow): void {
    this.clearDismissTimer();
    if (!overlay.isDestroyed()) this.host.hideOverlay(overlay);
    if (!this.revealMainAfterDismiss) return;
    this.revealMainAfterDismiss = false;
    this.host.revealMainWindow(this.host.ensureMainWindow(true));
  }

  toggle(): void {
    const overlay = this.host.getOverlay();
    if (overlay && !overlay.isDestroyed()) {
      if (overlay.isVisible()) {
        this.requestDismiss(overlay);
      } else {
        this.host.showOverlay(overlay);
      }
      return;
    }
    this.host.setOverlay(this.host.createOverlay());
  }

  async handlePickFiles(overlay: BrowserWindow): Promise<string[] | null> {
    if (overlay.isDestroyed()) return null;
    this.dialogOpen = true;
    const wasVisible = overlay.isVisible();
    try {
      return await this.host.pickFiles(overlay);
    } finally {
      this.dialogOpen = false;
      if (wasVisible && !overlay.isDestroyed()) this.host.showOverlay(overlay);
    }
  }

  dispose(): void {
    this.clearDismissTimer();
    this.pending.length = 0;
    this.revealMainAfterDismiss = false;
    this.dialogOpen = false;
    this.mainReady = false;
  }

  private restartDismissTimer(overlay: BrowserWindow, delayMs: number): void {
    this.clearDismissTimer();
    this.dismissTimer = setTimeout(() => this.finishDismiss(overlay), delayMs);
  }

  private clearDismissTimer(): void {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
  }
}
