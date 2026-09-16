import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUNDLED_PLUGINS_DIR_ENV,
  BUNDLED_SKILLS_DIR_ENV,
  ServerLayoutError,
  WSL_HELPERS_DIR_ENV,
  resolveOptionalServerInstallLayout,
  resolveServerInstallLayout,
  resolveServerResourceDirs,
} from "./serverInstallLayout";

function makePrefixShape(options: {
  withSkills?: boolean;
  withPlugins?: boolean;
  withWslHelpers?: boolean;
}): { root: string; libDir: string } {
  const root = mkdtempSync(join(tmpdir(), "poracode-prefix-"));
  const libDir = join(root, "lib");
  mkdirSync(libDir, { recursive: true });
  mkdirSync(join(root, "resources"), { recursive: true });
  if (options.withWslHelpers !== false) mkdirSync(join(root, "resources", "wsl-helpers"));
  if (options.withSkills) mkdirSync(join(root, "resources", "skills"));
  if (options.withPlugins) mkdirSync(join(root, "resources", "plugins"));
  writeFileSync(join(root, "package.json"), "{}\n", "utf8");
  return { root, libDir };
}

function makeCheckoutShape(): { root: string; libDir: string } {
  const root = mkdtempSync(join(tmpdir(), "poracode-checkout-"));
  const libDir = join(root, "dist", "main");
  mkdirSync(libDir, { recursive: true });
  mkdirSync(join(root, "resources"), { recursive: true });
  writeFileSync(join(root, "package.json"), "{}\n", "utf8");
  return { root, libDir };
}

describe("resolveServerInstallLayout", () => {
  it("resolves the documented install prefix shape", () => {
    const { root, libDir } = makePrefixShape({});
    const layout = resolveServerInstallLayout({ libDir });
    expect(layout).toMatchObject({
      layoutVersion: 1,
      kind: "prefix",
      root,
      libDir,
      resourcesDir: join(root, "resources"),
    });
  });

  it("resolves the repository checkout shape", () => {
    const { root, libDir } = makeCheckoutShape();
    const layout = resolveServerInstallLayout({ libDir });
    expect(layout).toMatchObject({ layoutVersion: 1, kind: "checkout", root });
  });

  it("refuses a bundle relocated outside any supported shape", () => {
    const stray = mkdtempSync(join(tmpdir(), "poracode-stray-"));
    expect(() => resolveServerInstallLayout({ libDir: stray })).toThrow(ServerLayoutError);
    expect(() => resolveServerInstallLayout({ libDir: stray })).toThrow(/Supported layouts/u);
  });

  it("refuses a prefix without its resources directory", () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-prefix-"));
    const libDir = join(root, "lib");
    mkdirSync(libDir, { recursive: true });
    writeFileSync(join(root, "package.json"), "{}\n", "utf8");
    expect(() => resolveServerInstallLayout({ libDir })).toThrow(ServerLayoutError);
  });

  it("offers a non-throwing variant for informational callers", () => {
    const stray = mkdtempSync(join(tmpdir(), "poracode-stray-"));
    expect(resolveOptionalServerInstallLayout({ libDir: stray })).toBeUndefined();
    const { libDir } = makePrefixShape({});
    expect(resolveOptionalServerInstallLayout({ libDir })?.kind).toBe("prefix");
  });
});

describe("resolveServerResourceDirs", () => {
  it("resolves required and optional assets from the prefix layout", () => {
    const { libDir } = makePrefixShape({ withSkills: true, withPlugins: true });
    const dirs = resolveServerResourceDirs({ layout: resolveServerInstallLayout({ libDir }) });
    expect(dirs.wslHelpersDir).toBe(join(libDir, "..", "resources", "wsl-helpers"));
    expect(dirs.bundledSkillsDir).toBe(join(libDir, "..", "resources", "skills"));
    expect(dirs.bundledPluginsDir).toBe(join(libDir, "..", "resources", "plugins"));
  });

  it("reports optional assets as absent when the layout omits them", () => {
    const { libDir } = makePrefixShape({});
    const dirs = resolveServerResourceDirs({ layout: resolveServerInstallLayout({ libDir }) });
    expect(dirs.wslHelpersDir).toContain("wsl-helpers");
    expect(dirs.bundledSkillsDir).toBeUndefined();
    expect(dirs.bundledPluginsDir).toBeUndefined();
  });

  it("fails loudly when the required asset is missing from a resolved layout", () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-prefix-"));
    const libDir = join(root, "lib");
    mkdirSync(libDir, { recursive: true });
    mkdirSync(join(root, "resources"), { recursive: true });
    writeFileSync(join(root, "package.json"), "{}\n", "utf8");
    expect(() =>
      resolveServerResourceDirs({ layout: resolveServerInstallLayout({ libDir }) }),
    ).toThrow(/wsl-helpers/u);
  });

  it("honors explicit declarations over the layout and validates them", () => {
    const { libDir } = makePrefixShape({});
    const declared = mkdtempSync(join(tmpdir(), "poracode-declared-"));
    const dirs = resolveServerResourceDirs({
      env: {
        [WSL_HELPERS_DIR_ENV]: declared,
        [BUNDLED_SKILLS_DIR_ENV]: declared,
        [BUNDLED_PLUGINS_DIR_ENV]: declared,
      },
      layout: resolveServerInstallLayout({ libDir }),
    });
    expect(dirs).toEqual({
      wslHelpersDir: declared,
      bundledSkillsDir: declared,
      bundledPluginsDir: declared,
    });
    expect(() =>
      resolveServerResourceDirs({
        env: { [WSL_HELPERS_DIR_ENV]: join(declared, "missing") },
      }),
    ).toThrow(/points at a directory that does not exist/u);
  });

  it("rejects a required missing asset when no layout and no declaration exist", () => {
    expect(() => resolveServerResourceDirs({ env: {} })).toThrow(
      /wsl-helpers assets are required/u,
    );
  });

  it("never resolves a relative declared directory", () => {
    expect(() =>
      resolveServerResourceDirs({ env: { [WSL_HELPERS_DIR_ENV]: "resources/wsl-helpers" } }),
    ).toThrow(/must be an absolute path/u);
  });
});
