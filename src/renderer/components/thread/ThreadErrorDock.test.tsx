import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { attachErrorDetails, msg } from "@/shared/messages";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { resolveThreadAuthState } from "./threadErrorState";
import { ThreadErrorDock } from "./ThreadErrorDock";

describe("ThreadErrorDock severity", () => {
  it("renders an error with the danger treatment", () => {
    render(
      <ThreadErrorDock
        state={{ sourceItemId: "e1", message: "boom" }}
        onDismiss={vi.fn<() => void>()}
      />,
    );

    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss error" })).toBeInTheDocument();
  });

  it("renders a notice with the warning treatment", () => {
    const { container } = render(
      <ThreadErrorDock
        state={{ sourceItemId: "w1", message: "Model rerouted.", severity: "warning" }}
        onDismiss={vi.fn<() => void>()}
      />,
    );

    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("Model rerouted.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss warning" })).toBeInTheDocument();
    expect(container.querySelector(".text-warning")).not.toBeNull();
    expect(container.querySelector(".text-danger")).toBeNull();
  });

  it("does not treat a notice as a runtime auth error", () => {
    const state = {
      sourceItemId: "w1",
      message: "Please run /login soon",
      severity: "warning" as const,
    };
    expect(
      resolveThreadAuthState({ authState: "authenticated", errorDockStates: [state] })
        .hasRuntimeAuthError,
    ).toBe(false);
    expect(
      resolveThreadAuthState({ authState: undefined, errorDockStates: [state] })
        .hasRuntimeAuthError,
    ).toBe(false);
  });
});

describe("ThreadErrorDock attached details", () => {
  // Supervisor errors ferry an extra details block inside the single-string
  // error channel behind this sentinel (attachErrorDetails) and may arrive
  // wrapped in Electron IPC framing.
  const DETAILS_SENTINEL = "\0__LC_DETAILS__\0";
  const SUMMARY = msg("profile.executionUnavailable");
  const DETAILS = "fixture-session: profile login expired (code: profile-unavailable)";

  it("shows the localized summary collapsed and holds attached details back", () => {
    render(
      <ThreadErrorDock
        state={{ sourceItemId: "e1", message: attachErrorDetails(SUMMARY, DETAILS) }}
        onDismiss={vi.fn<() => void>()}
      />,
    );

    expect(screen.getByText(SUMMARY)).toBeInTheDocument();
    expect(screen.queryByText(/profile login expired/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(DETAILS_SENTINEL);
    // The hover title mirrors the clean summary, never the details payload.
    expect(screen.getByText(SUMMARY).getAttribute("title")).toBe(SUMMARY);
    // Attached details make even a single-line summary expandable.
    expect(screen.getByRole("button", { name: "Expand error" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss error" })).toBeInTheDocument();
  });

  it("discloses attached details through the expand affordance", () => {
    render(
      <ThreadErrorDock
        state={{ sourceItemId: "e2", message: attachErrorDetails(SUMMARY, DETAILS) }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand error" }));
    expect(screen.getByText(/profile login expired/)).toBeInTheDocument();
    expect(screen.getByText(SUMMARY)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(DETAILS_SENTINEL);
  });

  it("strips IPC framing and shows the localized summary with details attached", () => {
    render(
      <ThreadErrorDock
        state={{
          sourceItemId: "e3",
          message: `Error invoking remote method 'thread.sendMessage': Error: ${attachErrorDetails(SUMMARY, DETAILS)}`,
        }}
      />,
    );

    expect(screen.getByText(SUMMARY)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Error invoking remote method");
    expect(document.body.textContent).not.toContain(DETAILS_SENTINEL);
    expect(screen.queryByText(/profile login expired/)).not.toBeInTheDocument();
  });
});
