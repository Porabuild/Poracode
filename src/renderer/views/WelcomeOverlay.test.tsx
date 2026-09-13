import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useWelcomeGateStore } from "@/renderer/state/welcomeGateStore";
import { useAppStore } from "@/renderer/state/appStore";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { WelcomeOverlay } from "./WelcomeOverlay";

const runtime = vi.hoisted(() => ({ browser: true, localBackend: false }));

vi.mock("@/renderer/clientRuntime", () => ({
  hasClientCapability: () => runtime.localBackend,
  isBrowserClientRuntime: () => runtime.browser,
}));

vi.mock("@/renderer/actions/projectActions", () => ({
  loadHomeScopeLocation: vi.fn<() => Promise<string>>(),
}));

vi.mock("@/renderer/views/MainView/parts/CreateProject/CreateProjectMenu", () => ({
  CreateProjectMenu: ({ children }: { children: React.ReactNode }) => children,
}));

describe("WelcomeOverlay", () => {
  beforeEach(() => {
    localStorage.clear();
    runtime.browser = true;
    runtime.localBackend = false;
    useWelcomeGateStore.setState({ backgroundWorkReleased: false });
  });

  it("does not cover the browser connection welcome and releases startup work", async () => {
    render(<WelcomeOverlay />);

    expect(screen.queryByText("Where do you want to begin?")).not.toBeInTheDocument();
    await waitFor(() => expect(useWelcomeGateStore.getState().backgroundWorkReleased).toBe(true));
  });

  it("keeps the onboarding overlay for the desktop host", () => {
    runtime.browser = false;
    render(<WelcomeOverlay />);

    expect(screen.getByText("Where do you want to begin?")).toBeInTheDocument();
  });

  it("unmounts when the desktop primary action dismisses the overlay", () => {
    runtime.browser = false;
    runtime.localBackend = true;
    const openDraft = vi.fn<() => void>();
    useAppStore.setState({
      projects: [
        {
          id: HOME_PROJECT_ID,
          name: "Home",
          location: { kind: "posix", path: "/tmp/home" },
          createdAt: "2026-09-13T00:00:00.000Z",
        },
      ],
      openDraft,
    });
    render(<WelcomeOverlay />);

    fireEvent.click(screen.getByText("Ask Question"));
    const overlay = document.querySelector(".poracode-welcome-page");
    if (overlay) fireEvent.transitionEnd(overlay);

    expect(document.querySelector(".poracode-welcome-page")).toBeNull();
    expect(openDraft).toHaveBeenCalledWith(HOME_PROJECT_ID);
  });
});
