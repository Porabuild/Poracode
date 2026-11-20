import { FIXTURE_PROJECT_ID } from "./labFixtures.ts";
import { LabHttpError } from "./labAuth.ts";

/** Opt-in stateful tool settings. Ordinary producer fixtures stay unchanged. */
export class LabComposerToolsState {
  enabled = false;
  private globals: Array<Record<string, unknown>> = [];

  constructor(private readonly workspaces: Map<string, unknown[]>) {}

  reset(): void {
    this.enabled = false;
    this.globals = [];
  }

  prepare(): void {
    this.enabled = true;
    const server = (id: string, name: string, enabled: boolean) => ({
      id,
      name,
      enabled,
      timeoutMs: 30_000,
      transport: { type: "stdio", command: "fixture-tools", args: [], env: {} },
    });
    this.globals = [
      server("global-review", "Review_API", true),
      server("global-build", "Build_tools", true),
    ];
    this.workspaces.set(FIXTURE_PROJECT_ID, [server("workspace-review", "REVIEW_API", false)]);
  }

  response(route: string, body: Record<string, unknown>): unknown {
    if (route === "mcp-settings-read") return { servers: structuredClone(this.globals) };
    const scope = body.scope as { kind: string; projectId?: string };
    if (route === "mcp-settings-operation") {
      if (body.kind === "oauth-status") return { kind: "oauth-status", authenticatedServerIds: [] };
      if (body.kind === "probe")
        return {
          kind: "probe",
          result: {
            status: "available",
            toolCount: 2,
            latencyMs: 1,
            environment: { runtime: "host", projectScoped: scope.kind === "project" },
          },
        };
      throw new LabHttpError(
        "unconfigured_contract_case",
        "This tool story has no OAuth fixture.",
        501,
      );
    }
    if (body.kind !== "upsert") {
      throw new LabHttpError(
        "unconfigured_contract_case",
        "This tool story only changes enabled servers.",
        501,
      );
    }
    const server = structuredClone(body.server as Record<string, unknown>);
    if (scope.kind === "global") this.globals = this.upsert(this.globals, server);
    else if (scope.projectId && this.workspaces.has(scope.projectId)) {
      this.workspaces.set(
        scope.projectId,
        this.upsert(this.workspaces.get(scope.projectId) as Array<Record<string, unknown>>, server),
      );
    } else throw new LabHttpError("not_found", "Project not found.", 404);
    return { servers: structuredClone(this.globals) };
  }

  private upsert(
    servers: Array<Record<string, unknown>>,
    server: Record<string, unknown>,
  ): Array<Record<string, unknown>> {
    const index = servers.findIndex((value) => value.id === server.id);
    if (index < 0) return [...servers, server];
    return servers.map((value, offset) => (offset === index ? server : value));
  }
}
