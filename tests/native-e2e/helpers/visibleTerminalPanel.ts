import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ManagedCdpClient } from "./managedAppSession.ts";

/**
 * Visible integrated-Terminal-panel calibration leg.
 *
 * The reference workload's visible terminal is the app's own Terminal panel:
 * the panel creates a dedicated shell id (`shell:<uuid>`), owns its lifecycle,
 * and starts it through the production `startDeferredPanelShell` path. The
 * harness only drives real UI controls (project context menu -> "Open
 * Terminal") and then reads the rendered surface; it never starts a shell on
 * an app-managed provider thread id and never injects synthetic bytes into the
 * renderer. In particular it never issues a raw supervisor `startShell` for the
 * app-owned panel shell: that bypasses the renderer's `shellStartRegistry`, so
 * the panel's deferred start stays armed and a later fit re-issues `startShell`
 * for the same id, replacing the tested PTY generation (root cause recorded in
 * `a0-terminal-investigation.md`). When the app's own deferred start misses in
 * a given layout, only bounded, recorded UI-level layout nudges are allowed; if
 * the shell still does not start, the run fails as a harness blocker. Terminal
 * input is trusted keyboard input typed into the mounted xterm's helper
 * textarea, exactly like a user typing; the production `writeTerminal`
 * procedure is a declared functional fallback only and never counts as the
 * ordinary keyboard journey.
 *
 * Rendered-text evidence: xterm's default renderer is WebGL, which paints to a
 * canvas and leaves no text in the DOM. When `.xterm-rows` carries no text the
 * helper triggers the production WebGL context-loss fallback (xterm disposes
 * the addon and repaints with the DOM renderer) and records that it did so.
 * Every byte shown is still real PTY output; only the renderer changes.
 */

export const TERMINAL_SHELL_SELECTOR = ".poracode-terminal-shell";
export const TERMINAL_TEXTAREA_SELECTOR = `${TERMINAL_SHELL_SELECTOR} .xterm-helper-textarea`;
export const TERMINAL_ROWS_SELECTOR = `${TERMINAL_SHELL_SELECTOR} .xterm-rows`;

export interface TerminalPanelOpenAttempt {
  readonly path:
    | "already-open"
    | "project-context-menu"
    | "keyboard-toggle"
    | "sidebar-terminal-button";
  readonly detail: string;
  readonly surfaceVisibleAfter: boolean;
  readonly waitedMs: number;
}

export interface TerminalPanelOpenEvidence {
  readonly openedAtMs: number;
  readonly path: TerminalPanelOpenAttempt["path"] | "none";
  readonly projectHeaderFound: boolean;
  readonly projectHeaderText: string | null;
  readonly contextMenuItems: readonly string[];
  readonly matchedItemLabel: string | null;
  readonly clickedItemCenter: { readonly x: number; readonly y: number } | null;
  readonly surfaceVisible: boolean;
  readonly surfaceRect: TerminalRect | null;
  readonly polls: number;
  readonly waitedMs: number;
  readonly attempts: readonly TerminalPanelOpenAttempt[];
  readonly errors: readonly string[];
}

export interface TerminalRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TerminalSurfaceEvidence {
  readonly present: boolean;
  readonly visible: boolean;
  readonly rect: TerminalRect | null;
  readonly xtermCount: number;
  readonly rowsElementPresent: boolean;
  readonly rowsText: string;
  readonly rowsTextLength: number;
  readonly canvasCount: number;
  readonly renderer: "dom-rows" | "canvas-no-dom-text" | "missing";
  readonly shellTitle: string | null;
}

function evaluateSurface(cdp: ManagedCdpClient): Promise<TerminalSurfaceEvidence> {
  return cdp.evaluate<TerminalSurfaceEvidence>(
    `(() => {
      const shell = document.querySelector(${JSON.stringify(TERMINAL_SHELL_SELECTOR)});
      if (!shell) {
        return { present: false, visible: false, rect: null, xtermCount: 0,
          rowsElementPresent: false, rowsText: "", rowsTextLength: 0, canvasCount: 0,
          renderer: "missing", shellTitle: null };
      }
      const rect = shell.getBoundingClientRect();
      const rows = shell.querySelector(".xterm-rows");
      const rowsText = rows ? (rows.textContent ?? "") : "";
      const canvasCount = shell.querySelectorAll("canvas").length;
      const xtermCount = shell.querySelectorAll(".xterm").length;
      const titleEl = document.querySelector(".poracode-terminal-shell [aria-label]");
      return {
        present: true,
        visible: rect.width > 0 && rect.height > 0,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        xtermCount,
        rowsElementPresent: rows !== null,
        rowsText,
        rowsTextLength: rowsText.length,
        canvasCount,
        renderer: rows && rowsText.length > 0 ? "dom-rows" : canvasCount > 0 ? "canvas-no-dom-text" : "missing",
        shellTitle: titleEl ? titleEl.getAttribute("aria-label") : null,
      };
    })()`,
  );
}

export function readTerminalSurface(cdp: ManagedCdpClient): Promise<TerminalSurfaceEvidence> {
  return evaluateSurface(cdp);
}

/**
 * Opens the integrated Terminal panel through real UI paths and records every
 * attempt. The grouped sidebar's project context menu is tried first; when the
 * sidebar is not rendered (compact/flat layout), the production
 * `terminal.toggle` keyboard binding (Ctrl+`) is dispatched as trusted key
 * events, followed by the sidebar terminal icon when it exists. No state is
 * forced through a DEV store seam.
 */
