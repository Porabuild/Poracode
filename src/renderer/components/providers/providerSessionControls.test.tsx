import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { Thread } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import {
  ProviderSessionControls,
  registerProviderSessionControls,
  type ProviderSessionControlProps,
} from "./providerSessionControls";

const renderInventory = vi.fn<() => void>();
function FixtureSessionControls(props: ProviderSessionControlProps) {
  renderInventory();
  return props.children?.([]) ?? null;
}
registerProviderSessionControls("session-menu-fixture", FixtureSessionControls);

it.each(["terminal", "gui"] as const)(
  "preserves the add-menu renderer without provider actions in %s presentation",
  (presentationMode) => {
    render(
      <ProviderSessionControls
        thread={{ agentKind: "unregistered-session-menu-fixture" } as Thread}
        presentationMode={presentationMode}
        isDisabled={false}
      >
        {(actions) => <span>Add menu: {actions.length}</span>}
      </ProviderSessionControls>,
    );
    expect(screen.getByText("Add menu: 0")).toBeDefined();
  },
);

describe("provider session-menu admission", () => {
  it("does not load structured controls on a terminal surface", () => {
    renderInventory.mockClear();
    render(
      <ProviderSessionControls
        thread={{ agentKind: "session-menu-fixture" } as Thread}
        presentationMode="terminal"
        isDisabled={false}
      >
        {() => <span>Add menu</span>}
      </ProviderSessionControls>,
    );
    expect(screen.getByText("Add menu")).toBeDefined();
    expect(renderInventory).not.toHaveBeenCalled();
  });
});
