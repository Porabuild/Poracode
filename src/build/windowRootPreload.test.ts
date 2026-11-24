import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { build, type Rolldown } from "vite";
import { describe, expect, it } from "vitest";

/**
 * The quick-composer window loads only its own root so its renderer never pays
 * for the app shell. That only holds if the production build preloads each root
 * with its own dependency list: the bundler wraps the conditional that contains
 * a dynamic import, so two roots that share one expression get one shared list
 * and the quick composer preloads the app shell it is bypassing. The real
 * `windowRoot.ts` is built here (minified, like the renderer build) against stub
 * roots that each own a private dependency chunk.
 */
describe("window root preload isolation", () => {
  it("preloads the quick-composer root without the app shell's chunks", async () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-window-root-preload-"));
    const stub = (name: string, source: string) => {
      const file = join(root, name);
      writeFileSync(file, source);
      return file;
    };
    try {
      const appShell = stub(
        "AppShellStub.tsx",
        'import { shellOnly } from "./shellOnlyDep"; export function App() { return shellOnly; }',
      );
      const quickComposerRoot = stub(
        "QuickComposerRootStub.tsx",
        'import { quickComposerOnly } from "./quickComposerOnlyDep"; export function App() { return quickComposerOnly; }',
      );
      stub("shellOnlyDep.ts", 'export function shellOnly() { return "shell"; }');
      stub(
        "quickComposerOnlyDep.ts",
        'export function quickComposerOnly() { return "quick-composer"; }',
      );
      // Like `main.tsx`: the window kind is read at runtime, not folded.
      const loaderEntry = stub(
        "entry.ts",
        `import { loadWindowRoot } from ${JSON.stringify(join(import.meta.dirname, "..", "renderer", "windowRoot.ts"))};
void loadWindowRoot((globalThis as { windowKind?: string }).windowKind ?? "main");
`,
      );
      const result = await build({
        configFile: false,
        root: join(import.meta.dirname, "..", ".."),
        logLevel: "silent",
        resolve: {
          alias: [
            { find: /^\.\/app$/, replacement: appShell },
            {
              find: /^\.\/windowApps\/QuickComposerWindowRoot$/,
              replacement: quickComposerRoot,
            },
          ],
        },
        build: {
          write: false,
          minify: true,
          rolldownOptions: {
            input: loaderEntry,
            // Give each private dependency its own chunk, as the renderer build
            // does for the shared modules the app shell pulls in.
            output: {
              codeSplitting: {
                groups: [
                  { name: "shell-only", test: /shellOnlyDep/ },
                  { name: "quick-composer-only", test: /quickComposerOnlyDep/ },
                ],
              },
            },
          },
        },
      });
      // The preload table is injected last, so read the final emitted chunks.
      const emitted = (Array.isArray(result) ? result : "output" in result ? [result] : [])
        .flatMap((output) => output.output)
        .filter((item): item is Rolldown.OutputChunk => item.type === "chunk");
      const chunkOf = (moduleFile: string) => {
        const chunk = emitted.find((candidate) =>
          Object.keys(candidate.modules).some((id) => id.endsWith(`/${moduleFile}`)),
        );
        if (!chunk) throw new Error(`no chunk was emitted for ${moduleFile}`);
        return basename(chunk.fileName);
      };
      const loader = emitted.find((chunk) => chunk.isEntry);
      if (!loader) throw new Error("the window root loader chunk was not emitted");

      // Each preload call indexes its dependency list into one table of chunk URLs.
      const tableSource = loader.code.match(/m\.f=\[([^\]]*)\]/)?.[1];
      if (!tableSource) throw new Error("the loader emitted no module preload table");
      const table = [...tableSource.matchAll(/"([^"]+)"/g)].map((match) => basename(match[1]!));
      const preloadedFor = (rootChunk: string) =>
        [
          ...loader.code.matchAll(
            /import\(`\.\/([^`]+)`\)[\s\S]{0,80}?__vite__mapDeps\(\[([\d,]*)\]\)/g,
          ),
        ]
          .filter((match) => match[1] === rootChunk)
          .flatMap((match) =>
            match[2]!
              .split(",")
              .filter(Boolean)
              .map((index) => table[Number(index)]),
          )
          .filter((entry): entry is string => entry !== undefined);

      const quickComposer = chunkOf("QuickComposerRootStub.tsx");
      const preloaded = preloadedFor(quickComposer);
      // The shell's root and its private chunks are what the window bypasses.
      expect(preloaded).not.toContain(chunkOf("AppShellStub.tsx"));
      expect(preloaded).not.toContain(chunkOf("shellOnlyDep.ts"));
      expect(preloaded).toContain(quickComposer);
      expect(preloaded).toContain(chunkOf("quickComposerOnlyDep.ts"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
