import { describe, expect, it } from "vitest";
import {
  agentStatusesResponseSchema,
  agentStatusSchema,
  areAgentPresentationRuntimeFieldsEqual,
} from "./agent";

describe("agentStatusSchema runtime variants", () => {
  it("preserves optional ACP session readiness and accepts its absence", () => {
    const status = {
      kind: "acp-generic:example",
      label: "Example ACP",
      installed: true,
      authState: "unknown",
      capabilities: {},
    };

    expect(agentStatusSchema.parse(status).acpSessionEstablished).toBeUndefined();
    expect(
      agentStatusesResponseSchema.parse({
        windows: [{ ...status, acpSessionEstablished: true }],
        wsl: [],
        fromCache: false,
      }).windows[0]?.acpSessionEstablished,
    ).toBe(true);
  });

  it("parses named runtime variants with full effective capability defaults and routing", () => {
    const parsed = agentStatusSchema.parse({
      kind: "cursor",
      label: "Cursor",
      installed: true,
      authState: "authenticated",
      capabilities: {},
      runtimeVariants: {
        sdk: {
          presentationMode: "gui",
          installed: true,
          authState: "missing",
          authUsesProviderLogin: false,
          capabilities: {
            models: [{ id: "sdk-model", label: "SDK Model" }],
            presentationMode: "gui",
            liveInputMode: "server",
          },
        },
      },
      sessionRuntimeRouting: {
        prefixes: { "sdk:": "sdk" },
        fallbackRuntime: "acp",
      },
    });

    expect(parsed.runtimeVariants?.sdk).toMatchObject({
      presentationMode: "gui",
      installed: true,
      authState: "missing",
      authUsesProviderLogin: false,
      capabilities: {
        models: [{ id: "sdk-model", label: "SDK Model" }],
        efforts: [],
        modelEfforts: {},
        modes: [],
        approvalPolicies: [],
        sandboxModes: [],
        supportsResume: false,
        supportsDirectInput: true,
        liveInputMode: "server",
        presentationMode: "gui",
        settingDefs: [],
      },
    });
    expect(parsed.sessionRuntimeRouting).toEqual({
      prefixes: { "sdk:": "sdk" },
      fallbackRuntime: "acp",
    });
  });

  it("rejects empty session prefixes and incomplete runtime metadata", () => {
    const base = {
      kind: "cursor",
      label: "Cursor",
      installed: true,
      authState: "authenticated",
      capabilities: {},
    };
    expect(
      agentStatusSchema.safeParse({
        ...base,
        runtimeVariants: {
          sdk: {
            presentationMode: "gui",
            installed: true,
            authState: "authenticated",
            capabilities: {},
          },
        },
      }).success,
    ).toBe(false);
    expect(
      agentStatusSchema.safeParse({
        ...base,
        sessionRuntimeRouting: {
          prefixes: { "": "sdk" },
        },
      }).success,
    ).toBe(false);
  });
});

describe("areAgentPresentationRuntimeFieldsEqual", () => {
  const variant = {
    presentationMode: "gui" as const,
    installed: true,
    authState: "authenticated" as const,
    authUsesProviderLogin: true,
    capabilities: agentStatusSchema.parse({
      kind: "cursor",
      label: "Cursor",
      installed: true,
      authState: "authenticated",
      capabilities: {},
    }).capabilities,
  };

  it("treats absent and empty nested payloads as equal", () => {
    expect(areAgentPresentationRuntimeFieldsEqual({}, {})).toBe(true);
    expect(
      areAgentPresentationRuntimeFieldsEqual(
        {},
        { presentationAuthStates: {}, runtimeVariants: {} },
      ),
    ).toBe(true);
  });

  it("detects changes in each presentation/runtime field", () => {
    expect(
      areAgentPresentationRuntimeFieldsEqual({}, { presentationAuthStates: { gui: "missing" } }),
    ).toBe(false);
    expect(
      areAgentPresentationRuntimeFieldsEqual(
        {},
        { presentationAuthUsesProviderLogin: { gui: false } },
      ),
    ).toBe(false);
    expect(areAgentPresentationRuntimeFieldsEqual({}, { runtimeVariants: { sdk: variant } })).toBe(
      false,
    );
    expect(
      areAgentPresentationRuntimeFieldsEqual(
        { sessionRuntimeRouting: { prefixes: { "sdk:": "sdk" } } },
        { sessionRuntimeRouting: { prefixes: { "sdk:": "acp" } } },
      ),
    ).toBe(false);
    expect(
      areAgentPresentationRuntimeFieldsEqual(
        { runtimeVariants: { sdk: variant }, presentationAuthStates: { gui: "missing" } },
        { runtimeVariants: { sdk: variant }, presentationAuthStates: { gui: "missing" } },
      ),
    ).toBe(true);
  });
});
