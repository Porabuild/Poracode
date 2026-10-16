import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { UsageSnapshot } from "@poracode/agents-usage/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { UsageProviderCard } from "./UsageProviderCard";

const { sortableHandleRef, useSortableMock } = vi.hoisted(() => ({
  sortableHandleRef: vi.fn<(element: HTMLElement | null) => void>(),
  useSortableMock: vi.fn<(input: unknown) => void>(),
}));

const loginState = vi.hoisted(() => ({
  canBrowserSignIn: false,
  handleSignIn: vi.fn<() => void>(),
  snapshot: undefined as UsageSnapshot | undefined,
}));
beforeEach(() => {
  loginState.canBrowserSignIn = false;
  loginState.snapshot = undefined;
  loginState.handleSignIn.mockReset();
});

vi.mock("@dnd-kit/react/sortable", () => ({
  useSortable: (input: unknown) => {
    useSortableMock(input);
    return {
      ref: vi.fn<(element: HTMLElement | null) => void>(),
      handleRef: sortableHandleRef,
      isDragging: false,
    };
  },
}));

vi.mock("@/renderer/components/providers/ProviderIcon", () => ({
  ProviderIcon: () => <span data-testid="provider-icon" />,
}));

vi.mock("@/renderer/components/providers/UsageWindowBars", () => ({
  UsageWindowBars: ({ windows }: { windows: UsageSnapshot["windows"] }) => (
    <div>{windows.map((window) => `${window.label}: ${window.usedPercent}%`)}</div>
  ),
}));

vi.mock("@/renderer/components/providers/usageProviders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/components/providers/usageProviders")>()),
  browserSessionAddsDetails: () => true,
}));

vi.mock("@/renderer/components/providers/useProviderUsageRefresh", () => ({
  useProviderUsageRefresh: () => ({ refreshing: false, refresh: vi.fn<() => void>() }),
}));

vi.mock("@/renderer/components/providers/useUsageProviderLogin", () => ({
  useUsageProviderLogin: () => ({
    canBrowserSignIn: loginState.canBrowserSignIn,
    canApiKeySignIn: false,
    canSignOut: false,
    signingIn: false,
    signingOut: false,
    apiKey: "",
    setApiKey: vi.fn<(value: string) => void>(),
    handleSignIn: loginState.handleSignIn,
    handleSubmitApiKey: vi.fn<() => void>(),
    handleSignOut: vi.fn<() => void>(),
  }),
}));

vi.mock("@/renderer/state/providerUsageStore", () => ({
  useProviderUsage: () => loginState.snapshot,
}));

function renderCard(compact: boolean, draggable = true) {
  return render(
    <UsageProviderCard
      id="claude"
      label="Claude"
      index={0}
      compact={compact}
      collapsed={false}
      draggable={draggable}
      onToggleCollapse={vi.fn<(id: string) => void>()}
    />,
  );
}

describe("UsageProviderCard", () => {
  it("shows optional browser sign-in as a header icon alongside working meters", () => {
    loginState.canBrowserSignIn = true;
    loginState.snapshot = {
      providerId: "claude",
      status: "ok",
      windows: [{ id: "weekly", label: "Weekly", usedPercent: 20 }],
      fetchedAt: 1,
    };
    const { container } = renderCard(false);
    const signIn = screen.getByRole("button", { name: "Browser sign-in" });
    expect(container.firstElementChild?.firstElementChild).toContainElement(signIn);
    expect(signIn).toHaveClass("size-5");
    expect(signIn.textContent).toBe("");
    fireEvent.click(signIn);
    expect(loginState.handleSignIn).toHaveBeenCalledOnce();
  });

  it("uses finger-sized card actions and a touch drag handle in compact layout", () => {
    const { container } = renderCard(true);

    expect(screen.getByRole("button", { name: "Reorder Claude" })).toHaveClass(
      "size-11",
      "touch-none",
    );
    expect(screen.getByRole("button", { name: "Refresh Claude" })).toHaveClass("size-11");
    expect(
      screen
        .getAllByRole("button", { name: "Collapse Claude" })
        .find((button) => button.classList.contains("size-11")),
    ).toBeDefined();
    expect(container.firstElementChild?.firstElementChild).toHaveClass("min-h-[3.25rem]");
  });

  it("keeps the dense card controls in the desktop panel", () => {
    renderCard(false);

    expect(screen.getByRole("button", { name: "Reorder Claude" })).toHaveClass("size-4");
    expect(screen.getByRole("button", { name: "Reorder Claude" })).not.toHaveClass("touch-none");
    expect(screen.getByRole("button", { name: "Refresh Claude" })).toHaveClass("size-5");
  });

  it("removes and disables dragging for the current provider card", () => {
    renderCard(true, false);

    expect(screen.queryByRole("button", { name: "Reorder Claude" })).not.toBeInTheDocument();
    expect(useSortableMock).toHaveBeenLastCalledWith(expect.objectContaining({ disabled: true }));
  });

  it.each(["error", "rate-limited", "auth-missing"] as const)(
    "warns about %s in the header while displaying the last successful usage",
    async (status) => {
      loginState.snapshot = {
        providerId: "claude",
        status,
        windows: [{ id: "weekly", label: "Weekly", usedPercent: 56 }],
        fetchedAt: 1_700_000_000_000,
        ...(status === "error" ? { error: "HTTP 503" } : {}),
      };
      const { container } = renderCard(false);

      const warning = screen.getByRole("button", { name: "Usage refresh failed" });
      expect(container.firstElementChild?.firstElementChild).toContainElement(warning);
      expect(screen.getByText("Weekly: 56%")).toBeInTheDocument();
      fireEvent.keyDown(document.body, { key: "Tab" });
      act(() => warning.focus());
      await waitFor(() => expect(screen.getByRole("tooltip")).toBeInTheDocument());
      expect(screen.getByRole("tooltip")).toHaveTextContent("Showing last successful usage from");
      expect(screen.getByRole("tooltip")).toHaveTextContent(
        status === "error"
          ? "HTTP 503"
          : status === "rate-limited"
            ? "Rate limited. Try again shortly."
            : "Authentication is unavailable or the token could not be renewed.",
      );
    },
  );

  it("does not warn for a successful refresh or an account with no previous usage", () => {
    loginState.snapshot = {
      providerId: "claude",
      status: "ok",
      windows: [{ id: "weekly", label: "Weekly", usedPercent: 56 }],
      fetchedAt: 1,
    };
    const { unmount } = renderCard(false);
    expect(screen.queryByRole("button", { name: "Usage refresh failed" })).not.toBeInTheDocument();
    unmount();

    loginState.snapshot = { ...loginState.snapshot, status: "auth-missing", windows: [] };
    renderCard(false);
    expect(screen.queryByRole("button", { name: "Usage refresh failed" })).not.toBeInTheDocument();
  });
});
