import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useMobilePageHistory } from "./mobilePageHistory";

beforeEach(() => {
  usePanelStore.setState({ mobileUtilityPage: null, settingsSection: null });
  window.history.replaceState({ __poracodeMobilePage: { page: "settings" } }, "");
});
afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "");
  usePanelStore.setState({ mobileUtilityPage: null, settingsSection: null });
});

it("restores a page on reload without pushing a duplicate history entry", async () => {
  const push = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
  renderHook(() => useMobilePageHistory(true));
  await waitFor(() => expect(usePanelStore.getState().mobileUtilityPage).toBe("settings"));
  expect(push).not.toHaveBeenCalled();
});

it("restores compact history after a viewport change without duplicating the page", async () => {
  const push = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
  const { rerender } = renderHook(({ compact }) => useMobilePageHistory(compact), {
    initialProps: { compact: false },
  });
  rerender({ compact: true });
  await waitFor(() => expect(usePanelStore.getState().mobileUtilityPage).toBe("settings"));
  expect(push).not.toHaveBeenCalled();

  act(() => usePanelStore.getState().openMobileUtilityPage("usage"));
  expect(push).toHaveBeenCalledTimes(1);
  expect(push).toHaveBeenLastCalledWith({ __poracodeMobilePage: { page: "usage" } }, "");
});

it("applies Back and Forward without writing another history entry", async () => {
  const push = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
  renderHook(() => useMobilePageHistory(true));
  await waitFor(() => expect(usePanelStore.getState().mobileUtilityPage).toBe("settings"));

  act(() => {
    window.history.replaceState(null, "");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(usePanelStore.getState().mobileUtilityPage).toBeNull();

  act(() => {
    window.history.replaceState({ __poracodeMobilePage: { page: "settings" } }, "");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(usePanelStore.getState().mobileUtilityPage).toBe("settings");
  expect(push).not.toHaveBeenCalled();
});

it("keeps navigation requested in the same batch as a history restoration", async () => {
  const push = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
  renderHook(() => useMobilePageHistory(true));
  await waitFor(() => expect(usePanelStore.getState().mobileUtilityPage).toBe("settings"));

  act(() => {
    window.history.replaceState({ __poracodeMobilePage: { page: "usage" } }, "");
    window.dispatchEvent(new PopStateEvent("popstate"));
    usePanelStore.getState().openMobileUtilityPage("ports");
  });
  expect(usePanelStore.getState().mobileUtilityPage).toBe("ports");
  expect(push).toHaveBeenCalledTimes(1);
  expect(push).toHaveBeenLastCalledWith({ __poracodeMobilePage: { page: "ports" } }, "");
});
