import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanModuleIds, scanRuntimeExternals } from "../../scripts/runtime-externals.mjs";

describe("scanModuleIds", () => {
  it("finds CommonJS, dynamic, static, and minified-template module specifiers", () => {
    const code = `
      const commonJs = require("common-js/subpath");
      const dynamic = import("@scope/dynamic");
      const minifiedDynamic = import(\`minified-dynamic/subpath\`);
      import { value } from "static-import";
      import "side-effect-import";
      export { value } from "export-from";
      export * from "@scope/export-star";
    `;

    expect(scanModuleIds(code)).toEqual([
      "common-js/subpath",
      "@scope/dynamic",
      "minified-dynamic/subpath",
      "static-import",
      "side-effect-import",
      "export-from",
      "@scope/export-star",
    ]);
  });

  it("ignores method calls, source text, and interpolated templates", () => {
    const code = `
      ObjC.import("stdlib");
      loader.require("loader-only");
      const sourceExample = 'require("example-only")';
      const templateExample = \`import("also-example-only")\`;
      const dynamicName = import(\`package/\${suffix}\`);
    `;

    expect(scanModuleIds(code)).toEqual([]);
  });

  it("does not stage debug's optional supports-color feature probe", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "poracode-runtime-externals-"));
    try {
      const outputDir = join(repoRoot, "dist", "main");
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(
        join(outputDir, "main.cjs"),
        'try { require("supports-color"); } catch {} require("required-runtime");',
      );

      expect(scanRuntimeExternals(repoRoot)).toEqual(["required-runtime"]);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
