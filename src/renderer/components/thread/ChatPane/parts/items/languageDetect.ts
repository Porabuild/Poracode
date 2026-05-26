/**
 * Language ids the tool-call viewport understands. `plain` skips highlighting
 * entirely; everything else maps to a Shiki bundled language and is rendered
 * via `CodeBlock`. Add more here when extending — `shikiClient` will load the
 * grammar on demand the first time it's used.
 */
export type ViewportLanguage =
  | "plain"
  | "json"
  | "jsonc"
  | "javascript"
  | "typescript"
  | "tsx"
  | "jsx"
  | "python"
  | "bash"
  | "shell"
  | "yaml"
  | "html"
  | "css"
  | "go"
  | "rust"
  | "markdown"
  | "sql"
  | "diff";

export type HighlightLanguage = Exclude<ViewportLanguage, "plain">;

const LANGUAGE_ALIASES: Record<string, HighlightLanguage> = {
  json: "json",
  jsonc: "jsonc",
  json5: "jsonc",
  geojson: "json",
  javascript: "javascript",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  typescript: "typescript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  python: "python",
  py: "python",
  pyw: "python",
  bash: "bash",
  sh: "bash",
  shell: "shell",
  zsh: "shell",
  fish: "shell",
  yaml: "yaml",
  yml: "yaml",
  html: "html",
  htm: "html",
  css: "css",
  go: "go",
  rust: "rust",
  rs: "rust",
  markdown: "markdown",
  md: "markdown",
  mdx: "markdown",
  sql: "sql",
  diff: "diff",
  patch: "diff",
};

export function normalizeHighlightLanguage(
  value: string | undefined | null,
): HighlightLanguage | null {
  if (!value) return null;
  for (const rawToken of value.trim().split(/\s+/)) {
    if (rawToken.length === 0) continue;
    const normalized = rawToken.toLowerCase();
    const token = normalized.startsWith("language-")
      ? normalized.slice("language-".length)
      : normalized.startsWith("lang-")
        ? normalized.slice("lang-".length)
        : normalized;
    if (token.length === 0) continue;
    const language = LANGUAGE_ALIASES[token];
    if (language) return language;
    const pathLanguage = inferLanguageFromFencePath(token);
    if (pathLanguage) return pathLanguage;
  }
  return null;
}

function inferLanguageFromFencePath(token: string): HighlightLanguage | null {
  const path = token.replace(/^\d+(?::\d+)?:/, "");
  const dot = path.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = path.slice(dot + 1).toLowerCase();
  return LANGUAGE_ALIASES[ext] ?? null;
}

export function detectLanguageFromPath(path: string | undefined): ViewportLanguage {
  if (!path) return "plain";
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const base = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "plain";
  const ext = base.slice(dot + 1).toLowerCase();
  return normalizeHighlightLanguage(ext) ?? "plain";
}
