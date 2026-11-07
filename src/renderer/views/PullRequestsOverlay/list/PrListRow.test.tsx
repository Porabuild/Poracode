// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { PullRequestEntry } from "./prListModel";
import { PrListRow } from "./PrListRow";

const entry = {
  project: { id: "p1", name: "app" },
  summary: {
    repository: "example/app",
    headBranch: "feature/x",
    additions: 3,
    deletions: 1,
    reviewRequested: false,
    author: { login: "octocat" },
    labels: [{ name: "bug", color: "d73a4a" }, { name: "ui" }],
    pr: {
      number: 7,
      title: "Fix the renderer",
      state: "open",
      updatedAt: "2026-10-25T00:00:00Z",
    },
  },
} as unknown as PullRequestEntry;

describe("PrListRow", () => {
  it("keeps the number, author avatar and labels in the sidebar row", () => {
    render(
      <PrListRow
        entry={entry}
        selected={false}
        showRepository={false}
        onOpen={vi.fn<() => void>()}
      />,
    );
    const row = screen.getByRole("button", { name: /Fix the renderer/ });
    expect(row).toHaveTextContent("#7");
    expect(row).toHaveTextContent("octocat");
    expect(screen.getByText("o")).toBeInTheDocument();
    expect(screen.getByTitle("bug")).toBeInTheDocument();
    expect(screen.getByTitle("ui")).toBeInTheDocument();
  });
});
