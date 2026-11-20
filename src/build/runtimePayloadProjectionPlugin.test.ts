import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "tsdown";
import { describe, expect, it } from "vitest";
import { runtimePayloadProjectionPlugin } from "./runtimePayloadProjectionPlugin";
import { createServer } from "vite";
import { runtimePayloadProjectionVitePlugin } from "./runtimePayloadProjectionVitePlugin";
import {
  RUNTIME_PAYLOAD_PROJECTION_MODULE,
  createRuntimePayloadProjectionSource,
  TOOL_PRESENTATION_ADAPTER_MODULE,
} from "./runtimePayloadProjectionSource.mjs";

describe("runtime payload projection build composition", () => {
  it("bundles discovered pure leaves without loading adapters or scanning at runtime", async () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-projection-build-"));
    try {
      const agents = join(root, "src/supervisor/agents");
      for (const name of ["zeta", "alpha"]) {
        const dir = join(agents, name);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "index.ts"), 'throw new Error("Adapter must never load");');
        writeFileSync(
          join(dir, "persistedRuntimePayload.ts"),
          `export const runtimePayloadProjection = {formatOwnerKey:${JSON.stringify(name)}};`,
        );
      }
      const entry = join(root, "entry.ts");
      writeFileSync(
        entry,
        'export {runtimePayloadProjections} from "poracode:runtime-payload-projections";',
      );
      const { bundles } = await build({
        config: false,
        cwd: root,
        entry: [entry],
        format: "esm",
        write: false,
        dts: false,
        logLevel: "silent",
        plugins: [runtimePayloadProjectionPlugin(root)],
      });
      const chunk = bundles
        .flatMap((bundle) => bundle.chunks)
        .find((output) => output.type === "chunk");
      expect(chunk?.code).toContain('"alpha"');
      expect(chunk?.code).toContain('"zeta"');
      expect(chunk?.code).not.toContain("Adapter must never load");
      expect(chunk?.code).not.toContain("readdirSync");
      expect(chunk?.code).not.toMatch(/from ["']poracode:runtime-payload-projections/);
      expect(chunk!.code.indexOf('"alpha"')).toBeLessThan(chunk!.code.indexOf('"zeta"'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    {
      moduleId: RUNTIME_PAYLOAD_PROJECTION_MODULE,
      filename: "persistedRuntimePayload.ts",
      exported: "runtimePayloadProjection",
      collection: "runtimePayloadProjections",
    },
    {
      moduleId: TOOL_PRESENTATION_ADAPTER_MODULE,
      filename: "toolPresentation.ts",
      exported: "toolPresentationAdapter",
      collection: "toolPresentationAdapters",
    },
  ])(
    "loads $filename in Vite and refreshes when leaves appear or disappear",
    async ({ moduleId, filename, exported, collection }) => {
      const root = mkdtempSync(join(tmpdir(), "poracode-projection-vite-"));
      const agents = join(root, "src/supervisor/agents");
      const alpha = join(agents, "alpha");
      mkdirSync(alpha, { recursive: true });
      writeFileSync(join(alpha, "index.ts"), 'throw new Error("Adapter must never load");');
      writeFileSync(join(alpha, filename), `export const ${exported} = {formatOwnerKey:"alpha"};`);
      const server = await createServer({
        configFile: false,
        root,
        plugins: [runtimePayloadProjectionVitePlugin(root)],
        server: { middlewareMode: true },
        optimizeDeps: { noDiscovery: true },
        logLevel: "silent",
      });
      const owners = async () => {
        const module = await server.ssrLoadModule(moduleId);
        return module[collection].map((p: { formatOwnerKey: string }) => p.formatOwnerKey);
      };
      try {
        expect(await owners()).toEqual(["alpha"]);
        const directory = createRuntimePayloadProjectionSource(root).directory;
        await expect.poll(() => server.watcher.getWatched()[directory]).toContain("alpha");
        const beta = join(agents, "beta");
        mkdirSync(beta);
        writeFileSync(join(beta, "index.ts"), 'throw new Error("Adapter must never load");');
        const path = join(beta, filename);
        writeFileSync(path, `export const ${exported} = {formatOwnerKey:"beta"};`);
        await expect.poll(owners, { timeout: 5_000 }).toEqual(["alpha", "beta"]);
        unlinkSync(path);
        await expect.poll(owners, { timeout: 5_000 }).toEqual(["alpha"]);
      } finally {
        await server.close();
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
