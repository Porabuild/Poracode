import { describe, expect, it } from "vitest";
import {
  buildOpenCode2StatusFromIntegrations,
  openCode2ConnectedProviders,
  readOpenCode2Integrations,
} from "./credentials";

describe("readOpenCode2Integrations", () => {
  it("splits stored credentials from environment-backed providers", () => {
    expect(
      readOpenCode2Integrations([
        {
          id: "anthropic",
          name: "Anthropic",
          connections: [
            { type: "credential", id: "cred_1", label: "work key" },
            { type: "env", name: "ANTHROPIC_API_KEY" },
          ],
        },
        { id: "opencode", name: "OpenCode Zen", connections: [] },
      ]),
    ).toEqual([
      {
        id: "anthropic",
        name: "Anthropic",
        credentials: [{ id: "cred_1", label: "work key" }],
        envBacked: true,
      },
      { id: "opencode", name: "OpenCode Zen", credentials: [], envBacked: false },
    ]);
  });
});

describe("openCode2ConnectedProviders", () => {
  it("emits one removable row per stored credential", () => {
    expect(
      openCode2ConnectedProviders([
        {
          id: "anthropic",
          name: "Anthropic",
          credentials: [
            { id: "cred_1", label: "work key" },
            { id: "cred_2", label: "personal key" },
          ],
          envBacked: false,
        },
      ]),
    ).toEqual([
      { label: "Anthropic", id: "cred_1", detail: "work key" },
      { label: "Anthropic", id: "cred_2", detail: "personal key" },
    ]);
  });

  it("drops a credential label that only repeats the provider name", () => {
    expect(
      openCode2ConnectedProviders([
        {
          id: "opencode",
          name: "OpenCode Zen",
          credentials: [{ id: "cred_3", label: "OpenCode Zen" }],
          envBacked: false,
        },
      ]),
    ).toEqual([{ label: "OpenCode Zen", id: "cred_3" }]);
  });

  it("omits environment-backed providers, which have nothing to sign out of", () => {
    expect(
      openCode2ConnectedProviders([
        { id: "anthropic", name: "Anthropic", credentials: [], envBacked: true },
      ]),
    ).toEqual([]);
  });
});

describe("buildOpenCode2StatusFromIntegrations", () => {
  it("reports the connected providers it can manage", () => {
    expect(
      buildOpenCode2StatusFromIntegrations([
        {
          id: "opencode",
          name: "OpenCode Zen",
          credentials: [{ id: "cred_1", label: "OpenCode Zen" }],
          envBacked: false,
        },
      ]),
    ).toEqual({
      authState: "authenticated",
      providerMetadata: { connectedProviders: [{ label: "OpenCode Zen", id: "cred_1" }] },
    });
  });

  it("stays authenticated for an environment-backed provider with no stored credential", () => {
    expect(
      buildOpenCode2StatusFromIntegrations([
        { id: "anthropic", name: "Anthropic", credentials: [], envBacked: true },
      ]),
    ).toEqual({ authState: "authenticated" });
  });

  it("reports missing auth when nothing is connected", () => {
    expect(
      buildOpenCode2StatusFromIntegrations([
        { id: "opencode", name: "OpenCode Zen", credentials: [], envBacked: false },
      ]),
    ).toEqual({ authState: "missing" });
  });
});
