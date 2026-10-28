import { describe, expect, it, vi } from "vitest";
import { applyCrewComposerControls } from "./applyCrewComposerControls";

describe("applyCrewComposerControls", () => {
  it("adds the Poracode section to the provider picker", () => {
    const crewSection = {
      entries: [],
      canCreate: true,
      onSelect: vi.fn<(choice: { crewId: string } | { newCrew: true }) => void>(),
    };
    const controls = applyCrewComposerControls(
      [
        {
          kind: "provider-model",
          providers: [],
          currentAgentKind: "claude",
          currentModel: "opus",
          onChange: vi.fn<(selection: { agentKind: string; model: string }) => void>(),
        },
      ],
      { crewSection },
    );
    expect(controls[0]).toMatchObject({ kind: "provider-model", crewSection });
  });
});
