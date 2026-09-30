import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ImportedThreadNotice } from "./parts/ImportedThreadNotice";

describe("ImportedThreadNotice", () => {
  it("names the source provider and file", () => {
    render(
      <ImportedThreadNotice
        importedFrom={{
          provider: "codex",
          path: "F:\\home\\.codex\\sessions\\rollout-cx-1.jsonl",
          importedAt: "2026-09-20T06:00:00.000Z",
        }}
      />,
    );
    expect(screen.getByText(/imported from codex cli/iu)).toBeInTheDocument();
    expect(screen.getByTitle("F:\\home\\.codex\\sessions\\rollout-cx-1.jsonl")).toHaveTextContent(
      "rollout-cx-1.jsonl",
    );
  });

  it("names Claude Code for a Claude import", () => {
    render(
      <ImportedThreadNotice
        importedFrom={{
          provider: "claude",
          path: "/home/demo/.claude/projects/repo/sess.jsonl",
          importedAt: "2026-09-20T06:00:00.000Z",
        }}
      />,
    );
    expect(screen.getByText(/imported from claude code/iu)).toBeInTheDocument();
  });
});
