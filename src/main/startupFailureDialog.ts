import { app, dialog } from "electron";
import { msg } from "@/shared/messages";

/**
 * Never-silent startup refusal (V5 plan H5 / batch 0.3). Any failure out of
 * `startDesktopApp` — most importantly the loud attach/lease refusals, e.g. a
 * standalone owner that is still starting — used to reach only the console
 * before `app.quit()`: a Finder-launched copy looked dead with no window and
 * no terminal. This module turns that catch into the same disclosure surface
 * the single-instance refusal uses (a modal error box), plus a Retry action:
 * relaunching re-runs the full decision, so a `starting` owner may have
 * become attachable by the time the user clicks.
 */

export interface StartupFailureDialogSpec {
  readonly title: string;
  readonly message: string;
  readonly retryLabel: string;
  readonly quitLabel: string;
}

/** Build the dialog spec from a startup failure; pure and unit-testable. */
export function describeStartupFailureDialog(error: unknown): StartupFailureDialogSpec {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    title: msg("startup.failure.title"),
    message: msg("startup.failure.body", { detail }),
    retryLabel: msg("startup.failure.retry"),
    quitLabel: msg("startup.failure.quit"),
  };
}

export type StartupFailureChoice = "retry" | "quit";

/** Show the modal and map the pressed button to a choice. */
export function showStartupFailureDialog(error: unknown): StartupFailureChoice {
  const spec = describeStartupFailureDialog(error);
  const pressed = dialog.showMessageBoxSync({
    type: "error",
    title: spec.title,
    message: spec.message,
    buttons: [spec.retryLabel, spec.quitLabel],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  return pressed === 0 ? "retry" : "quit";
}

/** Apply the choice: Retry relaunches (fresh decision), then quit either way. */
export function applyStartupFailureChoice(choice: StartupFailureChoice): void {
  if (choice === "retry") app.relaunch();
  app.quit();
}
