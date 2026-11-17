import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { MemorySkillSuggestion } from "@/shared/memory";
import { MemorySkillSuggestions } from "./MemorySkillSuggestions";

const memoryCommand = vi.hoisted(() => vi.fn<(payload: { action: string }) => Promise<unknown>>());

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ memoryCommand }),
  isRemoteSession: () => false,
}));

function suggestion(overrides: Partial<MemorySkillSuggestion> = {}): MemorySkillSuggestion {
  return {
    id: "suggestion-1",
    projectId: null,
    name: "review-diff",
    description: "Review a diff before committing",
    body: "---\nname: review-diff\n---\n\n# Review\n",
    scope: "global",
    availability: "poracode",
    why: "Repeated across 3 notes.",
    status: "suggested",
    createdAt: "2026-11-16T00:00:00.000Z",
    updatedAt: "2026-11-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("MemorySkillSuggestions", () => {
  beforeEach(() => {
    memoryCommand.mockReset();
    memoryCommand.mockImplementation(async (payload) =>
      payload.action === "suggestions" ? [suggestion()] : { ok: true },
    );
  });

  it("approves an edited draft instead of the original suggestion", async () => {
    render(<MemorySkillSuggestions />);

    expect(await screen.findByText("review-diff")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "review-carefully" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), {
      target: { value: "Look twice" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(memoryCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "suggestion",
          decision: "approve",
          id: "suggestion-1",
          name: "review-carefully",
          description: "Look twice",
        }),
      ),
    );
  });

  it("keeps Approve disabled until the skill name is valid", async () => {
    render(<MemorySkillSuggestions />);
    expect(await screen.findByText("review-diff")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Not A Skill" },
    });
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  });

  it("lets the user cancel editing a suggested skill", async () => {
    render(<MemorySkillSuggestions />);
    expect(await screen.findByText("review-diff")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("textbox", { name: "Skill instructions" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox", { name: "Skill instructions" })).not.toBeInTheDocument();
  });
});
