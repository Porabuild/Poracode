import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { resetDevTerminalStore, type DevTerminalTab } from "@/renderer/state/devTerminalStore";
import { MobileTerminalLayout } from "./MobileTerminalLayout";

vi.mock("./TerminalSurfaces", () => ({ TerminalSurfaces: () => null }));
vi.mock("./MobileTerminalAccessory", () => ({
  MobileTerminalAccessory: ({ terminalId }: { terminalId: string }) => (
    <output data-testid="accessory-target">{terminalId}</output>
  ),
}));

const mainTab: DevTerminalTab = {
  id: "shell:main",
  projectId: "project-1",
  title: "main",
  createdAt: "2026-08-08T00:00:00.000Z",
  splitId: "shell:split",
  splitTitle: "split",
};

function renderLayout(activeTab: DevTerminalTab) {
  return render(
    <MobileTerminalLayout
      tabs={[activeTab]}
      projectTabs={[activeTab]}
      selectedTabId={activeTab.id}
      activeTab={activeTab}
      focusRequestId={0}
      markTabActive={vi.fn<() => void>()}
      updateTabTitle={vi.fn<() => void>()}
      fadeStyle={{ opacity: 1, transition: "none" }}
      emptyState={null}
      handleCloseTab={vi.fn<() => void>()}
      handleSelectionChange={vi.fn<() => void>()}
    />,
  );
}

describe("MobileTerminalLayout shell exit", () => {
  beforeEach(() => resetDevTerminalStore());

  it("routes accessory keys to the surviving split after the main shell exits", () => {
    const view = renderLayout(mainTab);
    expect(screen.getByTestId("accessory-target")).toHaveTextContent("shell:main");
    view.unmount();
    renderLayout({ ...mainTab, mainExited: true });
    expect(screen.getByTestId("accessory-target")).toHaveTextContent("shell:split");
  });

  it("does not expose accessory input for an exited shell without a survivor", () => {
    const { splitId: _splitId, splitTitle: _splitTitle, ...tab } = mainTab;
    renderLayout({ ...tab, mainExited: true });
    expect(screen.queryByTestId("accessory-target")).not.toBeInTheDocument();
  });
});
