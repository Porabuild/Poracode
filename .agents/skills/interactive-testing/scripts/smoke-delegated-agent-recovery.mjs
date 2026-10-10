export async function mockDelegatedAgentRecoveryGate({ client, evaluate, fixture }) {
  const result = await evaluate(
    client,
    `(async () => {
      const runtime = await window.__poracodeDev.loadRuntimeDiagnostics();
      const store = window.__poracodeDev.stores.app;
      const previousThreads = store.getState().threads;
      const ids = [];
      const checks = [];
      try {
        for (const kind of ["native", "crossagent"]) {
          const id = "remote:smoke-recovery:thread:" + kind;
          ids.push(id);
          const thread = {
            id, remoteServerId: "smoke-recovery", projectId: ${JSON.stringify(fixture.project.id)},
            agentKind: "codex", config: {}, title: "Delegated recovery fixture", status: "working",
            attention: "none", archived: false, done: false, starred: false, canResumeWithConfig: false,
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          };
          const payload = kind === "crossagent"
            ? { name: "Crossagent", status: "running", isCrossagent: true, crossagentStatus: "running" }
            : { name: "Task", status: "running", isSubAgent: true, subAgentStatus: "running" };
          store.setState({ threads: [...store.getState().threads, thread] });
          store.getState().applyRuntimeEvents(id, [
            { type: "item.started", threadId: id, itemId: "text", itemType: "assistant_message" },
            { type: "content.delta", threadId: id, itemId: "text", stream: "assistant_text", delta: "newer live text" },
            { type: "item.started", threadId: id, itemId: "agent", itemType: "tool_call", payload },
          ]);
          const terminal = {
            snapshotSeq: 50, thread, completedTurns: [], contextUsage: null, updatedAt: thread.updatedAt,
            runtimeItems: [
              { id: "text", type: "assistant_message", state: "started", payload: {}, streams: { assistant_text: "older snapshot text" } },
              { id: "agent", type: "tool_call", state: "completed", payload: {
                ...payload, status: "error", result: { error: "Interrupted: agent session ended before completion." },
                ...(kind === "crossagent" ? { crossagentStatus: "failed" } : { subAgentStatus: "failed" }),
              }, streams: {} },
            ],
          };
          const options = (seq, current = true) => ({
            fromServer: true, lastSeenEventSeq: seq,
            committedPrefix: { threadId: id, snapshotSeq: 50, isCurrent: () => current, lastSeenEventSeq: () => seq },
          });
          runtime.applyThreadSnapshot(terminal, options(51));
          const staleKeptRunning = store.getState().runtimeItemsByIdByThread[id].agent.state !== "completed";
          runtime.applyThreadSnapshot(terminal, options(45, false));
          const retiredKeptRunning = store.getState().runtimeItemsByIdByThread[id].agent.state !== "completed";
          runtime.applyThreadSnapshot(terminal, options(45));
          const items = store.getState().runtimeItemsByIdByThread[id];
          checks.push(staleKeptRunning && retiredKeptRunning && items.agent.state === "completed"
            && items.agent.payload.status === "error" && items.text.streams.assistant_text === "newer live text");
        }
        return checks.length === 2 && checks.every(Boolean);
      } finally {
        for (const id of ids) store.getState().clearThreadRuntimeEvents(id);
        store.setState({ threads: previousThreads });
      }
    })()`,
    true,
  );
  if (result !== true)
    throw new Error("delegated-agent terminal snapshot or sequence/generation fence failed");
  return "bundled native and Crossagent terminal snapshots settled; newer text and stale/retired connection guards held";
}
