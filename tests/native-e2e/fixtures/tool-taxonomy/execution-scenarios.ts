/** Origin requirements are deliberately NOT satisfied by normalized item flags. */
export const EXECUTION_SCENARIOS_NOT_RUN = [
  ["subagents_native_origin", ["subagent_flagged"], "Provider-native child start/settlement"],
  ["subagents_nested_grouped", ["subagent_nested_child"], "Provider-native nested child routing"],
  ["subagents_detached_lifecycle", ["subagent_detached"], "Provider-native detached lifecycle"],
  ["subagents_resume_origin", ["subagent_resume"], "Provider-native resume identity"],
  [
    "crossagents_host_spawn",
    ["crossagent_flagged", "crossagent_spawn_transport"],
    "Supervisor manager/attempt runner origin",
  ],
  [
    "crossagents_nested_grouped_output",
    ["crossagent_forwarded_child"],
    "Manager forwarding/retagging",
  ],
  [
    "crossagents_background_cancel",
    ["crossagent-state:cancelled"],
    "Real foreground/background cancellation",
  ],
  [
    "crossagents_failures_retry",
    ["crossagent-state:failed"],
    "Real attempt failure/retry/resource custody",
  ],
  [
    "crossagents_continuation",
    ["crossagent-state:completed"],
    "Real completed-worker continuation",
  ],
  [
    "workflow_manifest_runtime",
    ["workflow_manifest", "workflow_manifest_chat", "workflow_results"],
    "Host manifest/transcript reader",
  ],
  ["workflow_dag_dependencies", ["workflow_dag_mcp_display"], "Host dependency scheduler"],
  [
    "workflow_dag_blocked_reports",
    ["workflow_dag_mcp_display"],
    "Worker reports and scheduler block propagation",
  ],
  [
    "workflow_dag_background_attention",
    ["workflow_dag_mcp_display"],
    "Scheduler wait and forwarded requests",
  ],
  [
    "workflow_dag_cancel_errors",
    ["workflow_dag_mcp_display"],
    "Scheduler validation/cancel/disposal",
  ],
] as const;
