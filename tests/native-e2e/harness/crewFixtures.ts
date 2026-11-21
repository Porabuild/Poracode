import { composerControlAgentEvents } from "./composerFixtures.ts";

export const CREW_FIXTURE = {
  id: "native-review",
  name: "Fixture Review",
  policy: "crew-only",
  favorite: true,
  lead: { agentKind: "codex", model: "gpt-5", effort: "high", fast: false, contextSize: "128k" },
  roles: [
    {
      id: "reviewer",
      label: "Reviewer",
      brief: "Review the change",
      noEdits: true,
      parallel: 2,
      selection: { agentKind: "fixture-reviewer", model: "review-mini", fast: false },
    },
  ],
};

export function crewAgentEvents(): Record<string, unknown>[] {
  return composerControlAgentEvents().map((event) => {
    const status = event.status as Record<string, unknown>;
    const capabilities = status.capabilities as Record<string, unknown>;
    const models = capabilities.models as { id: string; label: string }[];
    return {
      ...event,
      status: {
        ...status,
        capabilities: {
          ...capabilities,
          models: [
            ...models,
            { id: status.kind === "codex" ? "fixture-mini" : "review-mini", label: "Fixture Mini" },
          ],
          modelContextSizes: Object.fromEntries(
            models.map((model) => [model.id, ["128k", "256k"]]),
          ),
        },
      },
    };
  });
}
