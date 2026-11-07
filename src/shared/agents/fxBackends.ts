/**
 * The fx sign-in backends, in the order Provider Settings lists them. `slug`
 * is the `fx login` / `fx logout` argument; `statusId` is the id
 * `fx status --json` reports in `connected_providers`.
 */
export const FX_BACKENDS = [
  { slug: "vercel", statusId: "vercel-ai-gateway", label: "Vercel AI Gateway" },
  { slug: "codex", statusId: "codex", label: "Codex" },
  { slug: "grok", statusId: "grok", label: "Grok" },
] as const;
