import path from "node:path";
import { fileURLToPath } from "node:url";

const batchSize = 40;
const repository = path.dirname(fileURLToPath(import.meta.url));
const repoPath = (filename) =>
  path
    .relative(repository, path.isAbsolute(filename) ? filename : path.resolve(repository, filename))
    .replaceAll("\\", "/");
const ignored = (filename) => {
  const file = repoPath(filename);
  return ["tui/opencode", "tui/node_modules", "tui/dist"].some(
    (directory) => file === directory || file.startsWith(`${directory}/`),
  );
};
const tuiSource = (filename) => {
  const file = repoPath(filename);
  return file === "tui/src" || file.startsWith("tui/src/");
};
const lintable = (filenames) => filenames.filter((filename) => !ignored(filename));

export default {
  "*.{js,jsx,ts,tsx,mjs,cjs}": (filenames) => {
    const files = lintable(filenames);
    const tuiFiles = files.filter(tuiSource);
    const rootFiles = files.filter((filename) => !tuiSource(filename));
    const commands = [];
    for (let i = 0; i < rootFiles.length; i += batchSize) {
      const batch = rootFiles
        .slice(i, i + batchSize)
        .map((f) => `"${f}"`)
        .join(" ");
      // The pinned preview uses this context to bypass package-script shadowing.
      commands.push(
        `cross-env npm_lifecycle_event=lint bun lint --type-aware --fix --deny-warnings ${batch}`,
      );
      commands.push(`cross-env npm_lifecycle_event=fmt bun fmt ${batch}`);
    }
    for (let i = 0; i < tuiFiles.length; i += batchSize) {
      const batch = tuiFiles
        .slice(i, i + batchSize)
        .map((f) => `"${f}"`)
        .join(" ");
      commands.push(`cross-env npm_lifecycle_event=lint bun lint --fix --deny-warnings ${batch}`);
      commands.push(`cross-env npm_lifecycle_event=fmt bun fmt ${batch}`);
    }
    return commands;
  },
  "*.{json,jsonc,css,md,html,yml,toml}": (filenames) => {
    const files = lintable(filenames);
    const commands = [];
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files
        .slice(i, i + batchSize)
        .map((f) => `"${f}"`)
        .join(" ");
      commands.push(`cross-env npm_lifecycle_event=fmt bun fmt ${batch}`);
    }
    return commands;
  },
};
