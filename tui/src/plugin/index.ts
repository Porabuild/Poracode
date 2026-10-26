import { Plugin } from "@opencode/plugin/tui";
import { createSignal } from "solid-js";
import type { Adapter } from "../adapter";

/**
 * Bundled Poracode plugin: contributions that ride the upstream plugin API
 * instead of patched vendored code. Slots/dialogs/commands land here.
 *
 * The plugin is loaded in-process, so it reaches the adapter facade directly
 * rather than over the vendored client's typed HTTP surface.
 */
export function createPoracodePlugin(input: { adapter: Adapter }) {
  const { adapter } = input;
  return Plugin.define({
    id: "poracode.core",
    setup(context) {
      // Session select returns the session's SessionInfo so callers keep the id.
      const pickSession = async (title: string) => {
        const sessions = context.data.session.list();
        if (sessions.length === 0) return undefined;
        return context.ui.dialog.select<string>({
          title,
          options: sessions.map((session) => ({
            title: session.title ?? session.id,
            value: session.id,
          })),
        });
      };

      const [goalTick, setGoalTick] = createSignal(0);
      adapter.subscribeGoal(() => setGoalTick((value) => value + 1));
      // A compact goal line in the prompt footer; hidden without a goal.
      context.ui.slot({
        append: "prompt.footer.status",
        render: (slotInput) => {
          goalTick();
          if (!slotInput.sessionID) return null;
          return adapter.goalLine(slotInput.sessionID) ?? null;
        },
      });
      context.keymap.layer(() => ({
        commands: [
          {
            id: "poracode.about",
            title: "About Poracode",
            group: "Poracode",
            palette: true,
            run: () => {
              void context.ui.dialog.alert({
                title: "About Poracode",
                message: `Poracode TUI ${context.app.version}\nhttps://poracode.com/`,
              });
            },
          },
          {
            id: "poracode.session.rename",
            title: "Rename thread",
            group: "Thread",
            palette: true,
            run: async () => {
              const sessionID = await pickSession("Rename which thread?");
              if (!sessionID) return;
              const title = await context.ui.dialog.prompt({
                title: "New title",
              });
              if (!title?.trim()) return;
              await context.client.session.update({
                sessionID,
                title: title.trim(),
              });
            },
          },
          {
            id: "poracode.session.archive",
            title: "Archive thread",
            group: "Thread",
            palette: true,
            run: async () => {
              const sessionID = await pickSession("Archive which thread?");
              if (!sessionID) return;
              const ok = await context.ui.dialog.confirm({
                title: "Archive thread",
                message: "Archive this thread? It leaves the active list.",
              });
              if (!ok) return;
              await context.client.session.update({
                sessionID,
                archived: true,
              });
            },
          },
          {
            id: "poracode.session.unarchive",
            title: "Unarchive thread",
            group: "Thread",
            palette: true,
            run: async () => {
              const sessionID = await pickSession("Unarchive which thread?");
              if (!sessionID) return;
              await context.client.session.update({
                sessionID,
                archived: false,
              });
            },
          },
          {
            id: "poracode.session.options",
            title: "Thread approval & sandbox",
            group: "Thread",
            palette: true,
            run: async () => {
              const sessionID = await pickSession("Configure which thread?");
              if (!sessionID) return;
              const offered = await adapter.sessionOptions(sessionID);
              const approval = offered.approvalPolicies.length
                ? await context.ui.dialog.select<string>({
                    title: "Approval policy",
                    options: offered.approvalPolicies.map((option) => ({
                      title: option.label,
                      value: option.id,
                    })),
                  })
                : undefined;
              const sandbox = offered.sandboxModes.length
                ? await context.ui.dialog.select<string>({
                    title: "Sandbox mode",
                    options: offered.sandboxModes.map((option) => ({
                      title: option.label,
                      value: option.id,
                    })),
                  })
                : undefined;
              if (!approval && !sandbox) return;
              const result = await adapter.setSessionOptions(sessionID, {
                ...(approval ? { approvalPolicy: approval } : {}),
                ...(sandbox ? { sandboxMode: sandbox } : {}),
              });
              const message = "error" in result ? result.error : undefined;
              if (message) void context.ui.dialog.alert({ title: "Thread options", message });
            },
          },
          {
            id: "poracode.session.toggles",
            title: "Thread fast/thinking/context",
            group: "Thread",
            palette: true,
            run: async () => {
              const sessionID = await pickSession("Configure which thread?");
              if (!sessionID) return;
              const offered = await adapter.sessionOptions(sessionID);
              const choice: {
                fast?: boolean;
                thinking?: boolean;
                contextSize?: string;
              } = {};
              if (offered.fast.offered) {
                const fast = await context.ui.dialog.select<string>({
                  title: "Fast mode",
                  options: [
                    { title: "On", value: "on" },
                    { title: "Off", value: "off" },
                  ],
                });
                if (fast === "on" || fast === "off") choice.fast = fast === "on";
              }
              if (offered.thinking.offered) {
                const thinking = await context.ui.dialog.select<string>({
                  title: "Thinking mode",
                  options: [
                    { title: "On", value: "on" },
                    { title: "Off", value: "off" },
                  ],
                });
                if (thinking === "on" || thinking === "off") choice.thinking = thinking === "on";
              }
              if (offered.contextSizes.length) {
                const contextSize = await context.ui.dialog.select<string>({
                  title: "Context size",
                  options: offered.contextSizes.map((option) => ({
                    title: option.label,
                    value: option.id,
                  })),
                });
                if (contextSize) choice.contextSize = contextSize;
              }
              if (!Object.keys(choice).length) {
                void context.ui.dialog.alert({
                  title: "Thread toggles",
                  message: "This provider offers no fast, thinking, or context-size options.",
                });
                return;
              }
              const result = await adapter.setSessionOptions(sessionID, choice);
              const message = "error" in result ? result.error : undefined;
              if (message) void context.ui.dialog.alert({ title: "Thread toggles", message });
            },
          },
          {
            id: "poracode.session.star",
            title: "Star thread",
            group: "Thread",
            palette: true,
            run: async () => {
              const sessionID = await pickSession("Star which thread?");
              if (!sessionID) return;
              const flags = await adapter.threadFlags(sessionID);
              if (!flags) {
                void context.ui.dialog.alert({
                  title: "Star thread",
                  message: "This thread is not available on the host.",
                });
                return;
              }
              const updated = await adapter.setStarred(sessionID, !flags.starred);
              void context.ui.dialog.alert({
                title: "Star thread",
                message: updated?.starred ? "Thread starred." : "Thread unstarred.",
              });
            },
          },
          {
            id: "poracode.session.done",
            title: "Mark thread done",
            group: "Thread",
            palette: true,
            run: async () => {
              const sessionID = await pickSession("Mark which thread done?");
              if (!sessionID) return;
              const flags = await adapter.threadFlags(sessionID);
              if (!flags) {
                void context.ui.dialog.alert({
                  title: "Mark thread done",
                  message: "This thread is not available on the host.",
                });
                return;
              }
              const updated = await adapter.setDone(sessionID, !flags.done);
              void context.ui.dialog.alert({
                title: "Mark thread done",
                message: updated?.done ? "Thread marked done." : "Thread reopened.",
              });
            },
          },
          {
            id: "poracode.session.resumeQueue",
            title: "Resume queued follow-ups",
            group: "Thread",
            palette: true,
            run: async () => {
              const sessionID = await pickSession("Resume queue on which thread?");
              if (!sessionID) return;
              const result = await adapter.resumeQueue(sessionID);
              void context.ui.dialog.alert({
                title: "Resume queued follow-ups",
                message: result.resumed ? "Queued follow-ups resumed." : "Queue is not paused.",
              });
            },
          },
          {
            id: "poracode.goal.set",
            title: "Set goal…",
            group: "Thread",
            palette: true,
            run: async () => {
              const sessionID = await pickSession("Set goal on which thread?");
              if (!sessionID) return;
              if (!(await adapter.goalSupported(sessionID))) {
                void context.ui.dialog.alert({
                  title: "Set goal",
                  message: "This provider doesn't support goals.",
                });
                return;
              }
              const objective = await context.ui.dialog.prompt({
                title: "Set goal",
                placeholder: "Objective…",
              });
              if (!objective?.trim()) return;
              await adapter.sendPrompt(sessionID, {
                text: `/goal ${objective.trim()}`,
              });
            },
          },
          ...(["edit", "pause", "resume", "clear"] as const).map((action) => ({
            id: `poracode.goal.${action}`,
            title: `${action[0]!.toUpperCase()}${action.slice(1)} goal`,
            group: "Thread",
            palette: true as const,
            run: async () => {
              const sessionID = await pickSession(
                `${action[0]!.toUpperCase()}${action.slice(1)} goal on which thread?`,
              );
              if (!sessionID) return;
              const state = await adapter.goalState(sessionID);
              if (!state) {
                void context.ui.dialog.alert({
                  title: "Goal",
                  message: "This thread has no goal.",
                });
                return;
              }
              const objective =
                action === "edit"
                  ? await context.ui.dialog.prompt({
                      title: "Edit goal",
                      placeholder: "Objective…",
                      value: state.objective,
                    })
                  : undefined;
              if (action === "edit" && objective === undefined) return;
              const result = await adapter.controlGoal(sessionID, {
                action,
                ...(objective !== undefined ? { objective } : {}),
              });
              if ("error" in result && result.error)
                void context.ui.dialog.alert({ title: "Goal", message: String(result.error) });
            },
          })),
          {
            id: "poracode.session.export",
            title: "Export thread",
            group: "Thread",
            palette: true,
            run: async () => {
              const sessionID = await pickSession("Export which thread?");
              if (!sessionID) return;
              const transcript = await adapter.exportSession(sessionID);
              const { mkdir, writeFile } = await import("node:fs/promises");
              const { join } = await import("node:path");
              const dir = join(process.env.PORACODE_TUI_HOME ?? ".", "exports");
              await mkdir(dir, { recursive: true });
              const file = join(
                dir,
                `${(transcript.info.title ?? sessionID).replaceAll(/[^\w.-]+/gu, "-")}.json`,
              );
              await writeFile(file, JSON.stringify(transcript, null, 2) + "\n");
              void context.ui.dialog.alert({
                title: "Export thread",
                message: `Exported ${transcript.messages.length} messages to ${file}`,
              });
            },
          },
          {
            id: "poracode.session.actions",
            title: "Provider session actions…",
            group: "Thread",
            palette: true,
            run: async () => {
              const sessionID = await pickSession("Run a session action on which thread?");
              if (!sessionID) return;
              const actions = await adapter.sessionActions(sessionID);
              if (actions.length === 0) {
                void context.ui.dialog.alert({
                  title: "Session actions",
                  message: "This provider has no session actions.",
                });
                return;
              }
              const actionId = await context.ui.dialog.select<string>({
                title: "Session action",
                options: actions.map((action) => ({ title: action.id, value: action.id })),
              });
              if (!actionId) return;
              try {
                const result = await adapter.invokeSessionAction(sessionID, actionId);
                const text = result ? JSON.stringify(result, null, 2).slice(0, 2000) : "Done.";
                void context.ui.dialog.alert({ title: `Action ${actionId}`, message: text });
              } catch (error) {
                void context.ui.dialog.alert({
                  title: `Action ${actionId}`,
                  message: error instanceof Error ? error.message : String(error),
                });
              }
            },
          },
          {
            id: "poracode.session.archived",
            title: "Archived threads…",
            group: "Thread",
            palette: true,
            run: async () => {
              const threads = await adapter.archivedThreads();
              if (threads.length === 0) {
                void context.ui.dialog.alert({
                  title: "Archived threads",
                  message: "No archived threads.",
                });
                return;
              }
              const picked = await context.ui.dialog.select<string>({
                title: "Archived thread",
                options: threads.map((thread) => ({
                  title: `${thread.title ?? thread.id} · ${new Date(thread.updatedAt).toLocaleDateString()}`,
                  value: thread.id,
                })),
              });
              if (!picked) return;
              await context.client.session.update({
                sessionID: `ses_${picked}`,
                archived: false,
              });
              void context.ui.dialog.alert({
                title: "Archived threads",
                message: "Thread restored — find it in the session list.",
              });
            },
          },
          {
            id: "poracode.usage",
            title: "Provider usage & limits",
            group: "Thread",
            palette: true,
            run: async () => {
              const usage = await adapter.providerUsage();
              const lines: string[] = [];
              for (const snapshot of usage?.snapshots ?? []) {
                if (lines.length >= 40) break;
                lines.push(
                  `${snapshot.providerId}${snapshot.plan ? ` · ${snapshot.plan}` : ""}${snapshot.error ? ` — ${snapshot.error}` : ""}`,
                );
                for (const window of snapshot.windows) {
                  if (lines.length >= 40) break;
                  const amount =
                    window.used !== undefined && window.limit !== undefined
                      ? `${window.used}/${window.limit}${window.currency ? ` ${window.currency}` : ""}`
                      : `${Math.round(window.usedPercent)}%`;
                  const reset = window.resetsAt
                    ? ` · resets ${new Date(window.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : "";
                  lines.push(
                    `  ${window.label}: ${amount} (${Math.round(window.usedPercent)}%)${reset}`,
                  );
                }
                if (snapshot.credits && lines.length < 40)
                  lines.push(`  credits: ${JSON.stringify(snapshot.credits).slice(0, 120)}`);
                if (snapshot.cost && lines.length < 40)
                  lines.push(
                    `  spent: ${snapshot.cost.amount} ${snapshot.cost.currency}${snapshot.cost.estimated ? " (estimated)" : ""}`,
                  );
              }
              void context.ui.dialog.alert({
                title: "Provider usage & limits",
                message:
                  lines.length > 0
                    ? lines.slice(0, 40).join("\n")
                    : "No usage data yet — the host collects it as providers run.",
              });
            },
          },
          {
            id: "poracode.session.sidechat",
            title: "Side question…",
            group: "Thread",
            palette: true,
            run: async () => {
              const sessionID = await pickSession("Ask a side question about which thread?");
              if (!sessionID) return;
              const question = await context.ui.dialog.prompt({
                title: "Side question",
              });
              if (!question?.trim()) return;
              try {
                await adapter.startSideChat(sessionID, question.trim());
                void context.ui.dialog.alert({
                  title: "Side question",
                  message: "Side chat started — open it from this thread's sub-sessions.",
                });
              } catch (error) {
                void context.ui.dialog.alert({
                  title: "Side question",
                  message: error instanceof Error ? error.message : String(error),
                });
              }
            },
          },
          {
            id: "poracode.provider.login",
            title: "Log in to a provider…",
            group: "Thread",
            palette: true,
            run: async () => {
              const candidates = await adapter.loginCandidates();
              if (candidates.length === 0) {
                void context.ui.dialog.alert({
                  title: "Log in",
                  message: "Every installed provider is already signed in.",
                });
                return;
              }
              const picked = await context.ui.dialog.select<string>({
                title: "Log in to",
                options: candidates.map((candidate) => ({
                  title: String(candidate.label),
                  value: candidate.kind,
                })),
              });
              const candidate = candidates.find((entry) => entry.kind === picked);
              if (!candidate) return;
              void context.ui.dialog.alert({
                title: "Log in",
                message:
                  "Run this in a terminal, then reopen the model picker:\n\n" +
                  `  poracode auth login ${candidate.kind}` +
                  (candidate.wslDistro ? ` --wsl ${candidate.wslDistro}` : ""),
              });
            },
          },
          {
            id: "poracode.provider.switch",
            title: "New thread with provider",
            group: "Thread",
            palette: true,
            run: async () => {
              const providers = await adapter.offeredProviders();
              const provider = await context.ui.dialog.select<{
                id: string;
                label: string;
                model?: string;
              }>({
                title: "Provider",
                options: providers.map((entry) => ({
                  title: entry.label,
                  value: entry,
                })),
              });
              if (!provider?.model) return;
              await context.client.session.create({
                model: { providerID: provider.id, id: provider.model },
              });
            },
          },
        ],
      }));
    },
  });
}
