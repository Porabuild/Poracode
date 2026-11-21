import { readFileSync } from "node:fs";

/** The same neutral catalogs pin the PWA and Swift projections and drive touch QA. */
export function modelVisibilityAgentEvents(): Record<string, unknown>[] {
  const fixture = JSON.parse(
    readFileSync(
      new URL("../../../protocol/remote/v3/fixtures/client-model-visibility.json", import.meta.url),
      "utf8",
    ),
  ) as {
    agents: Record<string, unknown>[];
  };
  return fixture.agents.map((status) => ({ type: "agent-status-updated", status }));
}
