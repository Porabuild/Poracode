import { clickCdpElements } from "./poracode-cdp-actions.mjs";

const OVERLAY_SELECTOR = ".poracode-welcome-page.fixed";
const PRIMARY_SELECTOR = "button.poracode-welcome-button";
const PRIMARY_LABEL = "welcome screen primary action";
// First-launch agent discovery covers the window above the welcome overlay
// and marks every sibling inert; both its scanning (Hide) and finished (Done)
// stages expose this production primary action.
const DISCOVERY_PRIMARY_SELECTOR = "button[data-discovery-primary-action]";
const DISCOVERY_PRIMARY_LABEL = "agent discovery primary action";
// Read-only evidence of the production-owned flag; never use it to dismiss.
const WELCOME_SEEN_KEY = "poracode-welcome-seen-v16";
const MAX_SNAPSHOTS = 32;
const PRIMARY_ELEMENTS = `[...document.querySelectorAll(${JSON.stringify(OVERLAY_SELECTOR)})].flatMap((overlay) => {
  const button = overlay.querySelector(${JSON.stringify(PRIMARY_SELECTOR)});
  return button ? [button] : [];
})`;
const DISCOVERY_PRIMARY_ELEMENTS = `[...document.querySelectorAll(${JSON.stringify(DISCOVERY_PRIMARY_SELECTOR)})]`;

// Serialized into the renderer. Keep state bounded and preserve the fixed
// overlay distinction: WelcomeBackdrop also has poracode-welcome-page.
function readWelcomeState(overlaySelector, primarySelector, discoverySelector, storageKey) {
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
  const discoveryButtons = [...document.querySelectorAll(discoverySelector)];
  const discoveryButton = discoveryButtons[0];
  let discoveryPrimary = null;
  if (discoveryButton) {
    const discoveryRect = discoveryButton.getBoundingClientRect();
    const discoveryStyle = getComputedStyle(discoveryButton);
    const hasBounds = discoveryRect.width > 0 && discoveryRect.height > 0;
    const visible =
      discoveryStyle.display !== "none" &&
      discoveryStyle.visibility === "visible" &&
      Number(discoveryStyle.opacity || "1") !== 0 &&
      discoveryStyle.pointerEvents !== "none";
    const inert = Boolean(discoveryButton.closest("[inert]"));
    const disabled =
      discoveryButton.matches(":disabled") ||
      discoveryButton.getAttribute("aria-disabled") === "true";
    discoveryPrimary = {
      count: discoveryButtons.length,
      hasBounds,
      visible,
      inert,
      disabled,
      actionable: hasBounds && visible && !inert && !disabled,
      rect: {
        x: discoveryRect.x,
        y: discoveryRect.y,
        width: discoveryRect.width,
        height: discoveryRect.height,
      },
    };
  }
  return {
    ready: document.readyState === "complete",
    visibility: document.visibilityState,
    devBridge: typeof window.__poracodeDev,
    rootChildren: document.querySelector("#root")?.childElementCount ?? 0,
    bodyTextLength: document.body?.innerText.length ?? 0,
    welcomeVisible: overlays.length > 0,
    overlayCount: overlays.length,
    exiting: overlay?.classList.contains("opacity-0") ?? false,
    discoveryPrimary,
    storageValue,
    storageError,
    primaryAction: button
      ? {
          text: button.textContent?.trim().slice(0, 160) ?? "",
          disabled: button.matches(":disabled"),
          ariaDisabled: button.getAttribute("aria-disabled"),
          inert: Boolean(button.closest("[inert]")),
          painted: painted && reachedOverlay && document.visibilityState === "visible",
          ancestorScanTruncated: !reachedOverlay,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          ancestors,
        }
      : null,
  };
}

const STATE_EXPRESSION = `(${readWelcomeState})(${JSON.stringify(OVERLAY_SELECTOR)}, ${JSON.stringify(PRIMARY_SELECTOR)}, ${JSON.stringify(DISCOVERY_PRIMARY_SELECTOR)}, ${JSON.stringify(WELCOME_SEEN_KEY)})`;

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
    discoveryDismissals: 0,
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

      // First launch can cover the welcome CTA with the agent discovery
      // portal, which marks every sibling inert. Dismiss that portal through
      // its own production primary action, then let the next pass re-read
      // welcome state. Inert welcome with no discovery still fails below.
      if (before.primaryAction?.inert && before.discoveryPrimary) {
        const discovery = await waitForValue(
          () => read("discovery-action", attempt),
          (state) =>
            !state.welcomeVisible ||
            state.exiting ||
            !state.discoveryPrimary ||
            state.discoveryPrimary.actionable,
          "agent discovery primary action readiness",
        );
        if (discovery.welcomeVisible && !discovery.exiting && discovery.discoveryPrimary) {
          try {
            await clickCdpElements({
              client,
              evaluate,
              elementsExpression: DISCOVERY_PRIMARY_ELEMENTS,
              label: DISCOVERY_PRIMARY_LABEL,
            });
            evidence.discoveryDismissals += 1;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const after = await read("discovery-action-error", attempt);
            if (
              message !== `cannot click ${DISCOVERY_PRIMARY_LABEL}: missing` ||
              after.discoveryPrimary
            ) {
              throw error;
            }
          }
        }
        await waitForValue(
          () => read("welcome-uncover", attempt),
          (state) =>
            !state.welcomeVisible ||
            state.exiting ||
            Boolean(state.primaryAction && !state.primaryAction.inert),
          "welcome primary action uncover",
        );
        continue;
      }

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
