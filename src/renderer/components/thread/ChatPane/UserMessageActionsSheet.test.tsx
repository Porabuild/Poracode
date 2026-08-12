import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@lingui/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/renderer/i18n/i18n";
import { openUserMessageActions } from "./userMessageActions";
import { UserMessageActionsSheet } from "./UserMessageActionsSheet";

const { toastSuccess } = vi.hoisted(() => ({
  toastSuccess: vi.fn<(message: string) => void>(),
}));

vi.mock("@heroui/react", () => ({
  toast: { success: toastSuccess, danger: vi.fn<(message: string) => void>() },
}));

vi.mock("@/renderer/components/common/BottomSheet", () => ({
  BottomSheet: (props: { label: string; children: ReactNode }) => (
    <div role="dialog" aria-label={props.label}>
      {props.children}
    </div>
  ),
}));

afterEach(() => {
  vi.restoreAllMocks();
  toastSuccess.mockClear();
});

describe("UserMessageActionsSheet", () => {
  it("provides compact copy and checkpoint actions from the canonical host", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
    const requestRevert = vi.fn<() => void>();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <I18nProvider i18n={i18n}>
        <UserMessageActionsSheet />
      </I18nProvider>,
    );

    act(() => {
      openUserMessageActions({ text: "First line\nSecond line", requestRevert });
    });

    expect(screen.getByRole("dialog", { name: "Message actions" })).toBeInTheDocument();
    expect(screen.getByText("First line")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));
    expect(writeText).toHaveBeenCalledWith("First line\nSecond line");

    act(() => {
      openUserMessageActions({ text: "Checkpoint", requestRevert });
    });
    fireEvent.click(screen.getByRole("button", { name: "Revert to this checkpoint" }));
    expect(requestRevert).toHaveBeenCalledOnce();
  });
});
