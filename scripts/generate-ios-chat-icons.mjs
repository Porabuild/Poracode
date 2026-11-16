// Shares the PWA's Lucide glyphs with the native transcript. Run with --check
// after updating lucide-react to verify the committed template SVG assets.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadLucideIconNodes } from "./lib/lucide-icon-nodes.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const lucideRoot = dirname(require.resolve("lucide-react/package.json"));
const assets = join(root, "ios/App/App/Assets.xcassets");
const icons = {
  ChatCopy: "copy",
  ChatTruncate: "list-x",
  ChatFork: "git-fork",
  ChatGitBranch: "git-branch",
  ChatView: "eye",
  ChatSearch: "search-code",
  ChatEdit: "pencil",
  ChatCommand: "terminal",
  ChatTool: "wrench",
  ChatMcp: "plug",
  ChatThought: "brain",
  ChatArrowDown: "arrow-down",
};

function output(path, content) {
  if (process.argv.includes("--check")) {
    if (readFileSync(path, "utf8") !== content) throw new Error(`Stale iOS icon: ${path}`);
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

for (const [asset, name] of Object.entries(icons)) {
  const elements = (await loadLucideIconNodes(lucideRoot, name)).map(([tag, properties]) => {
    const attrs = Object.entries(properties)
      .filter(([key]) => key !== "key")
      .map(([key, value]) => `${key}="${String(value).replaceAll('"', "&quot;")}"`)
      .join(" ");
    return `<${tag} ${attrs}/>`;
  });
  const filename = `${name}.svg`;
  output(
    join(assets, `${asset}.imageset`, filename),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${elements.join("")}</svg>\n`,
  );
  output(
    join(assets, `${asset}.imageset`, "Contents.json"),
    `${JSON.stringify({ images: [{ filename, idiom: "universal" }], info: { author: "xcode", version: 1 }, properties: { "preserves-vector-representation": true, "template-rendering-intent": "template" } }, null, 2)}\n`,
  );
}
output(
  join(assets, "LucideLicense.dataset", "LICENSE.txt"),
  readFileSync(join(lucideRoot, "LICENSE"), "utf8"),
);
output(
  join(assets, "LucideLicense.dataset", "Contents.json"),
  `${JSON.stringify({ data: [{ filename: "LICENSE.txt", idiom: "universal" }], info: { author: "xcode", version: 1 } }, null, 2)}\n`,
);
console.log(
  `iOS chat icons ${process.argv.includes("--check") ? "current" : "generated"}: ${Object.keys(icons).length}`,
);
