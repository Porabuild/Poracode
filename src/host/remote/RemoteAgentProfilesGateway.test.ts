import { describe, expect, it } from "vitest";
import type { AgentInstanceConfig } from "@/shared/contracts";
import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";
import { isEncryptedSecret, REDACTED_SECRET_VALUE } from "@/shared/secretFormat";
import type { SettingsMutationResult } from "@/shared/settingsTransactions";
import { createRemoteAgentProfilesGateway, redactAgentProfile } from "./RemoteAgentProfilesGateway";

function makeHarness(initial: Partial<SharedSettings> = {}) {
  let settings: SharedSettings = {
    ...defaultSharedSettings,
    ...initial,
  };
  const gateway = createRemoteAgentProfilesGateway({
    readSettings: () => settings,
    editSettingsFields: async (fields, compute): Promise<SettingsMutationResult> => {
      const nextFields = compute(settings);
      const updated = { ...settings };
      for (const field of fields) {
        (updated as Record<string, unknown>)[field] = nextFields[field];
      }
      settings = updated;
      return {
        status: "committed",
        authorityId: "test-authority",
        sequence: 1,
        changes: [],
        revisions: {},
      };
    },
  });
  return {
    gateway,
    getSettings: () => settings,
  };
}

describe("RemoteAgentProfilesGateway", () => {
  it("redacts sensitive env values on read and excludes non-profile drivers", () => {
    const claudeProfile: AgentInstanceConfig = {
      id: "work",
      driver: "claude",
      displayName: "Work",
      config: { configDir: "~/.claude-work" },
      environment: {
        ANTHROPIC_API_KEY: { value: "enc:v1:abc", sensitive: true },
        ANTHROPIC_BASE_URL: { value: "https://api.example.com" },
        LEGACY_TOKEN: { value: "lc-safe:v1:sealed:legacy" },
      },
    };
    const acpGeneric: AgentInstanceConfig = {
      id: "custom-acp",
      driver: "acp-generic",
      displayName: "Custom ACP",
    };

    const { gateway } = makeHarness({
      agentInstances: {
        work: claudeProfile,
        "custom-acp": acpGeneric,
      },
    });

    const result = gateway.read();
    expect(Object.keys(result.profiles)).toEqual(["work"]);
    expect(result.profiles.work).toEqual({
      ...claudeProfile,
      environment: {
        ANTHROPIC_API_KEY: { value: REDACTED_SECRET_VALUE, sensitive: true },
        ANTHROPIC_BASE_URL: { value: "https://api.example.com" },
        LEGACY_TOKEN: { value: REDACTED_SECRET_VALUE, sensitive: true },
      },
    });
    expect(redactAgentProfile(claudeProfile).environment?.ANTHROPIC_API_KEY?.value).toBe(
      REDACTED_SECRET_VALUE,
    );
  });

  it("creates a profile, seals sensitive env on host, and returns a redacted view", async () => {
    const { gateway, getSettings } = makeHarness();

    const result = await gateway.command({
      kind: "create",
      payload: {
        driver: "cursor",
        id: "work",
        displayName: "Work",
        environment: {
          CURSOR_API_KEY: { value: "secret-key-123", sensitive: true },
        },
      },
    });

    expect(result.instance?.environment).toEqual({
      CURSOR_API_KEY: { value: REDACTED_SECRET_VALUE, sensitive: true },
    });
    const storedKey = getSettings().agentInstances?.work?.environment?.CURSOR_API_KEY;
    expect(storedKey?.sensitive).toBe(true);
    expect(isEncryptedSecret(storedKey?.value ?? "")).toBe(true);
    expect(storedKey?.value).not.toContain("secret-key-123");
  });

  it("rejects duplicate ids, unknown drivers, and redacted/ciphertext secrets on create", async () => {
    const { gateway } = makeHarness({
      agentInstances: {
        work: {
          id: "work",
          driver: "codex",
          displayName: "Work",
          config: { homeDir: "~/.codex-work" },
        },
      },
    });

    await expect(
      gateway.command({
        kind: "create",
        payload: {
          driver: "codex",
          id: "work",
          displayName: "Duplicate",
          config: { homeDir: "~/.codex-dup" },
        },
      }),
    ).rejects.toMatchObject({ code: "profile_already_exists", status: 409 });

    await expect(
      gateway.command({
        kind: "create",
        payload: {
          driver: "acp-generic",
          id: "other",
          displayName: "Not a profile driver",
        },
      }),
    ).rejects.toMatchObject({ code: "profile_unsupported_driver", status: 400 });

    await expect(
      gateway.command({
        kind: "create",
        payload: {
          driver: "cursor",
          id: "bad-secret",
          displayName: "Bad",
          environment: {
            CURSOR_API_KEY: { value: REDACTED_SECRET_VALUE, sensitive: true },
          },
        },
      }),
    ).rejects.toMatchObject({ code: "profile_invalid_environment", status: 400 });

    await expect(
      gateway.command({
        kind: "create",
        payload: { driver: "codex", id: "blank-name", displayName: "   " },
      }),
    ).rejects.toMatchObject({ code: "profile_invalid_config", status: 400 });

    await expect(
      gateway.command({
        kind: "create",
        payload: { driver: "claude", id: "missing-config", displayName: "Missing config" },
      }),
    ).rejects.toMatchObject({ code: "profile_invalid_config", status: 400 });
  });

  it("updates profile metadata/config while preserving on-disk sealed secrets", async () => {
    const { gateway, getSettings } = makeHarness({
      agentInstances: {
        glm: {
          id: "glm",
          driver: "claude",
          displayName: "GLM",
          config: { configDir: "~/.claude-glm" },
          environment: {
            ANTHROPIC_AUTH_TOKEN: { value: "enc:v1:sealed:orig-token", sensitive: true },
          },
        },
      },
    });

    const result = await gateway.command({
      kind: "update",
      instanceId: "glm",
      displayName: "GLM 5",
      config: { configDir: "~/.claude-glm5" },
    });

    expect(result.instance?.displayName).toBe("GLM 5");
    expect(result.instance?.config).toEqual({ configDir: "~/.claude-glm5" });
    expect(result.instance?.environment?.ANTHROPIC_AUTH_TOKEN?.value).toBe(REDACTED_SECRET_VALUE);
    expect(getSettings().agentInstances?.glm?.environment?.ANTHROPIC_AUTH_TOKEN?.value).toBe(
      "enc:v1:sealed:orig-token",
    );
  });

  it("restores unchanged redacted placeholders and seals newly entered values in set-environment", async () => {
    const sealedExisting = "lc-safe:v1:existing-nonce:existing-tag:existing-cipher";
    const { gateway, getSettings } = makeHarness({
      agentInstances: {
        glm: {
          id: "glm",
          driver: "claude",
          displayName: "GLM",
          config: { configDir: "~/.claude-glm" },
          environment: {
            KEEP_TOKEN: { value: sealedExisting, sensitive: true },
            ROTATE_TOKEN: { value: "lc-safe:v1:old:old:old", sensitive: true },
          },
        },
      },
    });

    const result = await gateway.command({
      kind: "set-environment",
      instanceId: "glm",
      environment: {
        KEEP_TOKEN: { value: REDACTED_SECRET_VALUE, sensitive: true },
        ROTATE_TOKEN: { value: "new-secret", sensitive: true },
        PLAIN_VAR: { value: "hello" },
      },
    });

    expect(result.instance?.environment).toEqual({
      KEEP_TOKEN: { value: REDACTED_SECRET_VALUE, sensitive: true },
      ROTATE_TOKEN: { value: REDACTED_SECRET_VALUE, sensitive: true },
      PLAIN_VAR: { value: "hello" },
    });
    const storedEnv = getSettings().agentInstances?.glm?.environment;
    expect(storedEnv?.KEEP_TOKEN).toEqual({ value: sealedExisting, sensitive: true });
    expect(storedEnv?.ROTATE_TOKEN?.sensitive).toBe(true);
    expect(isEncryptedSecret(storedEnv?.ROTATE_TOKEN?.value ?? "")).toBe(true);
    expect(storedEnv?.ROTATE_TOKEN?.value).not.toBe("lc-safe:v1:old:old:old");
    expect(storedEnv?.PLAIN_VAR).toEqual({ value: "hello" });
  });

  it("removes a profile and clears dependent settings, while blocking removal when another profile depends on it", async () => {
    const { gateway, getSettings } = makeHarness({
      agentInstances: {
        owner: {
          id: "owner",
          driver: "devin",
          displayName: "Owner",
          config: { format: 1, auth: { kind: "isolated-owner" } },
        },
        dependent: {
          id: "dependent",
          driver: "devin",
          displayName: "Dependent",
          config: { format: 1, auth: { kind: "owner-reference", ownerId: "owner" } },
        },
      },
      disabledAgents: ["devin:dependent", "claude"],
      hiddenModels: { "devin:dependent": ["m1"], claude: ["m2"] },
      agentSettings: { "devin:dependent": { foo: "bar" }, claude: { keep: true } },
    });

    // Cannot remove owner while dependent references it.
    await expect(gateway.command({ kind: "remove", instanceId: "owner" })).rejects.toMatchObject({
      code: "profile_dependency_violation",
      status: 400,
    });

    // Removing dependent succeeds and cleans up per-profile settings.
    const removed = await gateway.command({ kind: "remove", instanceId: "dependent" });
    expect(removed.profiles.dependent).toBeUndefined();
    expect(removed.profiles.owner).toBeDefined();
    expect(getSettings().disabledAgents).toEqual(["claude"]);
    expect(getSettings().hiddenModels).toEqual({ claude: ["m2"] });
    expect(getSettings().agentSettings).toEqual({ claude: { keep: true } });

    // Now owner can be removed.
    const removedOwner = await gateway.command({ kind: "remove", instanceId: "owner" });
    expect(removedOwner.profiles).toEqual({});
  });
});
