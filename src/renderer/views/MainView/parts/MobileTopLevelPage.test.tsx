import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { usePanelStore } from "@/renderer/state/panelStore";
import { MobileTopLevelPage } from "./MobileTopLevelPage";

vi.mock("@/renderer/deferredFeatures", () => ({
  DeferredGitHubActionsView: () => null,
  DeferredMobileWorkspacePage: () => (
    <button type="button" onClick={() => usePanelStore.getState().closeMobileUtilityPage()}>
      Close Git and Files
    </button>
  ),
  DeferredSettingsOverlay: (props: { onBack?: () => void }) => (
    <button type="button" onClick={props.onBack}>
      Settings back
    </button>
  ),
  DeferredProjectSettingsOverlay: (props: { projectId: string; onClose: () => void }) => (
    <button type="button" onClick={props.onClose}>
      Project settings for {props.projectId}
    </button>
  ),
}));

afterEach(() => {
  usePanelStore.setState({ mobileUtilityPage: null, projectSettingsId: null });
  window.history.replaceState(null, "");
  vi.restoreAllMocks();
});

it("returns from settings through mobile history without rendering Home first", () => {
  const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
  window.history.replaceState(
    {
      __poracodeMobilePage: {
        page: "settings",
        settingsSection: "usage",
      },
    },
    "",
  );
  usePanelStore.setState({
    mobileUtilityPage: "settings",
    settingsSection: "usage",
  });

  render(<MobileTopLevelPage />);

  fireEvent.click(screen.getByRole("button", { name: "Settings back" }));

  expect(back).toHaveBeenCalledTimes(1);
  expect(usePanelStore.getState().mobileUtilityPage).toBe("settings");
});

it("renders compact project settings and closes the page through its back action", () => {
  usePanelStore.setState({
    mobileUtilityPage: "projectSettings",
    projectSettingsId: "proj-1",
  });

  render(<MobileTopLevelPage />);

  fireEvent.click(screen.getByRole("button", { name: "Project settings for proj-1" }));
  expect(usePanelStore.getState()).toMatchObject({
    mobileUtilityPage: null,
    projectSettingsId: null,
  });
});

it("renders Git and Files as a top-level mobile page and closes it", () => {
  usePanelStore.setState({ mobileUtilityPage: "workspace" });

  render(<MobileTopLevelPage />);

  fireEvent.click(screen.getByRole("button", { name: "Close Git and Files" }));
  expect(usePanelStore.getState().mobileUtilityPage).toBeNull();
});
