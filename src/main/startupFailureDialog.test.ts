// Focused regression for the never-silent startup refusal (V5 plan H5 /
// batch 0.3): a startup failure — the load-bearing case being a standalone
// owner that is still starting — must surface a modal dialog built from the
// shared message catalog, with Retry as the default action, instead of the
// old console-only quit.

import { describe, expect, it, vi } from "vitest";
import { msg } from "@/shared/messages";
import { describeAttachRefusal } from "./backend/standaloneAttachBootstrap";
import {
  applyStartupFailureChoice,
  describeStartupFailureDialog,
  showStartupFailureDialog,
  type StartupFailureChoice,
} from "./startupFailureDialog";

const electronMock = vi.hoisted(() => ({
  app: {
    relaunch: vi.fn<() => void>(),
    quit: vi.fn<() => void>(),
  },
  dialog: {
    showMessageBoxSync: vi.fn<(options: unknown) => number>(),
  },
}));
vi.mock("electron", () => electronMock);

/** The exact error shape `startDesktopApp` throws for a refused attach. */
function startingOwnerFailure(): Error {
  return new Error(
    describeAttachRefusal({
      kind: "refuse",
      baseDir: "/tmp/poracode-profile",
      reason: "non-ready-owner",
      detail: "Host control refused describe: not-ready.",
    }),
  );
}

describe("startup failure dialog", () => {
  it("shows the catalog dialog message for a starting-owner refusal", () => {
    const spec = describeStartupFailureDialog(startingOwnerFailure());
    expect(spec.title).toBe(msg("startup.failure.title"));
    expect(spec.message).toBe(
      msg("startup.failure.body", {
        detail:
          "Poracode found an existing host owner for this profile but cannot attach to it " +
          "(non-ready-owner). Stop the running owner or use its profile before starting " +
          "another authority. Detail: Host control refused describe: not-ready.",
      }),
    );
    expect(spec.retryLabel).toBe(msg("startup.failure.retry"));
    expect(spec.quitLabel).toBe(msg("startup.failure.quit"));
  });

  it("offers Retry as the default and maps both buttons to choices", () => {
    const error = startingOwnerFailure();
    electronMock.dialog.showMessageBoxSync.mockReturnValueOnce(0).mockReturnValueOnce(1);
    expect(showOf(error)).toBe("retry");
    expect(showOf(error)).toBe("quit");
    const options = electronMock.dialog.showMessageBoxSync.mock.calls[0]?.[0] as {
      buttons: string[];
      defaultId: number;
      cancelId: number;
    };
    expect(options.buttons).toEqual([msg("startup.failure.retry"), msg("startup.failure.quit")]);
    expect(options.defaultId).toBe(0);
    expect(options.cancelId).toBe(1);
  });

  it("retry relaunches before quitting; quit never relaunches", () => {
    applyStartupFailureChoice("retry");
    expect(electronMock.app.relaunch).toHaveBeenCalledTimes(1);
    expect(electronMock.app.quit).toHaveBeenCalledTimes(1);
    applyStartupFailureChoice("quit");
    expect(electronMock.app.relaunch).toHaveBeenCalledTimes(1);
    expect(electronMock.app.quit).toHaveBeenCalledTimes(2);
  });

  it("keeps non-Error failures discloseable", () => {
    const spec = describeStartupFailureDialog("boom");
    expect(spec.message).toContain("boom");
  });
});

function showOf(error: unknown): StartupFailureChoice {
  return showStartupFailureDialog(error);
}
