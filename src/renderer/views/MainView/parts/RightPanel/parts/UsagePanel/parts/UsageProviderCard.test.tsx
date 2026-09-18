import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { UsageProviderCard } from "./UsageProviderCard";

const { sortableHandleRef, useSortableMock } = vi.hoisted(() => ({
  sortableHandleRef: vi.fn<(element: HTMLElement | null) => void>(),
  useSortableMock: vi.fn<(input: unknown) => void>(),
}));

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
  UsageWindowBars: () => null,
}));

vi.mock("@/renderer/components/providers/useProviderUsageRefresh", () => ({
  useProviderUsageRefresh: () => ({ refreshing: false, refresh: vi.fn<() => void>() }),
}));

vi.mock("@/renderer/components/providers/useUsageProviderLogin", () => ({
  useUsageProviderLogin: () => ({
    canBrowserSignIn: false,
    canApiKeySignIn: false,
    canSignOut: false,
    signingIn: false,
    signingOut: false,
    apiKey: "",
    setApiKey: vi.fn<(value: string) => void>(),
    handleSignIn: vi.fn<() => void>(),
    handleSubmitApiKey: vi.fn<() => void>(),
    handleSignOut: vi.fn<() => void>(),
  }),
}));

vi.mock("@/renderer/state/providerUsageStore", () => ({
  useProviderUsage: () => undefined,
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
});
