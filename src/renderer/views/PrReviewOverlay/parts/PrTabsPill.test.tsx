import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { PrChecksStatus } from "@/renderer/utils/prStatus";
import { PrTabsPill, type PrTabCounts } from "./PrTabsPill";

const counts: PrTabCounts = {
  conversation: 0,
  commits: 0,
  checks: 1,
  changes: 0,
};

function renderChecksTab(checksStatus: PrChecksStatus) {
  render(
    <PrTabsPill
      active="conversation"
      onChange={() => undefined}
      counts={counts}
      checksStatus={checksStatus}
    />,
  );
  return screen.getByRole("tab", { name: /Checks/ }).querySelector("svg");
}

describe("PrTabsPill", () => {
  it("colors the Checks tab icon green when checks pass", () => {
    expect(renderChecksTab("SUCCESS")).toHaveClass("text-success");
  });

  it("colors the Checks tab icon yellow when checks are pending", () => {
    expect(renderChecksTab("PENDING")).toHaveClass("text-warning");
  });

  it("colors the Checks tab icon red when checks fail", () => {
    expect(renderChecksTab("FAILURE")).toHaveClass("text-danger");
  });
});
