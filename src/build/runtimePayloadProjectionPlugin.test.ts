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
      const result = await build({
        config: false,
        cwd: root,
        entry: [entry],
        format: "esm",
        write: false,
        dts: false,
        logLevel: "silent",
        plugins: [runtimePayloadProjectionPlugin(root)],
      });
      const chunk = result
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

  it("loads in Vite and refreshes when provider projection leaves appear or disappear", async () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-projection-vite-"));
    const agents = join(root, "src/supervisor/agents");
    const alpha = join(agents, "alpha");
    mkdirSync(alpha, { recursive: true });
    writeFileSync(join(alpha, "index.ts"), 'throw new Error("Adapter must never load");');
    writeFileSync(
      join(alpha, "persistedRuntimePayload.ts"),
      'export const runtimePayloadProjection = {formatOwnerKey:"alpha"};',
    );
    const server = await createServer({
      configFile: false,
      root,
      plugins: [runtimePayloadProjectionVitePlugin(root)],
      server: { middlewareMode: true },
      optimizeDeps: { noDiscovery: true },
      logLevel: "silent",
    });
    const owners = async () => {
      const module = await server.ssrLoadModule(RUNTIME_PAYLOAD_PROJECTION_MODULE);
      return module.runtimePayloadProjections.map(
        (p: { formatOwnerKey: string }) => p.formatOwnerKey,
      );
    };
    try {
      expect(await owners()).toEqual(["alpha"]);
      const directory = createRuntimePayloadProjectionSource(root).directory;
      await expect.poll(() => server.watcher.getWatched()[directory]).toContain("alpha");
      const beta = join(agents, "beta");
      mkdirSync(beta);
      writeFileSync(join(beta, "index.ts"), 'throw new Error("Adapter must never load");');
      const path = join(beta, "persistedRuntimePayload.ts");
      writeFileSync(path, 'export const runtimePayloadProjection = {formatOwnerKey:"beta"};');
      await expect.poll(owners, { timeout: 5_000 }).toEqual(["alpha", "beta"]);
      unlinkSync(path);
      await expect.poll(owners, { timeout: 5_000 }).toEqual(["alpha"]);
    } finally {
      await server.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
