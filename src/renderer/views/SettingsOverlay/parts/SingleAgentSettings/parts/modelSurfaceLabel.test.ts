import { describe, expect, it } from "vitest";
import type { AgentCapability, AgentStatus } from "@/shared/contracts";
import type { NativeAgentRuntimeSlots } from "../../nativeAgentRuntimes";
import { modelSurfaceLabel, modelSurfaceShortLabel } from "./modelSurfaceLabel";

const capabilities: AgentCapability = {
  models: [{ id: "m", label: "M" }],
  efforts: [],
  modelEfforts: {},
  modes: [],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  settingDefs: [],
};

const variant = {
  presentationMode: "terminal" as const,
  installed: true,
  authState: "authenticated" as const,
  authUsesProviderLogin: true,
  capabilities,
};

const agent: AgentStatus = {
  kind: "acme",
  label: "Acme",
  installed: true,
  authState: "authenticated",
  capabilities,
  runtimeVariants: {
    cli: { ...variant, capabilities: { ...capabilities, runtimeLabel: "CLI" } },
    chat: { ...variant, presentationMode: "gui" },
  },
};

const slots = {
  runtimes: [{ id: "chat", badge: "Chat" }],
} as unknown as NativeAgentRuntimeSlots;

describe("modelSurfaceLabel", () => {
  it("names the surface after the runtime's declared label even for terminal surfaces", () => {
    expect(
      modelSurfaceLabel(
        {
          kind: "acme",
          label: "Acme",
          presentationMode: "terminal",
          runtimeVariant: "cli",
          capabilities,
        },
        agent,
        slots,
      ),
    ).toBe("Acme CLI");
  });

  it("falls back to the Settings runtime slot badge when the runtime declares no label", () => {
    expect(
      modelSurfaceLabel(
        {
          kind: "acme",
          label: "Acme",
          presentationMode: "gui",
          runtimeVariant: "chat",
          capabilities: { ...capabilities, runtimeLabel: "ACP", showRuntimeLabelInPicker: false },
        },
        agent,
        slots,
      ),
    ).toBe("Acme Chat");
  });

  it("uses the picker label when the surface is not runtime-scoped", () => {
    expect(
      modelSurfaceLabel(
        {
          kind: "acme",
          label: "Acme",
          presentationMode: "gui",
          capabilities: { ...capabilities, runtimeLabel: "SDK" },
        },
        agent,
        undefined,
      ),
    ).toBe("Acme SDK");
  });

  it("qualifies unnamed presentation surfaces with the localized mode word", () => {
    const unnamed = (presentationMode: "terminal" | "gui") => ({
      kind: "acme",
      label: "Acme",
      presentationMode,
      capabilities,
    });

    expect(modelSurfaceLabel(unnamed("gui"), agent, undefined)).toBe("Acme Chat");
    expect(modelSurfaceLabel(unnamed("terminal"), agent, undefined)).toBe("Acme Terminal");
    // An already surface-qualified label keeps its word instead of stacking.
    expect(modelSurfaceLabel({ ...unnamed("gui"), label: "Acme Chat" }, agent, undefined)).toBe(
      "Acme Chat",
    );
  });

  it("keeps a legacy terminal badge without stacking the mode word", () => {
    const cursorAgent: AgentStatus = { ...agent, kind: "cursor", label: "Cursor" };
    expect(
      modelSurfaceLabel(
        { kind: "cursor", label: "Cursor", presentationMode: "terminal", capabilities },
        cursorAgent,
        undefined,
      ),
    ).toBe("Cursor CLI");
    // `makeMenuProvider` pre-qualifies `provider.label` to "Cursor CLI"; must not stack "Terminal".
    expect(
      modelSurfaceLabel(
        { kind: "cursor", label: "Cursor CLI", presentationMode: "terminal", capabilities },
        cursorAgent,
        undefined,
      ),
    ).toBe("Cursor CLI");
    expect(
      modelSurfaceShortLabel(
        { kind: "cursor", label: "Cursor CLI", presentationMode: "terminal", capabilities },
        cursorAgent,
        undefined,
      ),
    ).toBe("CLI");
  });
});

describe("modelSurfaceShortLabel", () => {
  it("strips the owning provider prefix from runtime and presentation labels", () => {
    expect(
      modelSurfaceShortLabel(
        {
          kind: "acme",
          label: "Acme",
          presentationMode: "terminal",
          runtimeVariant: "cli",
          capabilities,
        },
        agent,
        slots,
      ),
    ).toBe("CLI");
    expect(
      modelSurfaceShortLabel(
        {
          kind: "acme",
          label: "Acme",
          presentationMode: "gui",
          runtimeVariant: "chat",
          capabilities: { ...capabilities, runtimeLabel: "ACP", showRuntimeLabelInPicker: false },
        },
        agent,
        slots,
      ),
    ).toBe("Chat");
    expect(
      modelSurfaceShortLabel(
        { kind: "acme", label: "Acme", presentationMode: "terminal", capabilities },
        agent,
        undefined,
      ),
    ).toBe("Terminal");
    expect(
      modelSurfaceShortLabel(
        { kind: "acme", label: "Acme", presentationMode: "gui", capabilities },
        agent,
        undefined,
      ),
    ).toBe("Chat");
  });

  it("falls back to the presentation mode when the agent label already ends with the runtime word", () => {
    const suffixedAgent: AgentStatus = { ...agent, label: "Acme SDK" };
    expect(
      modelSurfaceShortLabel(
        {
          kind: "acme",
          label: "Acme SDK",
          presentationMode: "gui",
          capabilities: { ...capabilities, runtimeLabel: "SDK" },
        },
        suffixedAgent,
        undefined,
      ),
    ).toBe("Chat");
  });
});
