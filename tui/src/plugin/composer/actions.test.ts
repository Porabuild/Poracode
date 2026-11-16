import { expect, test } from "bun:test";
import type { Plugin } from "@opencode/plugin/tui";
import type { Adapter } from "../../adapter";
import { configureSessionOptions, configureSessionToggles } from "./actions";

const offered = {
  approvalPolicies: [{ id: "ask", label: "Ask" }],
  sandboxModes: [{ id: "workspace", label: "Workspace" }],
  fast: { offered: true },
  thinking: { offered: true },
  workflows: { offered: false, label: "Workflows" },
  contextSizes: [],
  defaults: {},
};

function harness(answers: (string | undefined)[]) {
  const titles: string[] = [];
  const alerts: string[] = [];
  const optionCalls: unknown[] = [];
  const context = {
    ui: {
      dialog: {
        select: async (request: { title: string }) => {
          titles.push(request.title);
          return answers.shift();
        },
        alert: async (request: { message: string }) => {
          alerts.push(request.message);
        },
      },
    },
  } as unknown as Plugin.Context;
  const adapter = {
    sessionOptions: async () => offered,
    setSessionOptions: async (_session: string, options: unknown) => {
      optionCalls.push(options);
      return { ok: true as const };
    },
  } as unknown as Adapter;
  return { context, adapter, titles, alerts, optionCalls };
}

test("cancelling the approval dialog aborts the options flow", async () => {
  const run = harness([undefined]);
  await configureSessionOptions(run.context, run.adapter, "s1");
  expect(run.titles).toEqual(["Approval policy"]);
  expect(run.optionCalls).toEqual([]);
  expect(run.alerts).toEqual([]);
});

test("answering both dialogs sets approval and sandbox together", async () => {
  const run = harness(["ask", "workspace"]);
  await configureSessionOptions(run.context, run.adapter, "s1");
  expect(run.titles).toEqual(["Approval policy", "Sandbox mode"]);
  expect(run.optionCalls).toEqual([{ approvalPolicy: "ask", sandboxMode: "workspace" }]);
});

test("cancelling a later toggle dialog aborts without a no-options alert", async () => {
  const run = harness(["on", undefined]);
  await configureSessionToggles(run.context, run.adapter, "s1");
  expect(run.titles).toEqual(["Fast mode", "Thinking mode"]);
  expect(run.optionCalls).toEqual([]);
  expect(run.alerts).toEqual([]);
});
