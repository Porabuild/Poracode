import { clickCdpElements } from "./poracode-cdp-actions.mjs";

const OVERLAY_SELECTOR = ".poracode-welcome-page.fixed";
const PRIMARY_SELECTOR = "button.poracode-welcome-button";
const PRIMARY_LABEL = "welcome screen primary action";
// Read-only evidence of the production-owned flag; never use it to dismiss.
const WELCOME_SEEN_KEY = "poracode-welcome-seen-v16";
const MAX_SNAPSHOTS = 32;
const PRIMARY_ELEMENTS = `[...document.querySelectorAll(${JSON.stringify(OVERLAY_SELECTOR)})].flatMap((overlay) => {
  const button = overlay.querySelector(${JSON.stringify(PRIMARY_SELECTOR)});
  return button ? [button] : [];
})`;

// Serialized into the renderer. Keep state bounded and preserve the fixed
// overlay distinction: WelcomeBackdrop also has poracode-welcome-page.
function readWelcomeState(overlaySelector, primarySelector, storageKey) {
  const overlays = document.querySelectorAll(overlaySelector);
  const overlay = overlays[0];
  const button = overlay?.querySelector(primarySelector);
  const ancestors = [];
  let painted = Boolean(button);
  let reachedOverlay = false;
  for (let node = button; node && ancestors.length < 8; node = node.parentElement) {
    const style = getComputedStyle(node);
    const opacity = Number(style.opacity || "1");
    ancestors.push({
      className: String(node.className).slice(0, 180),
      display: style.display,
      visibility: style.visibility,
      opacity,
      pointerEvents: style.pointerEvents,
    });
    if (style.display === "none" || style.visibility === "hidden" || opacity === 0) {
      painted = false;
    }
    if (node === overlay) {
      reachedOverlay = true;
      break;
    }
  }
  let storageValue = null;
  let storageError = null;
  try {
    storageValue = localStorage.getItem(storageKey)?.slice(0, 16) ?? null;
  } catch (error) {
    storageError = String(error).slice(0, 160);
  }
  const rect = button?.getBoundingClientRect();
  return {
    ready: document.readyState === "complete",
    visibility: document.visibilityState,
    devBridge: typeof window.__poracodeDev,
    rootChildren: document.querySelector("#root")?.childElementCount ?? 0,
    bodyTextLength: document.body?.innerText.length ?? 0,
    welcomeVisible: overlays.length > 0,
    overlayCount: overlays.length,
    exiting: overlay?.classList.contains("opacity-0") ?? false,
    storageValue,
    storageError,
    primaryAction: button
      ? {
          text: button.textContent?.trim().slice(0, 160) ?? "",
          disabled: button.matches(":disabled"),
          ariaDisabled: button.getAttribute("aria-disabled"),
          painted: painted && reachedOverlay && document.visibilityState === "visible",
          ancestorScanTruncated: !reachedOverlay,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          ancestors,
        }
      : null,
  };
}

const STATE_EXPRESSION = `(${readWelcomeState})(${JSON.stringify(OVERLAY_SELECTOR)}, ${JSON.stringify(PRIMARY_SELECTOR)}, ${JSON.stringify(WELCOME_SEEN_KEY)})`;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Exercise the real first-launch CTA; a dispatched pointer is not a dismissal. */
export async function runWelcomeDismissalScenario({
  client,
  evaluate,
  waitForValue,
  sleep = delay,
  now = Date.now,
}) {
  const started = now();
  const evidence = {
    formatVersion: 1,
    input: "guarded-cdp-pointer",
    actionAttempts: 0,
    dispatchedActions: 0,
    snapshots: [],
    droppedSnapshots: 0,
  };
  let previousSignature;
  const read = async (phase, attempt = null) => {
    const state = await evaluate(client, STATE_EXPRESSION);
    const snapshot = { phase, attempt, elapsedMs: now() - started, state };
    evidence.lastSnapshot = snapshot;
    const signature = JSON.stringify({ phase, attempt, state });
    if (signature !== previousSignature) {
      if (evidence.snapshots.length === MAX_SNAPSHOTS) {
        evidence.snapshots.shift();
        evidence.droppedSnapshots += 1;
      }
      evidence.snapshots.push(snapshot);
      previousSignature = signature;
    }
    return state;
  };

  try {
    const initial = await waitForValue(
      () => read("initial"),
      (state) => state.devBridge === "object" && state.rootChildren > 0 && state.bodyTextLength > 0,
      "welcome dismissal bridge",
    );
    evidence.initial = initial;
    if (!initial.welcomeVisible) {
      return {
        dismissed: false,
        detail: "welcome screen was already dismissed",
        evidence,
      };
    }

    // A previous dispatch remains evidence even if the overlay disappears
    // between this iteration's state read and the guarded target lookup.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const before = await waitForValue(
        () => read("before-action", attempt),
        (state) => !state.welcomeVisible || state.exiting || state.primaryAction?.painted,
        "welcome primary action readiness",
      );
      if (!before.welcomeVisible || before.exiting) break;

      evidence.actionAttempts += 1;
      try {
        await clickCdpElements({
          client,
          evaluate,
          elementsExpression: PRIMARY_ELEMENTS,
          label: PRIMARY_LABEL,
        });
        evidence.dispatchedActions += 1;
      } catch (error) {
        const after = await read("action-error", attempt);
        const message = error instanceof Error ? error.message : String(error);
        evidence.lastActionError = message.slice(0, 240);
        if (
          evidence.dispatchedActions > 0 &&
          message === `cannot click ${PRIMARY_LABEL}: missing` &&
          (!after.welcomeVisible || after.exiting)
        ) {
          break;
        }
        throw error;
      }
      await sleep(1_500);
      const after = await read("after-action", attempt);
      if (!after.welcomeVisible || after.exiting) break;
    }
    if (evidence.dispatchedActions === 0) {
      throw new Error("welcome screen primary action was not clickable");
    }

    const final = await waitForValue(
      () => read("dismissal"),
      (state) =>
        state.ready &&
        state.devBridge === "object" &&
        state.rootChildren > 0 &&
        state.bodyTextLength > 0 &&
        !state.welcomeVisible,
      "welcome screen dismissal",
    );
    evidence.final = final;
    await sleep(1_000);
    const stable = await read("stable");
    if (stable.welcomeVisible) {
      throw new Error("welcome screen returned after dismissal verification");
    }

    await evaluate(
      client,
      `(() => {
        const app = window.__poracodeDev.stores.app.getState();
        const project = app.projects.find((candidate) => candidate.id === "smoke-project");
        if (project) app.openDraft(project.id);
      })()`,
    );
    return {
      dismissed: true,
      detail: "welcome screen dismissed through its primary action",
      evidence,
    };
  } catch (error) {
    const failure = new Error(error instanceof Error ? error.message : String(error), {
      cause: error,
    });
    failure.name = "WelcomeScenarioError";
    failure.scenarioEvidence = evidence;
    throw failure;
  }
}