export async function openIntegratedTerminalPanel(input: {
  readonly cdp: ManagedCdpClient;
  readonly timeoutMs?: number;
  readonly itemMatcher?: RegExp;
}): Promise<TerminalPanelOpenEvidence> {
  const cdp = input.cdp;
  const timeoutMs = input.timeoutMs ?? 30_000;
  const startedAt = Date.now();
  const errors: string[] = [];
  const attempts: TerminalPanelOpenAttempt[] = [];
  let polls = 0;
  let projectHeaderFound = false;
  let projectHeaderText: string | null = null;
  let contextMenuItems: string[] = [];
  let matchedItemLabel: string | null = null;
  let clickedItemCenter: { readonly x: number; readonly y: number } | null = null;

  const waitForSurface = async (budgetMs: number): Promise<TerminalSurfaceEvidence | null> => {
    const deadline = Date.now() + budgetMs;
    let surface = await evaluateSurface(cdp).catch(() => null);
    while (!(surface?.present === true && surface.visible) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      polls += 1;
      surface = await evaluateSurface(cdp).catch(() => surface);
    }
    return surface;
  };

  const initial = await evaluateSurface(cdp).catch(() => null);
  if (initial?.present === true && initial.visible) {
    attempts.push({
      path: "already-open",
      detail: "terminal surface was already mounted and visible",
      surfaceVisibleAfter: true,
      waitedMs: 0,
    });
    return {
      openedAtMs: startedAt,
      path: "already-open",
      projectHeaderFound: false,
      projectHeaderText: null,
      contextMenuItems: [],
      matchedItemLabel: null,
      clickedItemCenter: null,
      surfaceVisible: true,
      surfaceRect: initial.rect,
      polls,
      waitedMs: Date.now() - startedAt,
      attempts,
      errors,
    };
  }

  // Path 1: grouped sidebar project header -> "Open Terminal".
  const header = await cdp.evaluate<{
    readonly found: boolean;
    readonly text: string | null;
    readonly center: { readonly x: number; readonly y: number } | null;
  }>(
    `(() => {
      const el = document.querySelector(".poracode-sidebar-project-nudge");
      if (!el) return { found: false, text: null, center: null };
      el.scrollIntoView({ block: "center" });
      const rect = el.getBoundingClientRect();
      return {
        found: true,
        text: (el.textContent ?? "").trim().slice(0, 200),
        center: rect.width > 0 && rect.height > 0
          ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
          : null,
      };
    })()`,
  );
  projectHeaderFound = header.found;
  projectHeaderText = header.text;
  if (header.found && header.center) {
    const { x, y } = header.center;
    try {
      await Promise.all([
        cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" }),
        cdp.send("Input.dispatchMouseEvent", {
          type: "mousePressed",
          x,
          y,
          button: "right",
          buttons: 2,
          clickCount: 1,
        }),
        cdp.send("Input.dispatchMouseEvent", {
          type: "mouseReleased",
          x,
          y,
          button: "right",
          buttons: 0,
          clickCount: 1,
        }),
      ]);
    } catch (error) {
      errors.push(
        `context-menu dispatch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const matcher = input.itemMatcher ?? /open terminal/i;
    let matched: {
      readonly label: string;
      readonly center: { readonly x: number; readonly y: number };
    } | null = null;
    const menuDeadline = Date.now() + Math.min(10_000, timeoutMs);
    while (matched === null && Date.now() < menuDeadline) {
      polls += 1;
      const menu = await cdp
        .evaluate<{
          readonly items: readonly string[];
          readonly matched: {
            readonly label: string;
            readonly center: { readonly x: number; readonly y: number };
          } | null;
        }>(
          `(() => {
            const nodes = [...document.querySelectorAll('[role="menuitem"]')];
            const items = nodes.map((node) => (node.textContent ?? "").trim()).filter(Boolean);
            for (const node of nodes) {
              const label = (node.textContent ?? "").trim();
              if (!label) continue;
              if (${matcher}.test(label)) {
                const rect = node.getBoundingClientRect();
                return { items, matched: { label, center: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } } };
              }
            }
            return { items, matched: null };
          })()`,
        )
        .catch(() => ({ items: [] as readonly string[], matched: null }));
      contextMenuItems = [...menu.items];
      matched = menu.matched;
      if (matched === null) await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (matched) {
      matchedItemLabel = matched.label;
      clickedItemCenter = matched.center;
      try {
        await cdp.dispatchTrustedClickAt(matched.center);
      } catch (error) {
        errors.push(
          `menu item click failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const surface = await waitForSurface(Math.min(15_000, timeoutMs));
      const visible = surface?.present === true && surface.visible;
      attempts.push({
        path: "project-context-menu",
        detail: `clicked context-menu item "${matched.label}"`,
        surfaceVisibleAfter: visible,
        waitedMs: Date.now() - startedAt,
      });
      if (visible) {
        return {
          openedAtMs: startedAt,
          path: "project-context-menu",
          projectHeaderFound,
          projectHeaderText,
          contextMenuItems,
          matchedItemLabel,
          clickedItemCenter,
          surfaceVisible: true,
          surfaceRect: surface?.rect ?? null,
          polls,
          waitedMs: Date.now() - startedAt,
          attempts,
          errors,
        };
      }
    } else {
      errors.push(
        `no context-menu item matched ${String(matcher)} (items: ${contextMenuItems.join(" | ") || "none"})`,
      );
    }
  } else {
    errors.push(`project header missing (found=${String(header.found)})`);
  }

  // Path 2: production `terminal.toggle` keyboard binding (Ctrl+`).
  try {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 10,
      y: 10,
      button: "none",
    });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: "`",
      code: "Backquote",
      windowsVirtualKeyCode: 192,
      nativeVirtualKeyCode: 192,
      modifiers: 2,
    });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "`",
      code: "Backquote",
      windowsVirtualKeyCode: 192,
      nativeVirtualKeyCode: 192,
      modifiers: 2,
    });
  } catch (error) {
    errors.push(
      `terminal.toggle key dispatch failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const toggleSurface = await waitForSurface(Math.min(20_000, timeoutMs));
  const toggleVisible = toggleSurface?.present === true && toggleSurface.visible;
  attempts.push({
    path: "keyboard-toggle",
    detail: "dispatched Ctrl+` (production terminal.toggle binding)",
    surfaceVisibleAfter: toggleVisible,
    waitedMs: Date.now() - startedAt,
  });
  if (toggleVisible) {
    return {
      openedAtMs: startedAt,
      path: "keyboard-toggle",
      projectHeaderFound,
      projectHeaderText,
      contextMenuItems,
      matchedItemLabel,
      clickedItemCenter,
      surfaceVisible: true,
      surfaceRect: toggleSurface?.rect ?? null,
      polls,
      waitedMs: Date.now() - startedAt,
      attempts,
      errors,
    };
  }

  // Path 3: the sidebar terminal icon button (may be revealed on hover).
  const buttonCenter = await cdp
    .evaluate<{ readonly x: number; readonly y: number } | null>(
      `(() => {
        const button = [...document.querySelectorAll("button")].find((node) =>
          (node.getAttribute("aria-label") ?? "").startsWith("Terminal for "),
        );
        if (!button) return null;
        const rect = button.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      })()`,
    )
    .catch(() => null);
  if (buttonCenter) {
    try {
      await cdp.dispatchTrustedClickAt(buttonCenter);
    } catch (error) {
      errors.push(
        `sidebar terminal button click failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const buttonSurface = await waitForSurface(Math.min(20_000, timeoutMs));
    const buttonVisible = buttonSurface?.present === true && buttonSurface.visible;
    attempts.push({
      path: "sidebar-terminal-button",
      detail: "clicked the sidebar terminal icon button",
      surfaceVisibleAfter: buttonVisible,
      waitedMs: Date.now() - startedAt,
    });
    if (buttonVisible) {
      return {
        openedAtMs: startedAt,
        path: "sidebar-terminal-button",
        projectHeaderFound,
        projectHeaderText,
        contextMenuItems,
        matchedItemLabel,
        clickedItemCenter,
        surfaceVisible: true,
        surfaceRect: buttonSurface?.rect ?? null,
        polls,
        waitedMs: Date.now() - startedAt,
        attempts,
        errors,
      };
    }
  } else {
    errors.push("sidebar terminal icon button not present");
  }

  return {
    openedAtMs: startedAt,
    path: "none",
    projectHeaderFound,
    projectHeaderText,
    contextMenuItems,
    matchedItemLabel,
    clickedItemCenter,
    surfaceVisible: false,
    surfaceRect: null,
    polls,
    waitedMs: Date.now() - startedAt,
    attempts,
    errors,
  };
}

// ── App-owned shell discovery ───────────────────────────────────────────────

export interface TerminalShellDiscovery {
  readonly terminalIds: readonly string[];
  readonly source: "react-props" | "none";
  readonly note: string;
}

/**
 * Reads the mounted `XTermSurface` component's `terminalId` prop from the DOM
 * node's React fiber chain. Read-only: the id is the app-generated dedicated
 * panel shell (`shell:<uuid>`), never a provider thread id, and nothing about
 * the component is mutated.
 */
export function discoverTerminalShellId(cdp: ManagedCdpClient): Promise<TerminalShellDiscovery> {
  return cdp.evaluate<TerminalShellDiscovery>(
    `(() => {
      const shell = document.querySelector(${JSON.stringify(TERMINAL_SHELL_SELECTOR)});
      if (!shell) return { terminalIds: [], source: "none", note: "no terminal surface mounted" };
      const fiberKey = Object.keys(shell).find((key) => key.startsWith("__reactFiber$"));
      let fiber = fiberKey ? shell[fiberKey] : null;
      const ids = [];
      for (let depth = 0; fiber && depth < 40; depth += 1, fiber = fiber.return) {
        const props = fiber.memoizedProps;
        if (props && typeof props.terminalId === "string" && !ids.includes(props.terminalId)) {
          ids.push(props.terminalId);
        }
      }
      return {
        terminalIds: ids,
        source: ids.length > 0 ? "react-props" : "none",
        note: ids.length > 0
          ? "terminalId read from the mounted XTermSurface fiber chain (read-only)"
          : "no terminalId prop found on the fiber chain",
      };
    })()`,
  );
}

// ── Rendered-text evidence ──────────────────────────────────────────────────

export interface TerminalDomTextEvidence {
  readonly text: string;
  readonly length: number;
  readonly rendererBefore: string;
  readonly rendererAfter: string;
  readonly contextLossTriggered: boolean;
  readonly contextLossError: string | null;
  readonly contextLossSupported: boolean;
  readonly canvasReports: readonly {
    readonly className: string;
    readonly hasWebgl: boolean;
    readonly hasLoseContext: boolean;
  }[];
  readonly waits: number;
}

/**
 * Returns the terminal's rendered text from the DOM rows. When the WebGL
 * renderer owns the surface (canvas, no DOM rows), it triggers the documented
 * WebGL context-loss fallback so xterm repaints through its DOM renderer, then
 * reads the rows. The trigger, its result and the renderer kinds observed on
 * both sides are recorded; no bytes are injected and no state is forced.
 */
export async function ensureRenderedTerminalDomText(input: {
  readonly cdp: ManagedCdpClient;
  readonly timeoutMs?: number;
}): Promise<TerminalDomTextEvidence> {
  const cdp = input.cdp;
  const timeoutMs = input.timeoutMs ?? 8_000;
  const initial = await evaluateSurface(cdp);
  if (initial.rowsTextLength > 0) {
    return {
      text: initial.rowsText,
      length: initial.rowsTextLength,
      rendererBefore: initial.renderer,
      rendererAfter: initial.renderer,
      contextLossTriggered: false,
      contextLossError: null,
      contextLossSupported: false,
      canvasReports: [],
      waits: 0,
    };
  }
  const loss = await cdp
    .evaluate<{
      readonly supported: boolean;
      readonly triggered: boolean;
      readonly error: string | null;
      readonly canvases: readonly {
        readonly className: string;
        readonly hasWebgl: boolean;
        readonly hasLoseContext: boolean;
      }[];
    }>(
      `(() => {
        const canvases = [...document.querySelectorAll(${JSON.stringify(TERMINAL_SHELL_SELECTOR)})].flatMap((shell) => [...shell.querySelectorAll("canvas")]);
        const reports = [];
        for (const canvas of canvases) {
          const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
          const ext = gl ? gl.getExtension("WEBGL_lose_context") : null;
          reports.push({
            className: typeof canvas.className === "string" ? canvas.className : "",
            hasWebgl: gl !== null && gl !== undefined,
            hasLoseContext: ext !== null && ext !== undefined,
          });
          if (gl && ext) {
            ext.loseContext();
            return { supported: true, triggered: true, error: null, canvases: reports };
          }
        }
        return {
          supported: reports.some((report) => report.hasWebgl),
          triggered: false,
          error: canvases.length === 0 ? "no terminal canvas" : "no terminal canvas exposes WEBGL_lose_context",
          canvases: reports,
        };
      })()`,
    )
    .catch((error) => ({
      supported: false,
      triggered: false,
      error: error instanceof Error ? error.message : String(error),
      canvases: [] as readonly {
        readonly className: string;
        readonly hasWebgl: boolean;
        readonly hasLoseContext: boolean;
      }[],
    }));
  const startedAt = Date.now();
  let surface = await evaluateSurface(cdp);
  let waits = 0;
  while (surface.rowsTextLength === 0 && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    waits += 1;
    surface = await evaluateSurface(cdp).catch(() => surface);
  }
  return {
    text: surface.rowsText,
    length: surface.rowsTextLength,
    rendererBefore: initial.renderer,
    rendererAfter: surface.renderer,
    contextLossTriggered: loss.triggered,
    contextLossError: loss.error,
    contextLossSupported: loss.supported,
    canvasReports: loss.canvases,
    waits,
  };
}

export interface TerminalFeedStatusSample {
  readonly atMs: number;
  /** Overlay message, or null when no status overlay is mounted. */
  readonly text: string | null;
}

/**
 * Read-only sample of the mounted `TerminalFeedStatus` overlay: the app's own
 * watch-state surface (retryable "Reconnecting to terminal…", forbidden, or
 * the non-retryable "Terminal output is unavailable."). Sampling it over the
 * wait window records watch re-arm/reset timing without instrumenting the
 * frozen renderer.
 */
export async function readTerminalFeedStatusOverlay(cdp: ManagedCdpClient): Promise<string | null> {
  return cdp
    .evaluate<string | null>(
      `(() => {
        const shell = document.querySelector(${JSON.stringify(TERMINAL_SHELL_SELECTOR)});
        if (!shell) return null;
        const status = shell.querySelector('[role="status"]');
        if (!status) return null;
        const text = (status.textContent ?? "").trim();
        return text.length > 0 ? text : null;
      })()`,
    )
    .catch(() => null);
}

export interface TerminalTextWaitEvidence {
  readonly marker: string;
  readonly found: boolean;
  readonly waitedMs: number;
  readonly polls: number;
  readonly textLength: number;
  readonly tailPreview: string;
  readonly domText: TerminalDomTextEvidence;
  /**
   * Status-overlay transitions observed while waiting (timestamped, read-only).
   * Bounded: a transition is recorded only when the text changes.
   */
  readonly feedStatusTimeline: readonly TerminalFeedStatusSample[];
  readonly feedStatusFinal: string | null;
}

export async function waitForTerminalRenderedText(input: {
  readonly cdp: ManagedCdpClient;
  readonly marker: string;
  readonly timeoutMs?: number;
}): Promise<TerminalTextWaitEvidence> {
  const timeoutMs = input.timeoutMs ?? 15_000;
  const startedAt = Date.now();
  let polls = 0;
  let domText = await ensureRenderedTerminalDomText({ cdp: input.cdp });
  const feedStatusTimeline: TerminalFeedStatusSample[] = [];
  let lastFeedStatus: string | null | undefined;
  const sampleFeedStatus = async (): Promise<string | null> => {
    const text = await readTerminalFeedStatusOverlay(input.cdp);
    if (lastFeedStatus === undefined || text !== lastFeedStatus) {
      if (feedStatusTimeline.length < 40) {
        feedStatusTimeline.push({ atMs: Date.now() - startedAt, text });
      }
      lastFeedStatus = text;
    }
    return text;
  };
  await sampleFeedStatus();
  for (;;) {
    polls += 1;
    if (domText.text.includes(input.marker)) {
      const feedStatusFinal = await sampleFeedStatus();
      return {
        marker: input.marker,
        found: true,
        waitedMs: Date.now() - startedAt,
        polls,
        textLength: domText.length,
        tailPreview: domText.text.slice(-400),
        domText,
        feedStatusTimeline,
        feedStatusFinal,
      };
    }
    if (Date.now() - startedAt >= timeoutMs) {
      const feedStatusFinal = await sampleFeedStatus();
      return {
        marker: input.marker,
        found: false,
        waitedMs: Date.now() - startedAt,
        polls,
        textLength: domText.length,
        tailPreview: domText.text.slice(-400),
        domText,
        feedStatusTimeline,
        feedStatusFinal,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    domText = await ensureRenderedTerminalDomText({ cdp: input.cdp });
    await sampleFeedStatus();
  }
}

export interface TerminalDomDiagnostics {
  readonly shellPresent: boolean;
  readonly shellRect: TerminalRect | null;
  readonly xtermCount: number;
  readonly canvasCount: number;
  readonly canvasHasWebgl: boolean;
  readonly canvasSizes: readonly string[];
  readonly rowsTextLength: number;
  readonly terminalTabLabels: readonly string[];
  readonly visibilityState: string;
  readonly hasFocus: boolean;
  /** rAF opportunities observed over a 400 ms probe; 0 means frames are paused. */
  readonly rafFrames400Ms: number;
  readonly ancestorStyles: readonly string[];
  readonly bodyTextTail: string;
}

/** Read-only live DOM/state snapshot for a terminal-panel failure report. */
export async function captureTerminalDomDiagnostics(
  cdp: ManagedCdpClient,
): Promise<TerminalDomDiagnostics> {
  return cdp.evaluate<TerminalDomDiagnostics>(
    `(async () => {
      const shell = document.querySelector(${JSON.stringify(TERMINAL_SHELL_SELECTOR)});
      const rect = shell ? shell.getBoundingClientRect() : null;
      const canvases = shell ? [...shell.querySelectorAll("canvas")] : [];
      const canvasHasWebgl = canvases.some((canvas) => {
        try {
          return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
        } catch {
          return false;
        }
      });
      const rows = shell ? shell.querySelector(".xterm-rows") : null;
      const tabList = document.querySelector('[aria-label="Terminal tabs"]');
      const body = document.body?.innerText ?? "";
      let rafFrames = 0;
      if (typeof requestAnimationFrame === "function") {
        await new Promise((resolve) => {
          const startedAt = performance.now();
          const tick = () => {
            rafFrames += 1;
            if (performance.now() - startedAt >= 400) resolve(null);
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          setTimeout(() => resolve(null), 900);
        });
      }
      const ancestorStyles = [];
      let node = shell;
      for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
        const style = getComputedStyle(node);
        ancestorStyles.push(
          [
            node.tagName.toLowerCase(),
            "display=" + style.display,
            "visibility=" + style.visibility,
            "opacity=" + style.opacity,
            "size=" + String(Math.round(node.clientWidth)) + "x" + String(Math.round(node.clientHeight)),
          ].join(" "),
        );
      }
      return {
        shellPresent: shell !== null,
        shellRect: rect
          ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          : null,
        xtermCount: shell ? shell.querySelectorAll(".xterm").length : 0,
        canvasCount: canvases.length,
        canvasHasWebgl,
        canvasSizes: canvases.map(
          (canvas) => String(canvas.width) + "x" + String(canvas.height),
        ),
        rowsTextLength: rows ? (rows.textContent ?? "").length : 0,
        terminalTabLabels: tabList
          ? [...tabList.querySelectorAll('[role="tab"]')].map((tab) => (tab.textContent ?? "").trim())
          : [],
        visibilityState: document.visibilityState,
        hasFocus: typeof document.hasFocus === "function" ? document.hasFocus() : false,
        rafFrames400Ms: rafFrames,
        ancestorStyles,
        bodyTextTail: body.slice(-500),
      };
    })()`,
  );
}

/** Dispatches the production `terminal.toggle` binding (Ctrl+`) as trusted keys. */
export async function dispatchTerminalToggleChord(cdp: ManagedCdpClient): Promise<void> {
  await cdp
    .evaluate(
      `(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); return "ok"; })()`,
    )
    .catch(() => null);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "`",
    code: "Backquote",
    windowsVirtualKeyCode: 192,
    nativeVirtualKeyCode: 192,
    modifiers: 2,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "`",
    code: "Backquote",
    windowsVirtualKeyCode: 192,
    nativeVirtualKeyCode: 192,
    modifiers: 2,
  });
}

