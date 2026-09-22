import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
