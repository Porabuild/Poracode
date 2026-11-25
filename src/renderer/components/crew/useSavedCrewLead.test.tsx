import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentCapability } from "@/shared/contracts";
import { crewBindingFromSavedCrew, type CrewMemberSelection, type SavedCrew } from "@/shared/crew";
import type { ProviderModelMenuProvider } from "@/renderer/components/common/ProviderModelMenu/parts/buildItems";
import { useSavedCrewLead, type SavedCrewLeadInput } from "./useSavedCrewLead";

const savedCrew: SavedCrew = {
  id: "crew-hook",
  name: "Night shift",
  lead: { agentKind: "codex", model: "gpt-5.4", effort: "high" },
  roles: [
    {
      id: "builder",
      label: "Builder",
      selection: { agentKind: "codex", model: "gpt-5.4-mini" },
    },
  ],
  policy: "crew-only",
  updatedAt: 1,
};

const capability: AgentCapability = {
  models: [{ id: "gpt-5.4", label: "5.4" }],
  efforts: ["low", "high"],
  modelEfforts: {},
  modes: ["agent"],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "server",
  presentationMode: "gui",
  presentationModes: ["gui"],
  mcpScope: { gui: "launch", terminal: "none" },
  settingDefs: [],
};

const leadProviders: ProviderModelMenuProvider[] = [
  { kind: "codex", label: "Codex", capabilities: capability },
];

const rememberedLead: CrewMemberSelection = {
  agentKind: "codex",
  model: "gpt-5.4-mini",
  effort: "low",
};

function makeInput(overrides: Partial<SavedCrewLeadInput> = {}): SavedCrewLeadInput {
  return {
    activeSavedCrew: savedCrew,
    lead: rememberedLead,
    leadProviders,
    presentationMode: "gui",
    canFollow: true,
    hasLocalEditRef: { current: false },
    restoredRef: { current: false },
    pickRef: { current: vi.fn<() => boolean>(() => true) },
    ...overrides,
  };
}

describe("useSavedCrewLead", () => {
  it("applies the saved crew through the pick path and reports it applied", () => {
    const hasLocalEditRef = { current: false };
    const restoredRef = { current: false };
    const pick = vi.fn<() => boolean>(() => {
      hasLocalEditRef.current = true;
      return true;
    });

    renderHook(() =>
      useSavedCrewLead(makeInput({ hasLocalEditRef, restoredRef, pickRef: { current: pick } })),
    );

    expect(pick).toHaveBeenCalledWith(
      { agentKind: "codex", model: "gpt-5.4", presentationMode: "gui" },
      {
        crew: crewBindingFromSavedCrew(savedCrew),
        effort: "high",
        fast: false,
        suppressFailureToast: true,
      },
    );
    expect(hasLocalEditRef.current).toBe(false);
    expect(restoredRef.current).toBe(true);
  });

  it("reports a lead that is not offered without picking", () => {
    const pick = vi.fn<() => boolean>(() => true);
    const { result } = renderHook(() =>
      useSavedCrewLead(makeInput({ leadProviders: [], pickRef: { current: pick } })),
    );

    expect(pick).not.toHaveBeenCalled();
    expect(result.current(savedCrew)).toBe("unavailable");
  });

  it("reports a refused pick and leaves the draft unedited", () => {
    const hasLocalEditRef = { current: false };
    const restoredRef = { current: false };
    const pick = vi.fn<() => boolean>(() => {
      hasLocalEditRef.current = true;
      return false;
    });
    const { rerender } = renderHook((input: SavedCrewLeadInput) => useSavedCrewLead(input), {
      initialProps: makeInput({ hasLocalEditRef, restoredRef, pickRef: { current: pick } }),
    });

    expect(pick).toHaveBeenCalledTimes(1);
    expect(hasLocalEditRef.current).toBe(false);
    expect(restoredRef.current).toBe(false);

    rerender(
      makeInput({
        hasLocalEditRef,
        restoredRef,
        pickRef: { current: pick },
        lead: { ...rememberedLead },
      }),
    );

    expect(pick).toHaveBeenCalledTimes(1);
  });

  it("restores once per saved crew and follows a later version", () => {
    const pick = vi.fn<() => boolean>(() => true);
    const input = makeInput({ pickRef: { current: pick } });
    const { rerender } = renderHook((props: SavedCrewLeadInput) => useSavedCrewLead(props), {
      initialProps: input,
    });

    expect(pick).toHaveBeenCalledTimes(1);

    rerender({ ...input, lead: { ...rememberedLead } });
    expect(pick).toHaveBeenCalledTimes(1);

    rerender({
      ...input,
      activeSavedCrew: { ...savedCrew, updatedAt: 2 },
      lead: { ...rememberedLead },
    });
    expect(pick).toHaveBeenCalledTimes(2);
  });

  it("waits until the draft can follow", () => {
    const pick = vi.fn<() => boolean>(() => true);
    const { rerender } = renderHook((props: SavedCrewLeadInput) => useSavedCrewLead(props), {
      initialProps: makeInput({ canFollow: false, pickRef: { current: pick } }),
    });

    expect(pick).not.toHaveBeenCalled();

    rerender(makeInput({ canFollow: true, pickRef: { current: pick } }));
    expect(pick).toHaveBeenCalledTimes(1);
  });

  it("an explicit pick keeps the local-edit latch", () => {
    const hasLocalEditRef = { current: true };
    const restoredRef = { current: false };
    const pick = vi.fn<() => boolean>(() => true);
    const { result } = renderHook(() =>
      useSavedCrewLead(makeInput({ hasLocalEditRef, restoredRef, pickRef: { current: pick } })),
    );

    let applied: ReturnType<typeof result.current> | undefined;
    act(() => {
      applied = result.current(savedCrew);
    });

    expect(applied).toBe("applied");
    expect(hasLocalEditRef.current).toBe(true);
    expect(restoredRef.current).toBe(false);
    expect(pick).toHaveBeenCalledTimes(1);
    // An explicit crew pick stays a user edit: a refusal still surfaces.
    expect(pick).toHaveBeenCalledWith(
      { agentKind: "codex", model: "gpt-5.4", presentationMode: "gui" },
      { crew: crewBindingFromSavedCrew(savedCrew), effort: "high", fast: false },
    );
  });
});
