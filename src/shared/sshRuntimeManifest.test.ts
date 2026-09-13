import { describe, expect, it } from "vitest";
import { SSH_RUNTIME_ENTRY_CONFIG, SSH_RUNTIME_MANIFEST_VERSION } from "./sshRuntimeManifest";

describe("SSH runtime build manifest", () => {
  it("invalidates leftover v1 manifests after packing @opencode/client", () => {
    expect(SSH_RUNTIME_MANIFEST_VERSION).toBe(2);
    expect(SSH_RUNTIME_ENTRY_CONFIG.supervisor).toContain("@opencode/client");
  });
});
