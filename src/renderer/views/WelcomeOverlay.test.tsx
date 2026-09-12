import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/renderer/state/appStore";
import { WELCOME_SEEN_STORAGE_KEY } from "@/renderer/state/welcomeGateStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { WelcomeOverlay } from "./WelcomeOverlay";

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    listWslDistros: vi.fn<() => Promise<never[]>>(() => Promise.resolve([])),
    getHomeScopeLocation: vi.fn<() => Promise<{ kind: string; path: string }>>(() =>
      Promise.resolve({ kind: "posix", path: "/tmp/home" }),
    ),
  }),
}));

function makeHomeProject() {
  return {
    id: "home-project",
    name: "Home",
    location: { kind: "posix", path: "/tmp/home" },
  } as never;
}

describe("WelcomeOverlay", () => {
  beforeEach(() => {
    localStorage.removeItem(WELCOME_SEEN_STORAGE_KEY);
    useAppStore.setState({
      projects: [makeHomeProject()],
      // `handleAskQuestion` opens a draft on the existing home project.
      openDraft: () => {},
    } as never);
  });

  it("unmounts after the primary CTA dismisses the overlay", () => {
    render(<WelcomeOverlay />);
    expect(document.querySelector(".poracode-welcome-page")).not.toBeNull();

    fireEvent.click(screen.getByText("Ask Question"));

    // The exit fade is CSS-driven; jsdom never delivers transitionend on its
    // own, so release the mount explicitly the way the browser would.
    const overlay = document.querySelector(".poracode-welcome-page");
    if (overlay) fireEvent.transitionEnd(overlay);

    expect(document.querySelector(".poracode-welcome-page")).toBeNull();
  });
});
