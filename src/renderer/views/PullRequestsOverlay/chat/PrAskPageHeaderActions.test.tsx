// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MobilePageHeaderActionsSlot } from "@/renderer/components/layout/MobilePageHeaderActions";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { makeTestAskSession } from "../testing/prDetailTestScope";
import { PrAskPageHeaderActions } from "./PrAskPageHeaderActions";

function renderInHeader(session = makeTestAskSession()) {
  render(
    <>
      <MobilePageHeaderActionsSlot />
      <PrAskPageHeaderActions session={session} />
    </>,
  );
  return session;
}

describe("PrAskPageHeaderActions", () => {
  it("offers Open as thread in the page header once the thread exists", () => {
    const session = renderInHeader(makeTestAskSession({ threadId: "thread-1" }));
    const button = screen.getByRole("button", { name: "Open as thread" });
    expect(button.closest("[data-poracode-mobile-page-header-actions]")).not.toBeNull();
    fireEvent.click(button);
    expect(session.openAsThread).toHaveBeenCalledTimes(1);
  });

  it("is disabled before the first message created a thread", () => {
    renderInHeader();
    expect(screen.getByRole("button", { name: "Open as thread" })).toBeDisabled();
  });

  it("is disabled while the first message is starting", () => {
    renderInHeader(makeTestAskSession({ threadId: "thread-1", starting: true }));
    expect(screen.getByRole("button", { name: "Open as thread" })).toBeDisabled();
  });
});
