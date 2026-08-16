import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ipcProcedureMap } from "../../ipc/procedureMap";
import { omittedResultSchema } from "../../ipc/resultCodec";
import { REMOTE_PROCEDURE_SPECS } from "../procedures";
import { REMOTE_HTTP_ROUTES } from "./routes";
import { BLOCKED_PROCEDURE_RESULTS, REMOTE_PROCEDURE_CONTRACTS } from "./procedures";
import { REMOTE_CONTRACT_INVENTORY, REMOTE_CONTRACT_REGISTRY } from "./registry";

const manifest = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../../protocol/remote/v3/manifest.json"),
    "utf8",
  ),
) as {
  httpRoutes: Array<{ id: string; method: string; path: string; auth: string; scopes: string[] }>;
  procedures: Array<{ name: string; scope: string; owner: string; timeout?: string }>;
};

describe("remote contract registry", () => {
  it("covers exactly the 56 routes and 100 procedures with no duplicates", () => {
    expect(REMOTE_HTTP_ROUTES).toHaveLength(56);
    expect(REMOTE_PROCEDURE_CONTRACTS).toHaveLength(100);
    expect(new Set(REMOTE_HTTP_ROUTES.map((route) => route.id)).size).toBe(56);
    expect(new Set(REMOTE_HTTP_ROUTES.map((route) => `${route.method} ${route.path}`)).size).toBe(
      56,
    );
    expect(new Set(REMOTE_PROCEDURE_CONTRACTS.map((procedure) => procedure.name)).size).toBe(100);
    expect(REMOTE_CONTRACT_INVENTORY.routes).toBe(56);
    expect(REMOTE_CONTRACT_INVENTORY.procedures).toBe(100);
    expect(REMOTE_CONTRACT_INVENTORY.voidProcedureResults).toBe(36);
    expect(REMOTE_CONTRACT_INVENTORY.jsonProcedureResults).toBe(64);
    expect(REMOTE_CONTRACT_INVENTORY.blockedProcedureResults).toEqual([]);
    expect(BLOCKED_PROCEDURE_RESULTS).toEqual([]);
  });

  it("matches manifest, REMOTE_PROCEDURE_SPECS, and ipcProcedureMap", () => {
    expect(REMOTE_HTTP_ROUTES.map((route) => route.id)).toEqual(
      manifest.httpRoutes.map((route) => route.id),
    );
    expect(
      REMOTE_HTTP_ROUTES.map((route) => ({
        id: route.id,
        method: route.method,
        path: route.path,
        auth: route.auth,
        scopes: [...route.scopes],
      })),
    ).toEqual(
      manifest.httpRoutes.map((route) => ({
        id: route.id,
        method: route.method,
        path: route.path,
        auth: route.auth,
        scopes: route.scopes,
      })),
    );

    const specNames = Object.keys(REMOTE_PROCEDURE_SPECS);
    expect(REMOTE_PROCEDURE_CONTRACTS.map((procedure) => procedure.name)).toEqual(specNames);
    expect(manifest.procedures.map((procedure) => procedure.name)).toEqual(specNames);

    for (const procedure of REMOTE_PROCEDURE_CONTRACTS) {
      const spec = REMOTE_PROCEDURE_SPECS[procedure.name as keyof typeof REMOTE_PROCEDURE_SPECS];
      expect(procedure.scope).toBe(spec.scope);
      expect(procedure.owner).toBe(spec.owner);
      expect(procedure.timeout).toBe("timeout" in spec ? spec.timeout : undefined);
      expect(ipcProcedureMap[procedure.name as keyof typeof ipcProcedureMap]).toBeDefined();
      expect(procedure.requestSchema).toBe(
        ipcProcedureMap[procedure.name as keyof typeof ipcProcedureMap].payloadSchema,
      );
      expect(procedure.resultSchema).toBeDefined();
    }
  });

  it("uses the shared omitted codec for every void result and a real schema otherwise", () => {
    const voidNames = REMOTE_PROCEDURE_CONTRACTS.filter(
      (procedure) => procedure.resultKind === "omitted",
    ).map((procedure) => procedure.name);
    expect(voidNames).toHaveLength(36);
    const omitted = REMOTE_PROCEDURE_CONTRACTS.filter(
      (procedure) => procedure.resultKind === "omitted",
    );
    const json = REMOTE_PROCEDURE_CONTRACTS.filter((procedure) => procedure.resultKind === "json");
    expect(omitted.map((procedure) => procedure.resultSchema)).toEqual(
      omitted.map(() => omittedResultSchema),
    );
    expect(omitted.map((procedure) => procedure.resultSchema.safeParse(undefined).success)).toEqual(
      omitted.map(() => true),
    );
    expect(omitted.map((procedure) => procedure.resultSchema.safeParse(null).success)).toEqual(
      omitted.map(() => false),
    );
    expect(json.every((procedure) => procedure.resultSchema !== omittedResultSchema)).toBe(true);
    expect(
      REMOTE_CONTRACT_REGISTRY.routes.find((route) => route.id === "procedure-call"),
    ).toMatchObject({
      response: { wireKind: "procedure-result" },
    });
  });
});
