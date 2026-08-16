import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useWelcomeGateStore } from "@/renderer/state/welcomeGateStore";
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
});
