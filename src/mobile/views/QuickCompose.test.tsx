// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { QuickCompose } from "./QuickCompose";

const fixtures = vi.hoisted(() => ({
  remote: {
    connection: "online",
    projects: [{ id: "project-1" }],
  },
}));

vi.mock("../remoteContext", () => ({
  useRemote: () => fixtures.remote,
}));

vi.mock("../FloatingComposerDock", () => ({
  FloatingComposerDock: () => <div data-testid="floating-composer" />,
}));

vi.mock("./NewThreadFlow", () => ({
  NewThreadFlow: () => null,
}));

describe("QuickCompose", () => {
  beforeEach(() => {
    fixtures.remote.connection = "online";
    fixtures.remote.projects = [{ id: "project-1" }];
  });

  it("renders only when connected and at least one project is available", () => {
    const props = {
      expanded: false,
      restoreWorktreeSelectionToken: 0,
      onExpandedChange: vi.fn<(expanded: boolean) => void>(),
      onStarted: vi.fn<(threadId: string) => void>(),
    };

    const { rerender } = render(<QuickCompose {...props} />);
    expect(screen.getByTestId("floating-composer")).toBeTruthy();

    fixtures.remote.connection = "offline";
    rerender(<QuickCompose {...props} />);
    expect(screen.queryByTestId("floating-composer")).toBeNull();

    fixtures.remote.connection = "online";
    fixtures.remote.projects = [];
    rerender(<QuickCompose {...props} />);
    expect(screen.queryByTestId("floating-composer")).toBeNull();
  });

  it("collapses if the session becomes unavailable while expanded", () => {
    const onExpandedChange = vi.fn<(expanded: boolean) => void>();
    render(
      <QuickCompose
        expanded
        restoreWorktreeSelectionToken={0}
        onExpandedChange={onExpandedChange}
        onStarted={() => {}}
      />,
    );

    fixtures.remote.connection = "offline";
    render(
      <QuickCompose
        expanded
        restoreWorktreeSelectionToken={0}
        onExpandedChange={onExpandedChange}
        onStarted={() => {}}
      />,
    );

    expect(onExpandedChange).toHaveBeenCalledWith(false);
  });
});
