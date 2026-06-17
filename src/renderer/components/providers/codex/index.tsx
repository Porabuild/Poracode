export * from "./CodexStatusIcon";

import { msg } from "@lingui/core/macro";
import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
import { i18n } from "@/renderer/i18n/i18n";
import { CodexStatusIcon } from "./CodexStatusIcon";
import { planWorkToggle } from "../composerControlBuilders";
import type { AgentCapability, ThreadConfig } from "@/shared/contracts";
import {
  registerCommitGenDefaults,
  registerComposerControls,
  registerConfigNormalizer,
  registerConflictResolverDefaults,
  registerGuiSlashCommands,
  registerProviderIcon,
  registerProviderLabel,
  registerTitleGenDefaults,
} from "../ProviderIcon";

registerProviderIcon("codex", CodexStatusIcon);
registerProviderLabel("codex", "Codex");
registerCommitGenDefaults("codex", {
  label: "Codex",
  hint: "GPT-5.4 Mini xhigh",
  model: "gpt-5.4-mini",
  effort: "xhigh",
});
registerTitleGenDefaults("codex", {
  label: "Codex",
  hint: "GPT-5.4 Mini medium",
  model: "gpt-5.4-mini",
  effort: "medium",
});
registerConflictResolverDefaults("codex", {
  label: "Codex",
  hint: "GPT-5.5 high",
  model: "gpt-5.5",
  effort: "high",
});

registerConfigNormalizer("codex", ({ config, presentationMode }) => {
  // Plan mode is wired only through ACP; the terminal CLI ignores it.
  if (presentationMode === "terminal" && config.mode === "plan") {
    return { mode: "agent" };
  }
  return {};
});

// A slash command's label is its id followed by the (translated) description, so
// the description is translated once and the `/id` keyword stays untranslatable.
const codexCommand = (id: string, description: string) => ({
  id,
  description,
  label: `${id} - ${description}`,
});

registerGuiSlashCommands("codex", {
  buildCommands: ({ hasEffort, supportsFast }) => [
    codexCommand("model", i18n._(msg`Open the model picker`)),
    codexCommand("plan", i18n._(msg`Switch this chat to plan mode`)),
    codexCommand("agent", i18n._(msg`Switch this chat to agent mode`)),
    codexCommand("goal", i18n._(msg`Set or view an experimental goal`)),
    ...(hasEffort ? [codexCommand("effort", i18n._(msg`Open the effort picker`))] : []),
    ...(supportsFast ? [codexCommand("fast", i18n._(msg`Toggle Fast mode`))] : []),
  ],
  resolveLocalAction: (typed) => {
    const normalized = typed.trim().toLowerCase();
    if (normalized === "/model") return { kind: "open-control", target: "model" };
    if (normalized === "/effort") return { kind: "open-control", target: "effort" };
    if (normalized === "/fast") return { kind: "toggle-fast" };
    if (normalized === "/plan") return { kind: "set-mode", mode: "plan" };
    if (normalized === "/agent") return { kind: "set-mode", mode: "agent" };
    return null;
  },
});

const CODEX_PERMISSION_PRESETS = [
  {
    id: "default-permissions",
    label: msg`Default permissions`,
    hint: msg`Use config`,
    approvalPolicies: [],
    sandboxModes: [],
  },
  {
    id: "auto-review",
    label: msg`Auto-review`,
    hint: msg`Review on request`,
    approvalPolicies: ["on-request"],
    sandboxModes: ["workspace-write"],
  },
  {
    id: "full-access",
    label: msg`Full access`,
    hint: msg`No prompts`,
    approvalPolicies: ["never"],
    sandboxModes: ["danger-full-access"],
  },
] as const;

type CodexPermissionPreset = (typeof CODEX_PERMISSION_PRESETS)[number];

function resolveCodexPermissionPreset(
  preset: CodexPermissionPreset,
  approvalIds: Set<string>,
  sandboxIds: Set<string>,
): { approvalPolicy: string; sandboxMode: string } | undefined {
  if (preset.approvalPolicies.length === 0 && preset.sandboxModes.length === 0) {
    return { approvalPolicy: "", sandboxMode: "" };
  }

  const approvalPolicy = preset.approvalPolicies.find((id) => approvalIds.has(id));
  const sandboxMode = preset.sandboxModes.find((id) => sandboxIds.has(id));
  return approvalPolicy && sandboxMode ? { approvalPolicy, sandboxMode } : undefined;
}

function isCodexPermissionPresetSelected(
  preset: CodexPermissionPreset & { approvalPolicy: string; sandboxMode: string },
  config: { approvalPolicy?: string | undefined; sandboxMode?: string | undefined },
): boolean {
  if (!preset.approvalPolicy && !preset.sandboxMode) {
    return !config.approvalPolicy && !config.sandboxMode;
  }
  return (
    preset.approvalPolicy === config.approvalPolicy && preset.sandboxMode === config.sandboxMode
  );
}

function buildCodexPermissionControl(
  capabilities: AgentCapability,
  config: ThreadConfig,
  isDisabled: boolean,
  onConfigChange: (patch: Partial<ThreadConfig>) => void,
): ComposerControl | null {
  const approvalIds = new Set(capabilities.approvalPolicies.map((policy) => policy.id));
  const sandboxIds = new Set(capabilities.sandboxModes.map((mode) => mode.id));
  const permissionPresets = CODEX_PERMISSION_PRESETS.flatMap((preset) => {
    const resolved = resolveCodexPermissionPreset(preset, approvalIds, sandboxIds);
    return resolved ? [{ ...preset, ...resolved }] : [];
  });
  if (permissionPresets.length === 0) return null;
  const current =
    permissionPresets.find((preset) => isCodexPermissionPresetSelected(preset, config)) ??
    permissionPresets[0]!;
  return {
    iconKind: "permission",
    options: permissionPresets.map((preset) => ({
      id: preset.id,
      label: i18n._(preset.label),
      hint: i18n._(preset.hint),
    })),
    hideLabelOnWrap: true,
    value: current.id,
    isDisabled,
    onChange: (value: string) => {
      const preset = permissionPresets.find((option) => option.id === value);
      if (!preset) return;
      onConfigChange({
        approvalPolicy: preset.approvalPolicy,
        sandboxMode: preset.sandboxMode,
      });
    },
  };
}

registerComposerControls("codex", {
  // ACP exposes plan mode in addition to the preset selector.
  gui: ({ capabilities, config, isDisabled, onConfigChange }) => {
    const isPlanMode = (config.mode ?? "agent") !== "agent";
    const controls: ComposerControl[] = [
      planWorkToggle({
        isPlanMode,
        isDisabled,
        onChange: (isSelected) => onConfigChange({ mode: isSelected ? "plan" : "agent" }),
      }),
    ];
    const permission = buildCodexPermissionControl(
      capabilities,
      config,
      isDisabled,
      onConfigChange,
    );
    if (permission) controls.push(permission);
    return controls;
  },
  // Terminal CLI ignores `mode: "plan"` but uses the same preset selector
  // as GUI for permissions so both surfaces stay in lockstep.
  terminal: ({ capabilities, config, isDisabled, onConfigChange }) => {
    const permission = buildCodexPermissionControl(
      capabilities,
      config,
      isDisabled,
      onConfigChange,
    );
    return permission ? [permission] : [];
  },
});
