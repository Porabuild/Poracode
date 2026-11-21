/** Toy capability inventories for independent native composer journeys. */
export function composerControlAgentEvents(): Record<string, unknown>[] {
  const capabilities = {
    presentationModes: ["gui", "terminal"],
    modes: ["agent", "plan"],
    models: [{ id: "gpt-5", label: "Fixture Pro" }],
    efforts: ["low", "high"],
    defaultEffort: "low",
    contextSizes: [
      { id: "128k", label: "128K" },
      { id: "256k", label: "256K" },
    ],
    fastModels: ["gpt-5"],
    approvalPolicies: [
      { id: "review", label: "Ask When Needed" },
      { id: "never", label: "No prompts" },
    ],
    defaultApprovalPolicy: "review",
    defaultSandboxMode: "project",
    bypassPermissions: { approvalPolicy: "never", sandboxMode: "all-files" },
  };
  return [
    {
      type: "agent-status-updated",
      status: {
        kind: "codex",
        label: "Fixture Agent",
        installed: true,
        authState: "authenticated",
        envKind: "posix",
        capabilities,
      },
    },
    {
      type: "agent-status-updated",
      status: {
        kind: "fixture-reviewer",
        label: "Fixture Reviewer",
        installed: true,
        authState: "authenticated",
        envKind: "posix",
        capabilities: {
          ...capabilities,
          models: [{ id: "review-model", label: "Review Model" }],
          fastModels: [],
        },
      },
    },
  ];
}

export function machineProviderOrderAgentEvents(): Record<string, unknown>[] {
  const native = composerControlAgentEvents();
  const wsl = native.map((event) => {
    const status = event.status as Record<string, unknown>;
    return { ...event, status: { ...status, envKind: "wsl", envDistro: "Ubuntu" } };
  });
  return [...native, ...wsl];
}

export function providerHandoffAgentEvents(): Record<string, unknown>[] {
  return composerControlAgentEvents().map((event) => {
    const status = event.status as Record<string, unknown>;
    if (status.kind !== "fixture-reviewer") return event;
    const capabilities = status.capabilities as Record<string, unknown>;
    return {
      ...event,
      status: { ...status, capabilities: { ...capabilities, presentationModes: ["terminal"] } },
    };
  });
}

/** Encoded toy relation for native adaptive family selectors; no provider payload. */
export function composerFamilyAgentEvent(): Record<string, unknown> {
  const members = [
    { model: "pair-alpha", lead: "alpha", fast: false },
    { model: "pair-alpha-fast", lead: "alpha", fast: true },
    { model: "pair-beta", lead: "beta", fast: false },
    { model: "pair-beta-fast", lead: "beta", fast: true },
  ];
  return {
    type: "agent-status-updated",
    status: {
      kind: "fixture-family",
      label: "Fixture Family Agent",
      installed: true,
      authState: "authenticated",
      envKind: "posix",
      capabilities: {
        presentationModes: ["gui", "terminal"],
        models: members.map(({ model }) => ({ id: model, label: model })),
        efforts: ["low"],
        fastModels: [],
        modelFamilies: [
          {
            model: "pair-alpha",
            label: "Fixture Family",
            selectors: [
              {
                id: "lead",
                labelKey: "modelSelection.lead",
                options: [
                  { id: "alpha", label: "Alpha" },
                  { id: "beta", label: "Beta" },
                ],
              },
            ],
            bindings: { effort: "model", fast: "model" },
            redundantValues: { effort: [""], fast: [false] },
            members: members.map(({ model, lead, fast }) => ({
              model,
              selections: { lead },
              effort: "low",
              fast,
            })),
          },
        ],
      },
    },
  };
}
