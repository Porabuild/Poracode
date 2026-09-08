import { describe, expect, it } from "vitest";
import { dedupeAcpAuthMethods } from "./authMethods";

describe("dedupeAcpAuthMethods", () => {
  it("keeps a standalone API-key agent method when no env-var twin exists", () => {
    expect(
      dedupeAcpAuthMethods([
        { id: "oauth-personal", name: "Log in with personal account" },
        { id: "oauth-business", name: "Log in with organization" },
        { id: "api-key", name: "API Key" },
        { id: "agent-platform", name: "Agent Platform" },
      ]).map((method) => method.id),
    ).toEqual(["oauth-personal", "oauth-business", "api-key", "agent-platform"]);
  });

  it("still drops an agent stub that duplicates an env-var method name", () => {
    expect(
      dedupeAcpAuthMethods([
        { id: "example-api-key", name: "Example API key" },
        {
          type: "env_var",
          id: "example_api_key",
          name: "Example API key",
          vars: [{ name: "EXAMPLE_API_KEY" }],
        },
      ]),
    ).toEqual([
      {
        type: "env_var",
        id: "example_api_key",
        name: "Example API key",
        vars: [{ name: "EXAMPLE_API_KEY" }],
      },
    ]);
  });
});
