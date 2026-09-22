import type { CdpSession } from "./session";

const DIALOG_HISTORY_SIZE = 10;

export interface DialogEntry {
  ts: number;
  type: "alert" | "confirm" | "prompt" | "beforeunload";
  message: string;
  defaultPrompt?: string;
  url?: string;
  decision: "accepted" | "dismissed" | "answered" | "auto-dismissed";
  promptText?: string;
}

interface DialogOpening {
  url?: string;
  message: string;
  type: "alert" | "confirm" | "prompt" | "beforeunload";
  defaultPrompt?: string;
}

type Disposition = { action: "accept" | "dismiss"; promptText?: string };

/**
 * Owns the CDP-level Page.javascriptDialogOpening lifecycle. By default, any
 * dialog is auto-dismissed (preserves the existing UX where alerts don't pop
 * a modal over the embedded view). The agent can call the dialog tool to set
 * a one-shot disposition for the next dialog, allowing accept/dismiss/answer
 * flows for confirm/prompt.
 */
export class DialogController {
  private history: DialogEntry[] = [];
  private nextDisposition: Disposition | null = null;
  private waiters: Array<(opening: DialogOpening) => void> = [];
  private unsub: (() => void) | null = null;
  private cdp: CdpSession | null = null;
  private enabled = false;

  async enable(cdp: CdpSession): Promise<void> {
    if (this.enabled) return;
    this.enabled = true;
    this.cdp = cdp;
    await cdp.send("Page.enable");
    this.unsub = cdp.on("Page.javascriptDialogOpening", (params) => {
      void this.onOpening(params as DialogOpening);
    });
  }

  private async onOpening(opening: DialogOpening): Promise<void> {
    const cdp = this.cdp;
    if (!cdp) return;
    // Wake waiters first so the agent sees the prompt before we auto-act.
    const waiters = this.waiters.slice();
    this.waiters = [];
    for (const w of waiters) {
      try {
        w(opening);
      } catch {}
    }
    const disp = this.nextDisposition;
    this.nextDisposition = null;
    let entry: DialogEntry;
    if (disp) {
      const accept = disp.action === "accept";
      const params: Record<string, unknown> = { accept };
      if (accept && disp.promptText != null) params.promptText = disp.promptText;
      try {
        await cdp.send("Page.handleJavaScriptDialog", params);
      } catch {}
      entry = {
        ts: Date.now(),
        type: opening.type,
        message: opening.message,
        decision:
          disp.action === "accept"
            ? disp.promptText != null
              ? "answered"
              : "accepted"
            : "dismissed",
        ...(opening.defaultPrompt != null ? { defaultPrompt: opening.defaultPrompt } : {}),
        ...(opening.url ? { url: opening.url } : {}),
        ...(disp.promptText != null ? { promptText: disp.promptText } : {}),
      };
    } else {
      // No agent-set disposition: default policy is "auto-dismiss". For confirm
      // this returns false; for beforeunload this lets navigation proceed.
      try {
        await cdp.send("Page.handleJavaScriptDialog", { accept: false });
      } catch {}
      entry = {
        ts: Date.now(),
        type: opening.type,
        message: opening.message,
        decision: "auto-dismissed",
        ...(opening.defaultPrompt != null ? { defaultPrompt: opening.defaultPrompt } : {}),
        ...(opening.url ? { url: opening.url } : {}),
      };
    }
    this.pushHistory(entry);
  }

  /** Set the disposition for the next dialog that opens within timeoutMs.
   *  Returns the dialog metadata once it appears, or null on timeout. */
  async waitForNext(disposition: Disposition, timeoutMs: number): Promise<DialogEntry | null> {
    this.nextDisposition = disposition;
    const deadline = Date.now() + Math.max(50, Math.min(60_000, timeoutMs));
    const baseline = this.history.length;
    while (Date.now() < deadline) {
      if (this.history.length > baseline) {
        return this.history[this.history.length - 1] ?? null;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    // Cancel — leave dispositions in place only if the agent explicitly wants
    // them; otherwise clear to avoid leaking into unrelated dialogs.
    this.nextDisposition = null;
    return null;
  }

  setNextDisposition(disposition: Disposition): void {
    this.nextDisposition = disposition;
  }

  recent(limit = 10): DialogEntry[] {
    if (limit >= this.history.length) return this.history.slice();
    return this.history.slice(this.history.length - limit);
  }

  clear(): void {
    this.history = [];
  }

  private pushHistory(entry: DialogEntry): void {
    this.history.push(entry);
    if (this.history.length > DIALOG_HISTORY_SIZE) {
      this.history.splice(0, this.history.length - DIALOG_HISTORY_SIZE);
    }
  }

  dispose(): void {
    try {
      this.unsub?.();
    } catch {}
    this.unsub = null;
    this.cdp = null;
    this.history = [];
    this.nextDisposition = null;
    this.waiters = [];
    this.enabled = false;
  }
}
