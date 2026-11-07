import { MAX_INLINE_VISUAL_BYTES } from "./inlineVisuals";

export const MCP_APP_SANDBOX_PATH = "/mcp-apps/sandbox/v1";

export interface McpAppCsp {
  connectDomains?: string[];
  resourceDomains?: string[];
  frameDomains?: string[];
  baseUriDomains?: string[];
}

/** CSP sources are origins, never arbitrary directives supplied by a server. */
export function readMcpAppCsp(value: unknown): McpAppCsp {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: McpAppCsp = {};
  for (const key of [
    "connectDomains",
    "resourceDomains",
    "frameDomains",
    "baseUriDomains",
  ] as const) {
    const entries = (value as Record<string, unknown>)[key];
    if (!Array.isArray(entries) || entries.length > 32) continue;
    result[key] = entries.filter((entry): entry is string => {
      if (typeof entry !== "string" || entry.length > 256 || /[\s;'"\\]/u.test(entry)) return false;
      if (!/^(https?:|wss?:)\/\//u.test(entry)) return false;
      if (key !== "connectDomains" && !entry.startsWith("http")) return false;
      try {
        const url = new URL(entry.replace("://*.", "://wildcard."));
        return !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
      } catch {
        return false;
      }
    });
  }
  return result;
}

export function buildMcpAppCsp(value: unknown): string {
  const csp = readMcpAppCsp(value);
  const sources = (values: string[] | undefined) => values?.join(" ") || "'none'";
  const resources = csp.resourceDomains?.join(" ") ?? "";
  return [
    // HTTP enforcement also makes the proxy opaque; neither frame shares the host origin.
    "sandbox allow-scripts",
    "default-src 'none'",
    `script-src 'unsafe-inline' ${resources}`,
    `style-src 'unsafe-inline' ${resources}`,
    `img-src data: blob: ${resources}`,
    `font-src data: ${resources}`,
    `media-src data: blob: ${resources}`,
    `connect-src ${sources(csp.connectDomains)}`,
    `frame-src ${sources(csp.frameDomains)}`,
    `base-uri ${sources(csp.baseUriDomains)}`,
    "object-src 'none'",
    "form-action 'none'",
  ].join("; ");
}

// This trusted proxy contains no app bytes, credentials, or host API. App HTML is
// delivered only after the renderer binds to this exact opaque WindowProxy.
export const MCP_APP_SANDBOX_HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;display:block;overflow:hidden}</style></head><body><script>
(() => {
  if (parent === self) return;
  const parentOrigin = new URLSearchParams(location.hash.slice(1)).get('parent');
  if (!parentOrigin) return;
  const targetOrigin = parentOrigin === 'null' ? '*' : parentOrigin;
  let inner;
  addEventListener('message', event => {
    if (event.source === parent && event.origin === parentOrigin) {
      const message = event.data;
      if (message?.method === 'ui/notifications/sandbox-resource-ready') {
        if (inner || typeof message.params?.html !== 'string' || new TextEncoder().encode(message.params.html).length > ${MAX_INLINE_VISUAL_BYTES}) return;
        inner = document.createElement('iframe');
        inner.setAttribute('sandbox', 'allow-scripts');
        inner.setAttribute('referrerpolicy', 'no-referrer');
        inner.srcdoc = message.params.html;
        document.body.append(inner);
      } else if (inner && (typeof message?.method !== 'string' || !message.method.startsWith('ui/notifications/sandbox-'))) {
        inner.contentWindow.postMessage(message, '*');
      }
    } else if (inner && event.source === inner.contentWindow && event.origin === 'null') {
      if (typeof event.data?.method !== 'string' || !event.data.method.startsWith('ui/notifications/sandbox-')) parent.postMessage(event.data, targetOrigin);
    }
  });
  parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/sandbox-proxy-ready'}, targetOrigin);
})();
</script></body></html>`;
