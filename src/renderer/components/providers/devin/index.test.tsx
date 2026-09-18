// @vitest-environment node
import type { ThreadConfig } from "@/shared/contracts";
import { describe, expect, it, vi } from "vitest";
import { getComposerControls, getConfigNormalizer } from "../providerComposer";
import { getTitleGenDefaults } from "../titleGen";
import { devinDefaultCapabilities } from "@/supervisor/agents/devin/detection";
import "./index";

describe("Devin presentation defaults", () => {
  it("keeps Smart in Terminal and selects Bypass in Chat", () => {
    const input = {
      config: { model: "", approvalPolicy: "smart" },
      capabilities: devinDefaultCapabilities,
    };
    expect(getConfigNormalizer("devin")?.({ ...input, presentationMode: "gui" })).toEqual({
      approvalPolicy: "bypass",
    });
    expect(getConfigNormalizer("devin")?.({ ...input, presentationMode: "terminal" })).toEqual({});
    const controls = getComposerControls("devin")?.({
      ...input,
      presentationMode: "gui",
      onConfigChange: vi.fn<(patch: Partial<ThreadConfig>) => void>(),
      isDisabled: false,
    });
    const permission = controls?.find(
      (control) => "iconKind" in control && control.iconKind === "permission",
    );
    expect(permission).toMatchObject({ options: [{ id: "bypass", label: "Bypass Approvals" }] });
    expect(getTitleGenDefaults("devin")?.model).toBe("swe-1-6-fast");
  });
});
