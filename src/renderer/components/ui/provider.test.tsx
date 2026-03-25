import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ themeMode: "system", environmentMode: "windows" }),
}));

import { AppProvider } from "./provider";

describe("AppProvider", () => {
  it("renders provider content", () => {
    render(
      <AppProvider>
        <div>provider works</div>
      </AppProvider>,
    );

    expect(screen.getByText("provider works")).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
