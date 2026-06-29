// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { SettingsView } from "./SettingsView";

vi.mock("@/renderer/components/providers/ThreadProviderIcon", () => ({
  ThreadProviderIcon: () => null,
}));

describe("mobile SettingsView", () => {
  it("does not expose desktop-only browser preferences", () => {
    render(
      <SettingsView
        threads={[]}
        projects={[]}
        sectionId={null}
        onSectionChange={() => {}}
        onThreadAction={() => {}}
      />,
    );

    expect(screen.queryByText("Browser")).not.toBeInTheDocument();
    expect(screen.queryByText("Links and page behavior")).not.toBeInTheDocument();
    expect(screen.queryByText("Removal behavior")).not.toBeInTheDocument();
  });
});
