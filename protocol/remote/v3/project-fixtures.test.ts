import { deepStrictEqual } from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HOST_DRIVE_LIST_PATH } from "../../../src/shared/contracts";
import { remoteProcedureCallEnvelopeSchema } from "../../../src/shared/ipc/resultCodec";
import { REMOTE_CONTRACT_REGISTRY } from "../../../src/shared/remote/contract/registry";
import type {
  RemoteHttpRouteContract,
  RemoteProcedureContract,
} from "../../../src/shared/remote/contract/types";
import { parseWslUncPath } from "../../../src/shared/wsl";

const contractDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = join(contractDirectory, "fixtures");
const repositoryRoot = join(contractDirectory, "../../..");

const FIXTURE_NAMES = [
  "project-browse-host-directory.json",
  "project-command-requests.json",
  "project-command-responses.json",
  "project-detect-setup-script.json",
  "project-notes.json",
  "project-procedure-envelopes.json",
  "project-route-projections.json",
  "project-settings.json",
  "project-update-semantics.json",
  "project-workspace.json",
] as const;

type JsonObject = Record<string, unknown>;
type FixtureCase = JsonObject & { id: string };

function readFixture<T>(name: (typeof FIXTURE_NAMES)[number]): T {
  return JSON.parse(readFileSync(join(fixtureDirectory, name), "utf8")) as T;
}

function readSource(path: string): string {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function cases(value: unknown, label: string): FixtureCase[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) => {
    const result = object(entry, `${label}[${index}]`);
    if (typeof result.id !== "string") throw new Error(`${label}[${index}].id must be a string`);
    return result as FixtureCase;
  });
}

function route(id: string): RemoteHttpRouteContract {
  const result = REMOTE_CONTRACT_REGISTRY.routes.find((candidate) => candidate.id === id);
  if (!result) throw new Error(`Missing authoritative route ${id}`);
  return result;
}

function procedure(name: string): RemoteProcedureContract {
  const result = REMOTE_CONTRACT_REGISTRY.procedures.find((candidate) => candidate.name === name);
  if (!result) throw new Error(`Missing authoritative procedure ${name}`);
  return result;
}

function projectCommandRequestSchema() {
  const result = route("project-command").request.jsonSchema;
  if (!result) throw new Error("project-command request schema is missing");
  return result;
}

function resolvePath(template: string, pathParams: JsonObject): string {
  let result = template;
  for (const [name, value] of Object.entries(pathParams)) {
    result = result.replace(`{${name}}`, encodeURIComponent(String(value)));
  }
  return result;
}

