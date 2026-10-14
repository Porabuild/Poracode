import { describe, expect, it } from "vitest";
import { SSH_RUNTIME_ENTRY_CONFIG, SSH_RUNTIME_MANIFEST_VERSION } from "./sshRuntimeManifest";

describe("SSH runtime build manifest", () => {
  it("invalidates predecessors without declared code/source/resource identity", () => {
    expect(SSH_RUNTIME_MANIFEST_VERSION).toBe(4);
    expect(SSH_RUNTIME_ENTRY_CONFIG.supervisor).toContain("@opencode/client");
  });
});
