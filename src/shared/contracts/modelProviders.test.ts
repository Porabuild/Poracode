import { describe, expect, it } from "vitest";
import {
  manageModelProvidersPayloadSchema,
  manageModelProvidersResultSchema,
} from "./modelProviders";

const save = {
  agentKind: "fixture-agent",
  env: { kind: "native" },
  action: "save",
  create: true,
  revision: "revision",
  provider: {
    id: "fixture-route",
    name: "Fixture",
    baseURL: "http://localhost:8000/v1",
    protocol: "openai-completions",
    modelIds: ["model-id"],
  },
};
describe("model provider contracts", () => {
  it("requires an environment and revision before mutation", () => {
    expect(manageModelProvidersPayloadSchema.safeParse(save).success).toBe(true);
    expect(manageModelProvidersPayloadSchema.safeParse({ ...save, env: undefined }).success).toBe(
      false,
    );
    expect(
      manageModelProvidersPayloadSchema.safeParse({ ...save, revision: undefined }).success,
    ).toBe(false);
  });
  it.each(["file:///etc/passwd", "https://secret:token@example.com/v1", "javascript:alert(1)"])(
    "rejects unsafe endpoint %s",
    (baseURL) => {
      expect(
        manageModelProvidersPayloadSchema.safeParse({
          ...save,
          provider: { ...save.provider, baseURL },
        }).success,
      ).toBe(false);
    },
  );
  it.each(["route\u0000child", "__proto__", "constructor", "route\nchild"])(
    "rejects unsafe route %s",
    (id) => {
      expect(
        manageModelProvidersPayloadSchema.safeParse({ ...save, provider: { ...save.provider, id } })
          .success,
      ).toBe(false);
    },
  );
  it("keeps credentials write-only in results", () => {
    const result = manageModelProvidersResultSchema.parse({
      ok: true,
      revision: "revision",
      catalog: [],
      providers: [
        {
          ...save.provider,
          custom: true,
          removable: true,
          credentialConfigured: true,
          apiKey: "fixture-secret",
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("fixture-secret");
  });
  it("preserves existing native route identifiers with dots and underscores", () => {
    expect(
      manageModelProvidersPayloadSchema.safeParse({
        ...save,
        create: false,
        provider: { ...save.provider, id: "gateway.work_key" },
      }).success,
    ).toBe(true);
    expect(
      manageModelProvidersResultSchema.safeParse({
        ok: true,
        revision: "revision",
        catalog: [],
        providers: [
          {
            ...save.provider,
            id: "gateway.work_key",
            custom: true,
            removable: true,
            credentialConfigured: true,
          },
        ],
      }).success,
    ).toBe(true);
  });
});