describe("remote v3 authoritative project fixtures", () => {
  it("keeps a bounded standalone JSON resource pack reachable by both native test roots", () => {
    const projectFiles = readdirSync(fixtureDirectory)
      .filter((name) => name.startsWith("project-") && name.endsWith(".json"))
      .sort();
    expect(projectFiles).toEqual([...FIXTURE_NAMES]);

    for (const name of FIXTURE_NAMES) {
      const raw = readFileSync(join(fixtureDirectory, name), "utf8");
      expect(raw.startsWith("\uFEFF"), `${name} must not require BOM stripping`).toBe(false);
      const parsed = JSON.parse(raw) as unknown;
      expect(JSON.parse(JSON.stringify(parsed)), `${name} must be plain JSON`).toEqual(parsed);
    }

    expect(readSource("android/app/build.gradle.kts")).toContain(
      'rootProject.projectDir.resolve("../protocol/remote/v3")',
    );
    expect(readSource("ios/App/AppTests/ProtocolDecodingTests.swift")).toContain(
      '.appendingPathComponent("protocol/remote/v3/fixtures/\\(name)")',
    );
  });

  it("covers every project-command request discriminator exactly once", () => {
    const fixture = readFixture<{ cases: unknown }>("project-command-requests.json");
    const entries = cases(fixture.cases, "project command cases");
    expect(entries).toHaveLength(7);

    const schema = projectCommandRequestSchema();
    const variants = entries.map((entry) => {
      const request = object(entry.request, `${entry.id}.request`);
      expect(schema.parse(request)).toEqual(request);
      return request.kind === "clone"
        ? `clone:${object(request.source, `${entry.id}.source`).kind as string}`
        : String(request.kind);
    });
    expect(variants).toEqual([
      "add-existing",
      "create",
      "clone:url",
      "clone:github",
      "update",
      "relocate",
      "remove",
    ]);
    expect(new Set(variants).size).toBe(7);
  });

  it("preserves update missing, null, and explicit value semantics", () => {
    const fixture = readFixture<{ accepted: unknown; rejected: unknown }>(
      "project-update-semantics.json",
    );
    const accepted = cases(fixture.accepted, "accepted updates");
    const rejected = cases(fixture.rejected, "rejected updates");
    expect({ accepted: accepted.length, rejected: rejected.length }).toEqual({
      accepted: 11,
      rejected: 2,
    });

    const schema = projectCommandRequestSchema();
    const baseline = accepted.find((entry) => entry.id === "all-missing");
    if (!baseline) throw new Error("Missing all-missing update fixture");
    const baselineParsed = object(schema.parse(baseline.request), "parsed baseline");
    const baselinePatch = object(baselineParsed.patch, "parsed baseline patch");
    const triStateFields = ["scripts", "searchSettings", "worktreeLocation", "mcpServers"];
    const ordinaryFields = ["name", "disabled"];
    for (const field of [...triStateFields, ...ordinaryFields]) {
      expect(Object.hasOwn(baselinePatch, field), `${field} must remain missing`).toBe(false);
    }

    for (const entry of accepted) {
      const request = object(entry.request, `${entry.id}.request`);
      const parsed = object(schema.parse(request), `parsed ${entry.id}`);
      expect(object(parsed.patch, `${entry.id}.patch`)).toEqual(
        object(request.patch, `${entry.id}.raw patch`),
      );
    }
    for (const field of triStateFields) {
      expect(accepted.filter((entry) => entry.field === field).map((entry) => entry.state)).toEqual(
        ["null", "value"],
      );
    }

    const valueByField = Object.fromEntries(
      accepted
        .filter((entry) => entry.state === "value")
        .map((entry) => [entry.field, object(entry.request, entry.id).patch]),
    );
    expect(valueByField.scripts).toEqual({ scripts: { actions: [] } });
    expect(valueByField.searchSettings).toEqual({ searchSettings: { exclude: {} } });
    expect(valueByField.worktreeLocation).toEqual({ worktreeLocation: {} });
    expect(valueByField.mcpServers).toEqual({ mcpServers: [] });

    expect(rejected.map((entry) => `${entry.field}:${entry.state}`)).toEqual([
      "name:null",
      "disabled:null",
    ]);
    for (const entry of rejected) {
      expect(schema.safeParse(entry.request).success).toBe(false);
    }
  });

  it("parses response optionality and each remote project location once", () => {
    const fixture = readFixture<{ cases: unknown }>("project-command-responses.json");
    const entries = cases(fixture.cases, "project response cases");
    expect(entries.map((entry) => entry.id)).toEqual([
      "with-affected-project",
      "without-affected-project",
    ]);
    const schema = route("project-command").response.jsonSchema;
    if (!schema) throw new Error("project-command response schema is missing");

    const parsed = entries.map((entry) => schema.parse(entry.response) as JsonObject);
    const projects = parsed.flatMap((response) => response.projects as JsonObject[]);
    expect(projects.map((project) => object(project.location, "location").kind)).toEqual([
      "windows",
      "posix",
      "wsl",
    ]);

    const withProject = parsed[0]!;
    expect(withProject.project).toEqual((withProject.projects as JsonObject[])[1]);
    const fullProject = object(withProject.project, "affected project");
    for (const field of [
      "remoteServerId",
      "remoteId",
      "workspaceId",
      "disabled",
      "lastDraftConfig",
    ]) {
      expect(Object.hasOwn(fullProject, field), `affected project ${field}`).toBe(true);
    }
    expect(Object.hasOwn(parsed[1]!, "project")).toBe(false);

    const wsl = object(projects[2]!.location, "WSL location");
    expect(wsl).toMatchObject({
      distro: "Ubuntu-24.04",
      linuxPath: "/home/zoë/项目",
      uncPath: "\\\\wsl.localhost\\Ubuntu-24.04\\home\\zoë\\项目",
    });
  });

  it("parses omitted settings and full stdio, HTTP, and SSE transports", () => {
    const fixture = readFixture<{ cases: unknown }>("project-settings.json");
    const entries = cases(fixture.cases, "project settings cases");
    expect(entries.map((entry) => entry.id)).toEqual(["omitted", "all-transports"]);
    const schema = route("project-settings").response.jsonSchema;
    if (!schema) throw new Error("project-settings response schema is missing");

    const omitted = object(entries[0]!.response, "omitted settings");
    expect(Object.hasOwn(omitted, "mcpServers")).toBe(false);
    schema.parse(omitted);
    const full = object(schema.parse(entries[1]!.response), "full settings");
    const servers = full.mcpServers as JsonObject[];
    expect(servers).toHaveLength(3);
    expect(servers.map((server) => object(server.transport, "transport").type)).toEqual([
      "stdio",
      "http",
      "sse",
    ]);
  });

  it("keeps notes nullability, opaque ProseMirror JSON, and todo order lossless", () => {
    const fixture = readFixture<{ readCases: unknown; writeCases: unknown }>("project-notes.json");
    const reads = cases(fixture.readCases, "notes read cases");
    const writes = cases(fixture.writeCases, "notes write cases");
    expect({ reads: reads.length, writes: writes.length }).toEqual({ reads: 2, writes: 1 });

    const readSchema = route("project-notes-read").response.jsonSchema;
    const writeSchema = route("project-notes-write").request.jsonSchema;
    if (!readSchema || !writeSchema) throw new Error("notes route schema is missing");
    const nullRead = object(readSchema.parse(reads[0]!.response), "null notes response");
    expect(nullRead.notes).toBeNull();
    const rawValue = object(object(reads[1]!.response, "raw notes response").notes, "raw notes");
    const parsedValue = object(
      object(readSchema.parse(reads[1]!.response), "parsed notes response").notes,
      "parsed notes",
    );
    expect(parsedValue.doc).toEqual(rawValue.doc);
    expect((parsedValue.todos as JsonObject[]).map((todo) => todo.id)).toEqual([
      "todo-first",
      "todo-second",
    ]);

    const rawBody = object(writes[0]!.body, "notes write body");
    const parsedBody = object(writeSchema.parse(rawBody), "parsed notes write body");
    expect(Object.hasOwn(rawBody, "projectId")).toBe(false);
    expect(parsedBody.doc).toEqual(rawBody.doc);
    expect((parsedBody.todos as JsonObject[]).map((todo) => todo.id)).toEqual([
      "todo-a",
      "todo-b",
      "todo-c",
    ]);
  });

  it("validates project workspace, file, and Git payload/result fixtures", () => {
    const fixture = readFixture<{ cases: unknown }>("project-workspace.json");
    const entries = cases(fixture.cases, "project workspace cases");
    expect(entries.map((entry) => entry.procedure)).toEqual([
      "searchProjectFiles",
      "listProjectTree",
      "searchProjectTree",
      "readProjectFile",
      "readProjectFile",
      "writeProjectFile",
      "getGitStatus",
      "getGitDiff",
      "getGitDiffBatch",
      "getGitFileContent",
      "gitProjectSnapshot",
    ]);

    for (const entry of entries) {
      const name = String(entry.procedure);
      const contract = procedure(name);
      expect(contract.resultKind, `${name} must have a JSON result`).toBe("json");
      expect(
        () => contract.requestSchema.parse(entry.payload),
        `${entry.id} payload`,
      ).not.toThrow();
      expect(() => contract.resultSchema.parse(entry.result), `${entry.id} result`).not.toThrow();
    }

    const textRead = entries.find((entry) => entry.id === "read-text-fractional-mtime");
    const write = entries.find((entry) => entry.id === "write-text-fractional-mtime");
    expect(object(textRead?.result, "text read result").modifiedAtMs).toBe(1786543210.625);
    expect(object(write?.result, "write result").modifiedAtMs).toBe(1786543212.875);

    const wsl = object(
      object(entries.find((entry) => entry.id === "search-tree-wsl")?.payload, "WSL search payload")
        .projectLocation,
      "WSL search location",
    );
    expect(wsl).toMatchObject({
      distro: "Ubuntu-24.04",
      linuxPath: "/home/zoë/项目",
      uncPath: "\\\\wsl.localhost\\Ubuntu-24.04\\home\\zoë\\项目",
    });
  });

  it("parses host browse roots, UNC spellings, entry kinds, truncation, and received order", () => {
    const fixture = readFixture<{ cases: unknown }>("project-browse-host-directory.json");
    const entries = cases(fixture.cases, "browse host cases");
    expect(entries).toHaveLength(5);
    const contract = procedure("browseHostDirectory");

    const parsedResults = entries.map((entry) => {
      expect(contract.requestSchema.parse(entry.request), `${entry.id} request`).toEqual(
        entry.request,
      );
      const result = object(contract.resultSchema.parse(entry.result), `${entry.id} result`);
      expect(result.entries, `${entry.id} ordering`).toEqual(
        object(entry.result, entry.id).entries,
      );
      return result;
    });
    expect(object(entries[0]!.request, "empty request").path).toBe("");
    expect((parsedResults[0]!.entries as JsonObject[]).map((entry) => entry.name)).toEqual([
      ".config",
      "项目",
      "résumé.md",
    ]);
    expect(new Set((parsedResults[0]!.entries as JsonObject[]).map((entry) => entry.type))).toEqual(
      new Set(["directory", "file"]),
    );
    expect(parsedResults.filter((result) => result.truncated)).toHaveLength(1);
    expect(parsedResults[1]!.parentPath).toBeNull();
    expect(parsedResults[2]!.path).toBe(HOST_DRIVE_LIST_PATH);

    expect(parseWslUncPath(object(entries[3]!.request, "localhost UNC").path as string)).toEqual({
      distro: "Ubuntu-24.04",
      linuxPath: "/home/zoë/项目",
    });
    expect(parseWslUncPath(object(entries[4]!.request, "dollar UNC").path as string)).toEqual({
      distro: "Debian",
      linuxPath: "/home/dev/repo",
    });
  });

  it("parses setup detection requests and omitted versus concrete results", () => {
    const fixture = readFixture<{ cases: unknown }>("project-detect-setup-script.json");
    const entries = cases(fixture.cases, "detect setup cases");
    expect(entries.map((entry) => entry.id)).toEqual(["omitted-result", "concrete-result"]);
    const contract = procedure("detectSetupScript");
    for (const entry of entries) {
      expect(contract.requestSchema.parse(entry.request), `${entry.id} request`).toEqual(
        entry.request,
      );
      expect(contract.resultSchema.parse(entry.result), `${entry.id} result`).toEqual(entry.result);
    }
    expect(Object.hasOwn(object(entries[0]!.result, "omitted setup result"), "setupScript")).toBe(
      false,
    );
    expect(object(entries[1]!.result, "concrete setup result").setupScript).toBe("pnpm install");
  });

  it("uses result wrappers for JSON procedures and exact empty objects for void procedures", () => {
    const fixture = readFixture<{ accepted: unknown; rejected: unknown }>(
      "project-procedure-envelopes.json",
    );
    const accepted = cases(fixture.accepted, "accepted envelopes");
    const rejected = cases(fixture.rejected, "rejected envelopes");
    expect({ accepted: accepted.length, rejected: rejected.length }).toEqual({
      accepted: 2,
      rejected: 1,
    });

    for (const entry of accepted) {
      const contract = procedure(String(entry.procedure));
      const envelope = remoteProcedureCallEnvelopeSchema(contract.resultSchema);
      expect(envelope.parse(entry.envelope)).toEqual(entry.envelope);
    }
    expect(procedure(String(accepted[0]!.procedure)).resultKind).toBe("json");
    expect(procedure(String(accepted[1]!.procedure)).resultKind).toBe("omitted");
    expect(accepted[1]!.envelope).toEqual({});

    const invalid = rejected[0]!;
    const invalidContract = procedure(String(invalid.procedure));
    expect(
      remoteProcedureCallEnvelopeSchema(invalidContract.resultSchema).safeParse(invalid.envelope)
        .success,
    ).toBe(false);
  });

  it("matches exact route paths and keeps path-injected ids out of JSON bodies", () => {
    const fixture = readFixture<{ cases: unknown }>("project-route-projections.json");
    const entries = cases(fixture.cases, "route projections");
    expect(entries.map((entry) => entry.id)).toEqual([
      "project-command",
      "project-settings",
      "project-notes-read",
      "project-notes-write",
      "procedure-detect-setup-script",
    ]);

    for (const entry of entries) {
      const contract = route(String(entry.routeId));
      const pathParams = object(entry.pathParams, `${entry.id}.pathParams`);
      expect({ method: contract.method, path: contract.path }).toEqual({
        method: entry.method,
        path: entry.pathTemplate,
      });
      expect(resolvePath(contract.path, pathParams)).toBe(entry.resolvedPath);
      if (contract.request.pathSchema) {
        deepStrictEqual(contract.request.pathSchema.parse(pathParams), pathParams);
      } else {
        deepStrictEqual(pathParams, {});
      }

      const hasBody = Object.hasOwn(entry, "body");
      expect(hasBody).toBe(contract.request.bodyKind === "json");
      if (!hasBody) continue;
      const body = object(entry.body, `${entry.id}.body`);
      if (!contract.request.jsonSchema) throw new Error(`${entry.id} JSON schema is missing`);
      contract.request.jsonSchema.parse(body);
      for (const pathId of Object.keys(pathParams)) {
        if (Object.hasOwn(body, pathId)) {
          throw new Error(`${entry.id} duplicates ${pathId} in its body`);
        }
      }
      if (entry.routeId === "procedure-call") {
        const procedureContract = procedure(String(body.procedure));
        deepStrictEqual(procedureContract.requestSchema.parse(body.payload), body.payload);
      }
    }
  });
});