export interface TerminalPanelReopenEvidence {
  readonly closeDispatched: boolean;
  readonly hiddenAfterClose: boolean;
  readonly reopenDispatched: boolean;
  readonly visibleAfterReopen: boolean;
  readonly surfaceRectBefore: TerminalRect | null;
  readonly surfaceRectAfter: TerminalRect | null;
  /** The surface showed the feed's "unavailable" status before the reopen. */
  readonly watchErrorBefore: boolean;
  readonly watchErrorAfter: boolean;
  readonly watchedShellNote: string;
  readonly waitedMs: number;
}

/**
 * Closes and reopens the integrated Terminal panel through the production
 * toggle binding. The app keeps its tab (and therefore its dedicated shell)
 * across the close, and the remount installs its terminal watch *after* the
 * shell exists — the ordering the panel's first mount cannot guarantee. This
 * is a real user workflow, touches no store state, and the shell id is
 * rediscovered from the remounted surface.
 */
export async function reopenIntegratedTerminalPanel(input: {
  readonly cdp: ManagedCdpClient;
  readonly timeoutMs?: number;
}): Promise<TerminalPanelReopenEvidence> {
  const cdp = input.cdp;
  const timeoutMs = input.timeoutMs ?? 15_000;
  const startedAt = Date.now();
  const readWatchError = async (): Promise<boolean> =>
    cdp
      .evaluate<boolean>(
        `(document.body?.innerText ?? "").includes("Terminal output is unavailable")`,
      )
      .catch(() => false);
  const before = await evaluateSurface(cdp).catch(() => null);
  const watchErrorBefore = await readWatchError();
  let closeDispatched = false;
  let hiddenAfterClose = false;
  let reopenDispatched = false;
  try {
    await dispatchTerminalToggleChord(cdp);
    closeDispatched = true;
  } catch {
    // Recorded through hidden/visible outcome; the surface state is evidence.
  }
  const closeDeadline = Date.now() + Math.min(6_000, timeoutMs);
  for (;;) {
    const surface = await evaluateSurface(cdp).catch(() => null);
    if (!(surface?.present === true && surface.visible)) {
      hiddenAfterClose = true;
      break;
    }
    if (Date.now() >= closeDeadline) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
  let visibleAfterReopen = false;
  if (closeDispatched) {
    try {
      await dispatchTerminalToggleChord(cdp);
      reopenDispatched = true;
    } catch {
      // See above.
    }
    const reopenDeadline = Date.now() + timeoutMs;
    for (;;) {
      const surface = await evaluateSurface(cdp).catch(() => null);
      if (surface?.present === true && surface.visible) {
        visibleAfterReopen = true;
        break;
      }
      if (Date.now() >= reopenDeadline) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
  const after = await evaluateSurface(cdp).catch(() => null);
  const watchErrorAfter = await readWatchError();
  return {
    closeDispatched,
    hiddenAfterClose,
    reopenDispatched,
    visibleAfterReopen,
    surfaceRectBefore: before?.rect ?? null,
    surfaceRectAfter: after?.rect ?? null,
    watchErrorBefore,
    watchErrorAfter,
    watchedShellNote:
      "the panel tab (and its dedicated shell) survives close; the remount watches the existing shell",
    waitedMs: Date.now() - startedAt,
  };
}

// ── App-owned shell PTY generation/cursor probe ─────────────────────────────

export interface AppShellPtyProbe {
  readonly shellId: string;
  readonly generation: string | null;
  readonly fromCursor: number | null;
  readonly toCursor: number | null;
  readonly processState: string | null;
  readonly dataBytes: number;
  readonly tailPreview: string;
}

/** Removes ANSI escape sequences (CSI `ESC [ ... final`) without a control-char regex. */
function stripAnsi(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === 27 && value[index + 1] === "[") {
      let cursor = index + 2;
      while (cursor < value.length) {
        const code = value.charCodeAt(cursor);
        if (code >= 0x40 && code <= 0x7e) break;
        cursor += 1;
      }
      index = cursor;
      continue;
    }
    result += value[index];
  }
  return result;
}

/** Raw `readTerminalSnapshot` probe for the app-owned panel shell (no mock). */
export function probeAppShellPty(
  cdp: ManagedCdpClient,
  shellId: string,
): Promise<AppShellPtyProbe> {
  return cdp.invokeProcedure("readTerminalSnapshot", { threadId: shellId }).then((snapshot) => {
    const record = snapshot as {
      data?: unknown;
      generation?: unknown;
      fromCursor?: unknown;
      toCursor?: unknown;
      processState?: unknown;
    } | null;
    const data = typeof record?.data === "string" ? record.data : "";
    return {
      shellId,
      generation: typeof record?.generation === "string" ? record.generation : null,
      fromCursor: typeof record?.fromCursor === "number" ? record.fromCursor : null,
      toCursor: typeof record?.toCursor === "number" ? record.toCursor : null,
      processState: typeof record?.processState === "string" ? record.processState : null,
      dataBytes: data.length,
      tailPreview: stripAnsi(data).slice(-200),
    };
  });
}

export interface ShellLayoutNudge {
  readonly mechanism:
    | "window-resize-event"
    | "device-metrics-resize"
    | "sidebar-toggle"
    | "browser-window-bounds";
  readonly detail: string;
}

export interface AppShellBindEvidence {
  readonly shellId: string;
  readonly bound: boolean;
  readonly waitedMs: number;
  readonly polls: number;
  readonly probe: AppShellPtyProbe | null;
  readonly lastError: string | null;
  readonly nudges: readonly ShellLayoutNudge[];
}

/**
 * Waits (bounded) until the app-started panel shell has a live PTY generation
 * that has painted output, then returns the raw probe. This proves the visible
 * terminal is backed by a real supervisor PTY before any input is typed.
 *
 * The harness deliberately has no raw `startShell` fallback for an app-owned
 * panel shell: a raw start bypasses the renderer's `shellStartRegistry`, so the
 * panel's deferred start stays armed and any later fit re-issues `startShell`
 * for the same id, replacing the very PTY generation under test (proven in
 * `a0-terminal-investigation.md`). Only the app's own open/deferred-start path
 * is allowed here, with bounded UI-level layout nudges recorded in the
 * evidence. If the app cannot start its shell, the run fails as a harness
 * blocker instead of manufacturing a second generation.
 */
/**
 * Re-runs the panel surface's own fit path at the UI level. The dock can mount
 * at a stable size whose first fit is below the start threshold, so no later
 * ResizeObserver tick ever occurs; a real Browser window bounds change always
 * changes the mount box and fires it. No application state is forced.
 */
/**
 * Re-runs the panel surface's own fit path at the UI level. The dock can mount
 * at a size whose first fit is below the start threshold, and no later
 * ResizeObserver tick occurs once the layout is stable; a CDP device-metrics
 * change resizes the renderer layout (a real viewport resize, restored
 * immediately) so the surface's observer fires. No application state is forced.
 */
async function nudgeShellLayout(cdp: ManagedCdpClient, attempt: number): Promise<ShellLayoutNudge> {
  await cdp.evaluate(`(window.dispatchEvent(new Event("resize")), "ok")`).catch(() => null);
  if (attempt < 2) {
    return { mechanism: "window-resize-event", detail: `attempt ${String(attempt)}` };
  }
  const readCanvas = async (): Promise<string> =>
    cdp
      .evaluate<string>(
        `(() => {
          const shell = document.querySelector(${JSON.stringify(TERMINAL_SHELL_SELECTOR)});
          if (!shell) return "no-shell";
          const canvas = shell.querySelector("canvas");
          return [
            "mount=" + String(Math.round(shell.clientWidth)) + "x" + String(Math.round(shell.clientHeight)),
            "canvas=" + (canvas ? String(canvas.width) + "x" + String(canvas.height) : "none"),
            "xterm=" + String(shell.querySelectorAll(".xterm").length),
          ].join(" ");
        })()`,
      )
      .catch(() => "probe-failed");
  const viewport = await cdp
    .evaluate<{ width: number; height: number }>(
      `({ width: window.innerWidth, height: window.innerHeight })`,
    )
    .catch(() => null);
  const before = await readCanvas();
  let detail = `before: ${before}`;
  if (viewport) {
    const width = Math.max(480, viewport.width - 60);
    const height = Math.max(360, viewport.height - 60);
    await cdp
      .send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 0,
        mobile: false,
      })
      .catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const during = await readCanvas();
    await cdp.send("Emulation.clearDeviceMetricsOverride").catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const after = await readCanvas();
    detail = `before: ${before} | during: ${during} | after: ${after}`;
  }
  return { mechanism: "device-metrics-resize", detail };
}

