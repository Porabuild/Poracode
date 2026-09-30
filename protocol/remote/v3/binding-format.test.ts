import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  REMOTE_CONTRACT_INVENTORY,
  REMOTE_CONTRACT_REGISTRY,
} from "../../../src/shared/remote/contract/registry";
import {
  REMOTE_BINDING_FORMAT_VERSION,
  REMOTE_GENERATOR_VERSION,
} from "../../../src/shared/remote/contract/versions";
import { checkRemoteV3Generated } from "../../../src/shared/remote/contract/writeGenerated";
import { REMOTE_PROCEDURE_SPECS } from "../../../src/shared/remote/procedures";
import { ipcProcedureMap } from "../../../src/shared/ipc/procedureMap";

const contractDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(contractDirectory, "../../..");

describe("remote v3 binding-format artifacts", () => {
  it("keeps generated IR/schema/inventory current", () => {
    expect(REMOTE_BINDING_FORMAT_VERSION).toBe(2);
    expect(REMOTE_GENERATOR_VERSION).toBe(3);
    expect(checkRemoteV3Generated(repositoryRoot)).toEqual([]);
    const inventory = JSON.parse(
      readFileSync(join(contractDirectory, "generated/inventory.json"), "utf8"),
    ) as {
      inventory: typeof REMOTE_CONTRACT_INVENTORY;
      sourceHash: string;
      manifestHash: string;
      bindingFormatVersion: number;
      generatorVersion: number;
    };
    expect(inventory.inventory).toEqual(REMOTE_CONTRACT_INVENTORY);
    expect(inventory.bindingFormatVersion).toBe(2);
    expect(inventory.generatorVersion).toBe(3);
    expect(inventory.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(inventory.manifestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("registry route and procedure names stay aligned with ipc and specs", () => {
    for (const procedure of REMOTE_CONTRACT_REGISTRY.procedures) {
      expect(procedure.name in REMOTE_PROCEDURE_SPECS).toBe(true);
      expect(procedure.name in ipcProcedureMap).toBe(true);
    }
  });
});
