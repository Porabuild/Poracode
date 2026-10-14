import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REMOTE_CONTRACT_REGISTRY } from "../../../src/shared/remote/contract/registry";
import type { RemoteHttpRouteContract } from "../../../src/shared/remote/contract/types";
import {
  remoteSettingsPatchSchema,
  remoteSettingsSchema,
} from "../../../src/shared/remote/protocol";

type Fixture = Record<string, unknown>;

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "fixtures/native-settings.json"), "utf8"),
) as Fixture;

function route(id: string): RemoteHttpRouteContract {
  const result = REMOTE_CONTRACT_REGISTRY.routes.find((candidate) => candidate.id === id);
  if (!result) throw new Error(`Missing authoritative route ${id}`);
  return result;
}

function requestSchema(id: string) {
  const request = route(id).request;
  if (request.bodyKind !== "json") throw new Error(`${id} is not a JSON request`);
  return request.jsonSchema;
}

function responseSchema(id: string) {
  const response = route(id).response;
  if (response.wireKind !== "json") throw new Error(`${id} is not a JSON response`);
  return response.jsonSchema;
}

describe("native settings fixture", () => {
  it("is accepted by every authoritative producer route schema", () => {
    expect(responseSchema("agent-statuses").parse(fixture.agentStatuses)).toMatchObject({
      windows: [],
      wsl: [],
    });
    expect(responseSchema("provider-usage").parse(fixture.providerUsage)).toEqual(
      fixture.providerUsage,
    );
    expect(responseSchema("profile-devices").parse(fixture.profileDevices)).toEqual(
      fixture.profileDevices,
    );
    expect(requestSchema("profile-core-stats").parse(fixture.statsRequest)).toEqual(
      fixture.statsRequest,
    );
    expect(responseSchema("profile-core-stats").parse(fixture.profileCoreStats)).toEqual(
      fixture.profileCoreStats,
    );
    expect(requestSchema("profile-token-stats").parse(fixture.statsRequest)).toEqual(
      fixture.statsRequest,
    );
    expect(responseSchema("profile-token-stats").parse(fixture.profileTokenStats)).toEqual(
      fixture.profileTokenStats,
    );
    expect(requestSchema("profile-identity").parse(fixture.profileIdentityRequest)).toEqual(
      fixture.profileIdentityRequest,
    );
    expect(responseSchema("profile-identity").parse(fixture.profileIdentityResponse)).toEqual(
      fixture.profileIdentityResponse,
    );
    expect(responseSchema("settings-read").parse(fixture.settingsResponse)).toBeTruthy();
    expect(responseSchema("settings-write").parse(fixture.settingsResponse)).toBeTruthy();
  });

  it("documents producer-side unknown stripping and settings secret redaction", () => {
    const agents = responseSchema("agent-statuses").parse(fixture.agentStatuses);
    expect(agents).not.toHaveProperty("futureTopLevel");

    requestSchema("settings-write").parse(fixture.settingsPatch);
    const patch = remoteSettingsPatchSchema.parse(fixture.settingsPatch);
    expect(patch).toMatchObject({ agentSettings: { cursor: { structuredRuntime: "acp" } } });
    expect(patch).toMatchObject({
      usage: {
        providerOrder: ["codex", "claude"],
        collapsedProviders: ["claude"],
      },
    });
    expect(JSON.stringify(patch)).not.toContain("sdkApiKey");

    const wireResponse = responseSchema("settings-read").parse(fixture.settingsResponse) as {
      settings: unknown;
    };
    const response = remoteSettingsSchema.parse(wireResponse.settings);
    expect(response.usage).toMatchObject({
      providerOrder: ["codex", "claude"],
      collapsedProviders: ["claude"],
    });
    expect(JSON.stringify(response)).not.toContain("fixture-secret-never-surface");
  });

  it("keeps settings reads from older remote-v3 hosts valid without additive preferences", () => {
    const response = structuredClone(fixture.settingsResponse) as {
      settings: Record<string, unknown>;
    };
    delete response.settings.usage;
    delete response.settings.searchUseIgnoreFiles;
    delete response.settings.searchExclude;

    expect(responseSchema("settings-read").parse(response)).toBeTruthy();
  });
});
