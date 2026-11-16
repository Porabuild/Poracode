import type { Plugin } from "@opencode/plugin/tui";
import type { Adapter } from "../../adapter";

/** The "Thread approval & sandbox" flow for one session; shared by the palette command and the composer chip. */
export async function configureSessionOptions(
  context: Plugin.Context,
  adapter: Adapter,
  sessionID: string,
) {
  const offered = await adapter.sessionOptions(sessionID);
  const approvalOffered = offered.approvalPolicies.length > 0;
  const sandboxOffered = offered.sandboxModes.length > 0;
  const approval = approvalOffered
    ? await context.ui.dialog.select<string>({
        title: "Approval policy",
        options: offered.approvalPolicies.map((option) => ({
          title: option.label,
          value: option.id,
        })),
      })
    : undefined;
  // Cancelling any shown dialog aborts the whole flow.
  if (approvalOffered && approval === undefined) return;
  const sandbox = sandboxOffered
    ? await context.ui.dialog.select<string>({
        title: "Sandbox mode",
        options: offered.sandboxModes.map((option) => ({
          title: option.label,
          value: option.id,
        })),
      })
    : undefined;
  if (sandboxOffered && sandbox === undefined) return;
  if (!approval && !sandbox) return;
  const result = await adapter.setSessionOptions(sessionID, {
    ...(approval ? { approvalPolicy: approval } : {}),
    ...(sandbox ? { sandboxMode: sandbox } : {}),
  });
  const message = "error" in result ? result.error : undefined;
  if (message) void context.ui.dialog.alert({ title: "Thread options", message });
}

/** The "Thread fast/thinking/workflows/context" flow for one session. */
export async function configureSessionToggles(
  context: Plugin.Context,
  adapter: Adapter,
  sessionID: string,
) {
  const offered = await adapter.sessionOptions(sessionID);
  const toggles = [
    { key: "fast", title: "Fast mode", offered: offered.fast.offered },
    { key: "thinking", title: "Thinking mode", offered: offered.thinking.offered },
    { key: "workflows", title: offered.workflows.label, offered: offered.workflows.offered },
  ] as const;
  const contextOffered = offered.contextSizes.length > 0;
  if (!toggles.some((toggle) => toggle.offered) && !contextOffered) {
    void context.ui.dialog.alert({
      title: "Thread toggles",
      message: "This provider offers no fast, thinking, workflow, or context-size options.",
    });
    return;
  }
  const choice: {
    fast?: boolean;
    thinking?: boolean;
    workflows?: boolean;
    contextSize?: string;
  } = {};
  for (const toggle of toggles) {
    if (!toggle.offered) continue;
    const answer = await context.ui.dialog.select<string>({
      title: toggle.title,
      options: [
        { title: "On", value: "on" },
        { title: "Off", value: "off" },
      ],
    });
    // Cancelling any shown dialog aborts the whole flow.
    if (answer === undefined) return;
    choice[toggle.key] = answer === "on";
  }
  if (contextOffered) {
    const contextSize = await context.ui.dialog.select<string>({
      title: "Context size",
      options: offered.contextSizes.map((option) => ({
        title: option.label,
        value: option.id,
      })),
    });
    if (contextSize === undefined) return;
    choice.contextSize = contextSize;
  }
  const result = await adapter.setSessionOptions(sessionID, choice);
  const message = "error" in result ? result.error : undefined;
  if (message) void context.ui.dialog.alert({ title: "Thread toggles", message });
}
