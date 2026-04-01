/**
 * VS Code icon theme resolver.
 *
 * Reads the material-icon-theme manifest (standard VS Code icon theme JSON)
 * and resolves filenames/folder names to icon asset URLs loaded via Vite.
 *
 * Architecture: any VS Code icon theme that follows the standard format
 * (iconDefinitions, fileExtensions, fileNames, folderNames, languageIds)
 * can be swapped in by changing the manifest import and icon glob path.
 */

// ── Load the manifest ───────────────────────────────────────
import manifest from "material-icon-theme/dist/material-icons.json";

// ── Load icon URLs via Vite glob (lazy, on-demand by the browser) ───
// Using ?url so each SVG becomes a separate asset file served on demand
// instead of inlining all 1221 SVGs as strings into the JS bundle.
const iconUrlModules = import.meta.glob("~file-icons/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

// Build lookup: icon name (e.g. "typescript") → asset URL
const iconUrlMap = new Map<string, string>();
for (const [path, url] of Object.entries(iconUrlModules)) {
  const match = path.match(/\/([^/]+)\.svg$/);
  if (match) {
    iconUrlMap.set(match[1]!, url);
  }
}

// ── Manifest tables ─────────────────────────────────────────

const iconDefinitions = manifest.iconDefinitions as Record<string, { iconPath: string }>;
const fileExtensions = manifest.fileExtensions as Record<string, string>;
const fileNames = manifest.fileNames as Record<string, string>;
const folderNames = manifest.folderNames as Record<string, string>;
const languageIds = manifest.languageIds as Record<string, string>;
const defaultFileIcon = manifest.file as string;
const defaultFolderIcon = manifest.folder as string;

// ── Extension → VS Code languageId ──────────────────────────
// VS Code icon themes use `languageIds` for common languages (ts, js, py, etc.)
// because VS Code registers these extensions via its built-in language contributions
// rather than listing them in `fileExtensions`. This bridge table mirrors VS Code's
// built-in extension→languageId mappings. These IDs are extremely stable.
const extToLanguageId: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescriptreact",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascriptreact",
  py: "python",
  pyw: "python",
  pyi: "python",
  rs: "rust",
  go: "go",
  rb: "ruby",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  cs: "csharp",
  fs: "fsharp",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  swift: "swift",
  dart: "dart",
  php: "php",
  lua: "lua",
  r: "r",
  R: "r",
  scala: "scala",
  groovy: "groovy",
  pl: "perl",
  pm: "perl",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hrl: "erlang",
  hs: "haskell",
  lhs: "haskell",
  ml: "ocaml",
  mli: "ocaml",
  clj: "clojure",
  cljs: "clojure",
  elm: "elm",
  nim: "nim",
  zig: "zig",
  v: "v",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  fish: "shellscript",
  ps1: "powershell",
  psm1: "powershell",
  bat: "bat",
  cmd: "bat",
  sql: "sql",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  json: "json",
  jsonc: "jsonc",
  xml: "xml",
  xsl: "xsl",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  md: "markdown",
  mdx: "mdx",
  tex: "latex",
  vue: "vue",
  svelte: "svelte",
  astro: "astro",
  graphql: "graphql",
  gql: "graphql",
  dockerfile: "dockerfile",
  makefile: "makefile",
  cmake: "cmake",
};

// ── Resolver ────────────────────────────────────────────────

function resolveIconUrl(iconId: string): string {
  const def = iconDefinitions[iconId];
  if (!def) return iconUrlMap.get(defaultFileIcon) ?? "";

  const match = def.iconPath.match(/\/([^/]+)\.svg$/);
  if (!match) return iconUrlMap.get(defaultFileIcon) ?? "";

  return iconUrlMap.get(match[1]!) ?? iconUrlMap.get(defaultFileIcon) ?? "";
}

const defaultFileUrl = resolveIconUrl(defaultFileIcon);
const defaultFolderUrl = resolveIconUrl(defaultFolderIcon);

// ── Public API ──────────────────────────────────────────────

/** Get the icon asset URL for a file by its name. */
export function getFileIconUrl(fileName: string): string {
  const lowerName = fileName.toLowerCase();

  // 1. Exact filename match (e.g. "package.json", ".gitignore")
  const byName = fileNames[lowerName];
  if (byName) return resolveIconUrl(byName);

  // 2. Extension match via fileExtensions
  const dotIndex = lowerName.indexOf(".");
  if (dotIndex >= 0) {
    // Try compound extension first (e.g. "test.ts", "d.ts")
    const compoundExt = lowerName.slice(dotIndex + 1);
    const byCompound = fileExtensions[compoundExt];
    if (byCompound) return resolveIconUrl(byCompound);

    // Try simple extension
    const lastDot = lowerName.lastIndexOf(".");
    const simpleExt = lowerName.slice(lastDot + 1);
    if (lastDot !== dotIndex) {
      const bySimple = fileExtensions[simpleExt];
      if (bySimple) return resolveIconUrl(bySimple);
    }

    // 3. Extension → languageId → languageIds
    const langId = extToLanguageId[simpleExt];
    if (langId) {
      const byLang = languageIds[langId];
      if (byLang) return resolveIconUrl(byLang);
    }
  }

  return defaultFileUrl;
}

/** Get the icon asset URL for a folder by its name. */
export function getFolderIconUrl(folderName: string): string {
  const lowerName = folderName.toLowerCase();
  const byName = folderNames[lowerName];
  if (byName) return resolveIconUrl(byName);
  return defaultFolderUrl;
}

/** Get the icon asset URL for a FileEntry (file or directory). */
export function getEntryIconUrl(name: string, isDirectory: boolean): string {
  if (isDirectory) return getFolderIconUrl(name);
  return getFileIconUrl(name);
}
