import { describe, expect, it } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import { composerRuntimeRequirement } from "../composerRuntimeRequirement";
import "./index";

describe("Antigravity GUI runtime prerequisite", () => {
  const cliOnly = {
    kind: "antigravity",
    installed: true,
    runtimeVariants: { cli: { installed: true, version: "1.5.14" } },
  } as unknown as AgentStatus;

  it("offers the ACP installer for a CLI-only or legacy status, never for terminal", () => {
    expect(composerRuntimeRequirement(cliOnly, "gui")).toMatchObject({
      registryAgentId: "antigravity-acp",
    });
    expect(composerRuntimeRequirement({ ...cliOnly, runtimeVariants: {} }, "gui")).toBeDefined();
    expect(composerRuntimeRequirement(cliOnly, "terminal")).toBeUndefined();
  });

  it("unblocks GUI only once ACP is detected as installed", () => {
    const status = {
      ...cliOnly,
      runtimeVariants: { acp: { installed: false } },
    } as unknown as AgentStatus;
    expect(composerRuntimeRequirement(status, "gui")).toBeDefined();
    expect(
      composerRuntimeRequirement(
        {
          ...status,
          runtimeVariants: { acp: { installed: true } },
        } as unknown as AgentStatus,
        "gui",
      ),
    ).toBeUndefined();
  });
});
