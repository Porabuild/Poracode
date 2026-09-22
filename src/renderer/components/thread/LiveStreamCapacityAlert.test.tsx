import { beforeEach, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { SUPPORTED_LOCALES } from "@/shared/locale";
import { dynamicActivate } from "@/renderer/i18n/i18n";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import {
  resetLiveStreamCapacityStore,
  useLiveStreamCapacityStore,
} from "@/renderer/state/liveStreamCapacityStore";
import { LiveStreamCapacityAlert } from "./LiveStreamCapacityAlert";

beforeEach(() => {
  resetLiveStreamCapacityStore();
});

it("renders nothing while every retained thread is carried", () => {
  const { container } = render(<LiveStreamCapacityAlert />);
  expect(container).toBeEmptyDOMElement();
});

it("shows a truthful localized overload with the dropped count and the wire limit", () => {
  useLiveStreamCapacityStore.getState().setDroppedRuntimeThreadCount(3);
  render(<LiveStreamCapacityAlert />);
  const status = screen.getByRole("status");
  expect(status).toHaveTextContent(
    "Live updates are paused for 3 threads because this window exceeds the 200-thread live streaming limit. Close or reopen a thread to resume the paused ones.",
  );
});

it("uses the singular form for one paused thread", () => {
  useLiveStreamCapacityStore.getState().setDroppedRuntimeThreadCount(1);
  render(<LiveStreamCapacityAlert />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Live updates are paused for 1 thread because this window exceeds the 200-thread live streaming limit.",
  );
});

it("renders a compiled plural and the wire limit in every supported locale", async () => {
  useLiveStreamCapacityStore.getState().setDroppedRuntimeThreadCount(2);
  for (const locale of SUPPORTED_LOCALES) {
    await dynamicActivate(locale);
    const { unmount } = render(<LiveStreamCapacityAlert />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("200");
    // An unresolved ICU placeholder would leave braces in the rendered text.
    expect(status.textContent ?? "").not.toContain("{");
    unmount();
  }
  await dynamicActivate("en");
});
