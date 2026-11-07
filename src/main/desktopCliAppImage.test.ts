import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appImageCliLauncher, selectedDesktopAppImage } from "@/shared/desktopAppImage";

describe.skipIf(process.platform === "win32")("durable AppImage CLI launcher", () => {
  let root: string;
  beforeEach(() => {
    mkdirSync(resolve("tmp"), { recursive: true });
    root = mkdtempSync(resolve("tmp/appimage shell's fixture-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("ignores an AppImage terminal's inherited identity when this app is installed separately", () => {
    const mount = join(root, "terminal mount");
    const installed = join(root, "installed Poracode");
    for (const directory of [mount, installed]) {
      mkdirSync(join(directory, "resources"), { recursive: true });
      writeFileSync(join(directory, "poracode-desktop"), "selected executable");
    }
    const image = join(root, "Poracode.AppImage");
    writeFileSync(image, "image");
    const input = {
      platform: "linux" as const,
      resourcesDir: join(installed, "resources"),
      executablePath: join(installed, "poracode-desktop"),
      env: { APPIMAGE: image, APPDIR: mount },
    };
    expect(selectedDesktopAppImage(input)).toBeUndefined();
    expect(
      selectedDesktopAppImage({
        ...input,
        resourcesDir: join(mount, "resources"),
        executablePath: join(mount, "poracode-desktop"),
      }),
    ).toBe(image);
  });

  it("selects each fresh mount, forwards arguments literally, and clears Node injection", () => {
    const image = join(root, "Poracode's $(echo unsafe).AppImage");
    const launcher = join(root, "poracode-next");
    writeFileSync(launcher, appImageCliLauncher(image), { mode: 0o755 });
    const word = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`;
    for (const mount of ["first mount", "updated mount"]) {
      const appDir = join(root, mount);
      const cliDir = join(appDir, "resources", "desktop-cli");
      mkdirSync(cliDir, { recursive: true });
      writeFileSync(
        join(cliDir, "bootstrap.mjs"),
        "console.log(JSON.stringify({argv: process.argv.slice(2), entrypoint: process.argv[1], appDir: process.env.APPDIR, nodeOptions: process.env.NODE_OPTIONS, nodePath: process.env.NODE_PATH, electron: process.env.ELECTRON_RUN_AS_NODE, inheritedHelpers: process.env.PORACODE_WSL_HELPERS_DIR ?? null, customSkills: process.env.PORACODE_BUNDLED_SKILLS_DIR}));",
      );
      // A native AppImage mounts itself and forwards argv through AppRun to
      // Electron. Model that boundary using this Node executable, without FUSE.
      writeFileSync(
        image,
        `#!/bin/sh\nexport APPDIR=${word(appDir)}\nexec ${word(process.execPath)} "$@"\n`,
        { mode: 0o755 },
      );
      const args = ["-p", "two words", "$(echo unsafe)", "--", "tail"];
      const output = execFileSync(launcher, args, {
        encoding: "utf8",
        env: {
          PATH: "/usr/bin:/bin",
          NODE_OPTIONS: "--invalid-node-option",
          NODE_PATH: "/foreign",
          APPDIR: root,
          PORACODE_WSL_HELPERS_DIR: join(root, "resources", "wsl-helpers"),
          PORACODE_BUNDLED_SKILLS_DIR: "/explicit/custom-skills",
        },
      });
      expect(JSON.parse(output)).toEqual({
        argv: args,
        entrypoint: join(cliDir, "bootstrap.mjs"),
        appDir,
        nodeOptions: "",
        nodePath: "",
        electron: "1",
        inheritedHelpers: null,
        customSkills: "/explicit/custom-skills",
      });
    }
  });
});
