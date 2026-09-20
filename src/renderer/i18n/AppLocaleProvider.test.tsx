import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { BottomSheet } from "@/renderer/components/common/BottomSheet";
import { AppLocaleProvider } from "./AppLocaleProvider";
import { dynamicActivate } from "./i18n";

afterEach(async () => {
  await act(async () => dynamicActivate("en"));
});

it("updates library dismissal labels with the app language without remounting sheet content", async () => {
  await act(async () => dynamicActivate("en"));
  render(
    <AppLocaleProvider>
      <BottomSheet label="Fixture actions" onClose={() => {}}>
        <input aria-label="Fixture draft" defaultValue="Keep my draft" />
      </BottomSheet>
    </AppLocaleProvider>,
  );
  await screen.findByRole("dialog", { name: "Fixture actions" });
  const draft = screen.getByRole("textbox", { name: "Fixture draft" });
  expect(document.querySelector('button[aria-label="Dismiss"]')).not.toBeNull();

  await act(async () => dynamicActivate("de"));
  await waitFor(() => expect(document.querySelector('button[aria-label="Dismiss"]')).toBeNull());
  expect(screen.getAllByRole("button", { name: "Schließen" }).length).toBeGreaterThan(0);
  expect(screen.getByRole("textbox", { name: "Fixture draft" })).toBe(draft);
  expect(draft).toHaveValue("Keep my draft");

  await act(async () => dynamicActivate("en"));
  await waitFor(() =>
    expect(document.querySelector('button[aria-label="Dismiss"]')).not.toBeNull(),
  );
});
