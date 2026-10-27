import { z } from "zod";
import type { VcsDiffOutput } from "@opencode/client";
import type { AgentStatus } from "@/shared/contracts";

export const recordSchema = z.record(z.string(), z.unknown());

// The GUI presentation view of a provider's capabilities: the same shape
// /api/model lists, shared so every caller resolves identical model sets.
const guiCapabilities = (status: AgentStatus) =>
  status.capabilities.presentationCapabilities?.gui ?? status.capabilities;
export const guiModels = (status: AgentStatus) =>
  guiCapabilities(status).models ?? status.capabilities.models ?? [];
export const guiModelEfforts = (status: AgentStatus, modelID: string) => {
  const capabilities = guiCapabilities(status);
  return (
    capabilities.modelEfforts?.[modelID] ??
    status.capabilities.modelEfforts[modelID] ??
    capabilities.efforts ??
    status.capabilities.efforts
  );
};

export function gitFileStatus(status: string): "added" | "deleted" | "modified" {
  const normalized = status.toLowerCase();
  if (normalized.includes("deleted")) return "deleted";
  if (normalized.includes("added") || normalized.includes("untracked")) return "added";
  return "modified";
}

export function parseGitDiff(diff: string): VcsDiffOutput["data"] {
  return diff
    .split(/^diff --git /mu)
    .slice(1)
    .map((chunk) => {
      const patch = `diff --git ${chunk}`;
      const oldPath = patch.match(/^--- a\/(.+)$/mu)?.[1];
      const newPath = patch.match(/^\+\+\+ b\/(.+)$/mu)?.[1];
      const file = newPath ?? oldPath ?? "";
      const status: VcsDiffOutput["data"][number]["status"] =
        patch.includes("deleted file mode") || (!newPath && oldPath)
          ? "deleted"
          : patch.includes("new file mode") || (!oldPath && newPath)
            ? "added"
            : "modified";
      const lines = patch.split(/\r?\n/u);
      return {
        file,
        patch,
        additions: lines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length,
        deletions: lines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length,
        status,
      };
    })
    .filter((entry) => entry.file.length > 0);
}

export function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function record(value: unknown): Record<string, unknown> {
  const parsed = recordSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

export function supportsGui(status: AgentStatus) {
  const capabilities = status.capabilities;
  return (
    capabilities.presentationMode === "gui" ||
    capabilities.presentationModes?.includes("gui") === true ||
    capabilities.presentationCapabilities?.gui !== undefined ||
    Object.values(status.runtimeVariants ?? {}).some(
      (variant) => variant.presentationMode === "gui",
    )
  );
}

export function summarizeAgentStatus(status: AgentStatus) {
  const capabilities = status.capabilities.presentationCapabilities?.gui ?? status.capabilities;
  return {
    kind: status.kind,
    label: status.label,
    installed: status.installed,
    authState: status.presentationAuthStates?.gui ?? status.authState,
    envKind: status.envKind ?? null,
    gui: supportsGui(status),
    modelLabels: (capabilities.models ?? [])
      .slice(0, 8)
      .map(({ label }) => label)
      .join("|"),
  };
}

export function supportsMode(status: AgentStatus, mode: "agent" | "plan" | "autopilot") {
  const capabilities = status.capabilities.presentationCapabilities?.gui ?? status.capabilities;
  return capabilities.modes?.includes(mode) === true;
}