export async function waitForAppShellPty(input: {
  readonly cdp: ManagedCdpClient;
  readonly shellId: string;
  readonly timeoutMs?: number;
}): Promise<AppShellBindEvidence> {
  const timeoutMs = input.timeoutMs ?? 20_000;
  const startedAt = Date.now();
  let polls = 0;
  let probe: AppShellPtyProbe | null = null;
  let lastError: string | null = null;
  const nudges: ShellLayoutNudge[] = [];
  for (;;) {
    polls += 1;
    try {
      probe = await probeAppShellPty(input.cdp, input.shellId);
      if (probe.generation !== null && probe.processState !== null && probe.dataBytes > 0) {
        return {
          shellId: input.shellId,
          bound: true,
          waitedMs: Date.now() - startedAt,
          polls,
          probe,
          lastError,
          nudges,
        };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    const elapsed = Date.now() - startedAt;
    if (nudges.length < 3 && elapsed > 3_000 + nudges.length * 4_000) {
      nudges.push(await nudgeShellLayout(input.cdp, nudges.length + 1));
    }
    if (elapsed >= timeoutMs) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return {
    shellId: input.shellId,
    bound: false,
    waitedMs: Date.now() - startedAt,
    polls,
    probe,
    lastError,
    nudges,
  };
}

export interface TerminalLiveStreamingProbe {
  readonly shellId: string;
  readonly retainedScrollbackBytes: number;
  readonly retainedContainsMarker: boolean;
  readonly surfaceRowsTextLength: number;
  readonly surfaceRenderer: string;
  readonly surfaceTextContainsMarker: boolean;
  /** Terminal frames the dedicated harness probe client received for this shell. */
  readonly clientTerminalFrames: number | null;
  readonly bridgeError: string | null;
}

/**
 * Evidence for the live-output path of the app-owned panel shell: the retained
 * supervisor scrollback (authoritative PTY bytes the app can hydrate), the
 * rendered DOM rows, and the frame count an independent harness terminal watch
 * received for the same id. Used to separate "PTY never produced the bytes"
 * from "the surface did not paint them".
 */
export async function readTerminalLiveStreamingProbe(input: {
  readonly cdp: ManagedCdpClient;
  readonly shellId: string;
  readonly marker: string;
  readonly clientTerminalFrames?: number;
}): Promise<TerminalLiveStreamingProbe> {
  let retained = "";
  let bridgeError: string | null = null;
  try {
    const result = await input.cdp.invokeProcedure("readTerminalScrollback", {
      threadId: input.shellId,
    });
    retained = typeof result === "string" ? result : "";
  } catch (error) {
    bridgeError = error instanceof Error ? error.message : String(error);
  }
  const surface = await evaluateSurface(input.cdp).catch(() => null);
  return {
    shellId: input.shellId,
    retainedScrollbackBytes: retained.length,
    retainedContainsMarker: retained.includes(input.marker),
    surfaceRowsTextLength: surface?.rowsTextLength ?? 0,
    surfaceRenderer: surface?.renderer ?? "missing",
    surfaceTextContainsMarker: surface?.rowsText.includes(input.marker) ?? false,
    clientTerminalFrames: input.clientTerminalFrames ?? null,
    bridgeError,
  };
}

// ── Trusted terminal input ──────────────────────────────────────────────────
/**
 * Types a command into the focused xterm through trusted key events (xterm's
 * own onData path writes it to the PTY) and presses Enter. The helper textarea
 * is focused first; no bridge call is made for the input, so the rendered text
 * proves the full keyboard -> PTY -> renderer path. The xterm helper textarea
 * is an input transport, not the terminal's observable text, so its retained
 * `value` is not used as the insertion-fidelity check; the caller verifies the
 * command through the PTY cursor/echo probe instead.
 */
export async function typeTrustedTerminalCommand(input: {
  readonly cdp: ManagedCdpClient;
  readonly command: string;
  readonly submit?: boolean;
}): Promise<void> {
  await input.cdp.trustedType(TERMINAL_TEXTAREA_SELECTOR, input.command, {
    assertInsertion: false,
  });
  if (input.submit === false) return;
  await input.cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await input.cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
}

export type TerminalHarnessMismatchKind = "harness-generation-mismatch";

export interface TerminalGenerationStabilityEvidence {
  readonly expectedGeneration: string | null;
  readonly observedGeneration: string | null;
  readonly stable: boolean;
  /** True when both generations were observable and differ. */
  readonly replacementDetected: boolean;
  /**
   * `harness-generation-mismatch` when a replacement was observed: the shell
   * was re-started after the measurement began, so the generation under test
   * no longer exists and the run is invalid as a surface verdict. Null when
   * nothing was replaced (or when no generation was observable at all).
   */
  readonly classification: TerminalHarnessMismatchKind | null;
  readonly detail: string;
}

/**
 * Pure classification of a PTY generation comparison. A replacement is a
 * harness sequencing defect (a second `startShell` destroyed the tested
 * generation), never a renderer paint/hydration failure: the marker bytes no
 * longer exist in the supervisor after the replacement.
 */
export function classifyTerminalGenerationStability(input: {
  readonly expectedGeneration: string | null;
  readonly observedGeneration: string | null;
}): TerminalGenerationStabilityEvidence {
  if (input.expectedGeneration === null || input.observedGeneration === null) {
    return {
      expectedGeneration: input.expectedGeneration,
      observedGeneration: input.observedGeneration,
      stable: false,
      replacementDetected: false,
      classification: null,
      detail: "PTY generation was not observable on both sides; stability is unproven",
    };
  }
  const stable = input.expectedGeneration === input.observedGeneration;
  return {
    expectedGeneration: input.expectedGeneration,
    observedGeneration: input.observedGeneration,
    stable,
    replacementDetected: !stable,
    classification: stable ? null : "harness-generation-mismatch",
    detail: stable
      ? "PTY generation stable across the observation window"
      : `PTY generation replaced (${input.expectedGeneration} -> ${input.observedGeneration}); ` +
        "the tested generation was destroyed by a same-id startShell (harness sequence)",
  };
}

export interface TerminalCommandDeliveryEvidence {
  readonly shellId: string;
  readonly command: string;
  readonly method: "trusted-typing" | "write-terminal";
  /**
   * Which production journey this delivery actually exercised:
   *  - `trusted-keyboard`: real trusted key events into the mounted xterm, the
   *    ordinary first-open keyboard journey;
   *  - `production-write-fallback`: the command was written through the
   *    production `writeTerminal` procedure because trusted typing did not
   *    reach the PTY. This is a functional diagnostic of the PTY/render path,
   *    NOT evidence that the ordinary keyboard journey works.
   */
  readonly deliveryJourney: "trusted-keyboard" | "production-write-fallback";
  /** True only when the trusted-keyboard journey itself advanced the PTY. */
  readonly keyboardJourneyPassed: boolean;
  readonly typingError: string | null;
  readonly echoObserved: boolean;
  readonly probes: readonly AppShellPtyProbe[];
  /**
   * Generation stability across this delivery's probes. A replacement here is
   * a harness-generation-mismatch (see the classifier), recorded separately
   * from the functional echo result.
   */
  readonly generationStability: TerminalGenerationStabilityEvidence;
  readonly waitedMs: number;
}

/**
 * Delivers one command to the app-owned panel shell and proves it reached the
 * PTY: trusted keyboard typing into the mounted xterm is attempted first, and
 * when the PTY shows no echo/advance within a bounded wait, the command is
 * written through the production `writeTerminal` procedure (the same path the
 * app's action scripts and the declared PTY producers use). The method actually
 * used and the raw PTY probes on both sides are recorded; the rendered text is
 * always real PTY output.
 */
export async function deliverTerminalCommand(input: {
  readonly cdp: ManagedCdpClient;
  readonly shellId: string;
  readonly command: string;
  readonly trustedTimeoutMs?: number;
  readonly fallbackTimeoutMs?: number;
}): Promise<TerminalCommandDeliveryEvidence> {
  const startedAt = Date.now();
  const probes: AppShellPtyProbe[] = [];
  const cursorAdvanced = (probe: AppShellPtyProbe, before: AppShellPtyProbe): boolean =>
    (probe.toCursor ?? 0) > (before.toCursor ?? 0) || probe.dataBytes > before.dataBytes;
  const before = await probeAppShellPty(input.cdp, input.shellId);
  probes.push(before);
  const stability = (): TerminalGenerationStabilityEvidence =>
    classifyTerminalGenerationStability({
      expectedGeneration: probes[0]?.generation ?? null,
      observedGeneration: probes[probes.length - 1]?.generation ?? null,
    });
  let typingError: string | null = null;
  try {
    await typeTrustedTerminalCommand({ cdp: input.cdp, command: input.command });
  } catch (error) {
    typingError = error instanceof Error ? error.message : String(error);
  }
  const trustedDeadline = Date.now() + (input.trustedTimeoutMs ?? 4_000);
  if (typingError === null) {
    for (;;) {
      const probe = await probeAppShellPty(input.cdp, input.shellId).catch(() => before);
      probes.push(probe);
      if (cursorAdvanced(probe, before)) {
        return {
          shellId: input.shellId,
          command: input.command,
          method: "trusted-typing",
          deliveryJourney: "trusted-keyboard",
          keyboardJourneyPassed: true,
          typingError,
          echoObserved: true,
          probes,
          generationStability: stability(),
          waitedMs: Date.now() - startedAt,
        };
      }
      if (Date.now() >= trustedDeadline) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  // Fallback: the production write path into the app-owned shell. This is a
  // declared functional diagnostic of the PTY/render path only; it never
  // counts as the ordinary trusted-keyboard journey.
  await input.cdp.invokeProcedure("writeTerminal", {
    threadId: input.shellId,
    data: `${input.command}\r`,
  });
  const fallbackDeadline = Date.now() + (input.fallbackTimeoutMs ?? 5_000);
  let echoObserved = false;
  for (;;) {
    const probe = await probeAppShellPty(input.cdp, input.shellId).catch(() => before);
    probes.push(probe);
    if (cursorAdvanced(probe, before)) {
      echoObserved = true;
      break;
    }
    if (Date.now() >= fallbackDeadline) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return {
    shellId: input.shellId,
    command: input.command,
    method: "write-terminal",
    deliveryJourney: "production-write-fallback",
    keyboardJourneyPassed: false,
    typingError,
    echoObserved,
    probes,
    generationStability: stability(),
    waitedMs: Date.now() - startedAt,
  };
}

/**
 * Read-only comparison of a shell's PTY generation before and after a delivery
 * window. This is the explicit harness invalidation check: a same-id
 * replacement after the command was written means the tested generation was
 * destroyed, so the run is classified as `harness-generation-mismatch` (never
 * as a renderer paint/hydration defect).
 */
export async function verifyTerminalShellGenerationStability(input: {
  readonly cdp: ManagedCdpClient;
  readonly shellId: string;
  readonly expectedGeneration: string | null;
  readonly label: string;
  readonly evidencePath?: string;
  readonly extra?: Readonly<Record<string, unknown>>;
}): Promise<{
  readonly label: string;
  readonly probe: AppShellPtyProbe | null;
  readonly stability: TerminalGenerationStabilityEvidence;
}> {
  const probe = await probeAppShellPty(input.cdp, input.shellId).catch(() => null);
  const stability = classifyTerminalGenerationStability({
    expectedGeneration: input.expectedGeneration,
    observedGeneration: probe?.generation ?? null,
  });
  if (stability.replacementDetected && input.evidencePath) {
    mkdirSync(dirname(input.evidencePath), { recursive: true });
    const payload = {
      label: input.label,
      shellId: input.shellId,
      classification: stability.classification,
      stability,
      probe,
      ...(input.extra ?? {}),
    };
    writeFileSync(input.evidencePath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  }
  return { label: input.label, probe, stability };
}

// ── Screenshots and pane text ───────────────────────────────────────────────

export interface ElementScreenshotEvidence {
  readonly selector: string;
  readonly path: string | null;
  readonly bytes: number | null;
  readonly rect: TerminalRect | null;
  readonly error: string | null;
}

export async function captureRectScreenshot(input: {
  readonly cdp: ManagedCdpClient;
  readonly selector: string;
  readonly rect: TerminalRect;
  readonly path: string;
}): Promise<ElementScreenshotEvidence> {
  try {
    const result = (await input.cdp.send(
      "Page.captureScreenshot",
      {
        format: "jpeg",
        quality: 70,
        clip: {
          x: input.rect.x,
          y: input.rect.y,
          width: input.rect.width,
          height: input.rect.height,
          scale: 1,
        },
      },
      15_000,
    )) as { data?: unknown };
    const data = typeof result?.data === "string" ? result.data : null;
    if (data === null) {
      return {
        selector: input.selector,
        path: null,
        bytes: null,
        rect: input.rect,
        error: "no screenshot data",
      };
    }
    const bytes = Buffer.from(data, "base64");
    mkdirSync(dirname(input.path), { recursive: true });
    writeFileSync(input.path, bytes, { mode: 0o600 });
    return {
      selector: input.selector,
      path: input.path,
      bytes: bytes.length,
      rect: input.rect,
      error: null,
    };
  } catch (error) {
    return {
      selector: input.selector,
      path: null,
      bytes: null,
      rect: input.rect,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function captureElementScreenshot(input: {
  readonly cdp: ManagedCdpClient;
  readonly selector: string;
  readonly path: string;
}): Promise<ElementScreenshotEvidence> {
  const rect = await input.cdp
    .evaluate<TerminalRect | null>(
      `(() => { const el = document.querySelector(${JSON.stringify(input.selector)});` +
        ` if (!el) return null; const r = el.getBoundingClientRect();` +
        ` if (r.width <= 1 || r.height <= 1) return null;` +
        ` return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`,
    )
    .catch(() => null);
  if (!rect) {
    return {
      selector: input.selector,
      path: null,
      bytes: null,
      rect: null,
      error: "screenshot target missing or zero-sized",
    };
  }
  return captureRectScreenshot({
    cdp: input.cdp,
    selector: input.selector,
    rect,
    path: input.path,
  });
}

export interface PaneTextEvidence {
  readonly index: number;
  readonly rect: TerminalRect | null;
  readonly textLength: number;
  readonly titleText: string | null;
  readonly preview: string;
}

export function readVisiblePaneText(cdp: ManagedCdpClient): Promise<readonly PaneTextEvidence[]> {
  return cdp.evaluate<readonly PaneTextEvidence[]>(
    `(() => {
      const panes = [...document.querySelectorAll("[data-poracode-thread-pane]")];
      return panes.map((pane, index) => {
        const rect = pane.getBoundingClientRect();
        const text = (pane.innerText ?? "").trim();
        const title = pane.querySelector("[data-thread-title], h1, h2");
        return {
          index,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          textLength: text.length,
          titleText: title ? (title.textContent ?? "").trim().slice(0, 120) : null,
          preview: text.slice(0, 240),
        };
      });
    })()`,
  );
}

export interface StructuredRenderedTextEvidence {
  readonly markerPrefix: string;
  readonly matchCount: number;
  readonly distinctMarkers: number;
  readonly maxTextIndex: number | null;
  readonly turns: readonly number[];
  readonly bodyTextLength: number;
  readonly containingPaneIndex: number | null;
  readonly containingPaneRect: TerminalRect | null;
  readonly tailPreview: string;
}

/**
 * Reads the structured producer's *rendered* text: the fixture's unique
 * `[<prefix>-t<turn>-text-<index>]` markers are only present in the DOM after
 * the GUI thread rendered the ACP content delta, so their presence and growth
 * are direct rendered-text evidence (not wire counts or store state).
 */
export function readStructuredRenderedText(
  cdp: ManagedCdpClient,
  markerPrefix: string,
): Promise<StructuredRenderedTextEvidence> {
  return cdp.evaluate<StructuredRenderedTextEvidence>(
    `(() => {
      const prefix = ${JSON.stringify(markerPrefix)};
      const pattern = new RegExp("\\\\[" + prefix + "-t(\\\\d+)-text-(\\\\d+)\\\\]", "g");
      const body = document.body?.innerText ?? "";
      const markers = [];
      const turns = new Set();
      let match;
      while ((match = pattern.exec(body)) !== null) {
        markers.push(match[0]);
        turns.add(Number(match[1]));
      }
      const indices = [];
      const indexPattern = new RegExp("\\\\[" + prefix + "-t\\\\d+-text-(\\\\d+)\\\\]", "g");
      while ((match = indexPattern.exec(body)) !== null) indices.push(Number(match[1]));
      const panes = [...document.querySelectorAll("[data-poracode-thread-pane]")];
      let containingPaneIndex = null;
      let containingPaneRect = null;
      for (let index = 0; index < panes.length; index += 1) {
        const pane = panes[index];
        if (markers.length > 0 && (pane.innerText ?? "").includes(markers[markers.length - 1])) {
          const rect = pane.getBoundingClientRect();
          containingPaneIndex = index;
          containingPaneRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          break;
        }
      }
      return {
        markerPrefix: prefix,
        matchCount: markers.length,
        distinctMarkers: new Set(markers).size,
        maxTextIndex: indices.length > 0 ? Math.max(...indices) : null,
        turns: [...turns].sort((left, right) => left - right),
        bodyTextLength: body.length,
        containingPaneIndex,
        containingPaneRect,
        tailPreview: body.slice(-500),
      };
    })()`,
  );
}
