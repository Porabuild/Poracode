import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  SSH_RUNTIME_ENTRY_CONFIG,
  SSH_RUNTIME_MANIFEST_VERSION,
  sshRuntimeBuildManifestSchema,
} from "./sshRuntimeManifest";

describe("SSH runtime build manifest", () => {
  it("invalidates predecessors without declared code/source/resource identity", () => {
    expect(SSH_RUNTIME_MANIFEST_VERSION).toBe(4);
    expect(SSH_RUNTIME_ENTRY_CONFIG.supervisor).toContain("@opencode/client");
  });
  it("retains old two-resource declarations while prior closed readers refuse the new discriminator", () => {
    const resource = (kind: string) => ({ kind, sha256: "a".repeat(64) });
    const priorResources = z
      .array(
        z.strictObject({
          kind: z.enum(["agent-plugins", "bundled-plugins"]),
          sha256: z.string().regex(/^[a-f0-9]{64}$/u),
        }),
      )
      .max(2);
    const old = [resource("agent-plugins"), resource("bundled-plugins")];
    const manifest = {
      version: 4,
      entry: "supervisor",
      sourceHash: "a".repeat(64),
      captureProtocolVersion: 1,
      settingsServiceVersion: 0,
      files: [{ path: "supervisor.cjs", format: "commonjs", bytes: 1, sha256: "b".repeat(64) }],
      dependencies: [],
      resources: old,
    };
    expect(sshRuntimeBuildManifestSchema.safeParse(manifest).success).toBe(true);
    expect(
      sshRuntimeBuildManifestSchema.safeParse({
        ...manifest,
        resources: [...old, resource("pty-job-owner")],
      }).success,
    ).toBe(true);
    expect(priorResources.safeParse([resource("pty-job-owner")]).success).toBe(false);
    expect(
      sshRuntimeBuildManifestSchema.safeParse({
        ...manifest,
        resources: [resource("future-native-owner")],
      }).success,
    ).toBe(false);
  });
});
