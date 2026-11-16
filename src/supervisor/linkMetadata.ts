import { execFile } from "node:child_process";
import { lookup } from "node:dns/promises";
import { get } from "node:https";
import { BlockList, isIP } from "node:net";
import { stripAnsi } from "@/shared/ansi";
import type { McpServer } from "@/shared/contracts";
import { createMcpLinkMetadataResolvers } from "./mcpLinkMetadata";
import { jiraIssueKey, type LinkMetadata } from "./linkMetadataShared";

export type { LinkMetadata } from "./linkMetadataShared";
export type LinkMetadataResolverKind = "browser" | "cli" | "mcp" | "plugin";

export interface LinkMetadataResolver {
  kind: LinkMetadataResolverKind;
  canResolve(url: string): boolean;
  resolve(url: string): Promise<LinkMetadata>;
}

export interface LinkMetadataResolutionOptions {
  mcpServers?: readonly McpServer[];
  pluginServers?: readonly McpServer[];
  resolvers?: readonly LinkMetadataResolver[];
}

const MAX_HTML_BYTES = 256 * 1024;
const MAX_REDIRECTS = 2;
const REQUEST_TIMEOUT_MS = 5_000;
const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const) {
  blocked.addSubnet(address, prefix);
}

export async function resolveLinkMetadata(
  value: string,
  options: LinkMetadataResolutionOptions = {},
): Promise<LinkMetadata> {
  const resolvers = options.resolvers ?? [
    {
      kind: "browser" as const,
      canResolve: (url: string) => /^https?:\/\//iu.test(url),
      resolve: resolveBrowserMetadata,
    },
    {
      kind: "cli" as const,
      canResolve: (url: string) => jiraIssueKey(url) !== null,
      resolve: (url) => readJiraMetadata(url, jiraIssueKey(url)!),
    },
    ...createMcpLinkMetadataResolvers(options.mcpServers ?? [], "mcp"),
    ...createMcpLinkMetadataResolvers(options.pluginServers ?? [], "plugin"),
  ];
  for (const resolver of resolvers) {
    if (!resolver.canResolve(value)) continue;
    try {
      const metadata = await resolver.resolve(value);
      if ((metadata.title?.trim().length ?? 0) >= 5 || metadata.description) return metadata;
    } catch {}
  }
  return { title: null, description: null };
}

async function resolveBrowserMetadata(value: string): Promise<LinkMetadata> {
  try {
    return parseLinkMetadata(await fetchPublicHtml(value));
  } catch {
    return { title: null, description: null };
  }
}

export function parseJiraCliOutput(output: string, value: string): LinkMetadata {
  const normalized = stripAnsi(output);
  const canonical = /View this issue on Jira:\s*(https:\/\/\S+)/u.exec(normalized)?.[1];
  const expected = new URL(value);
  if (!canonical || new URL(canonical).host !== expected.host) {
    return { title: null, description: null };
  }
  const title = /^\s*#\s+(.+)$/mu.exec(normalized)?.[1];
  const description =
    /-+\s*Description\s*-+\s*\n([\s\S]*?)(?:\n\s*-+\s*(?:Linked Issues|Sources)\s*-+|$)/u.exec(
      normalized,
    )?.[1];
  return {
    title: cleanText(title, 240),
    description: cleanText(description, 600),
  };
}

async function readJiraMetadata(value: string, key: string): Promise<LinkMetadata> {
  return new Promise((resolve, reject) => {
    execFile(
      "jira",
      ["issue", "view", key, "--plain"],
      {
        timeout: REQUEST_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: MAX_HTML_BYTES,
      },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(parseJiraCliOutput(stdout, value));
      },
    );
  });
}

export function parseLinkMetadata(html: string): LinkMetadata {
  const meta = readMetaContent(html);
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1];
  return {
    title: cleanText(meta.get("og:title") ?? title, 240),
    description: cleanText(meta.get("og:description") ?? meta.get("description"), 600),
  };
}

async function fetchPublicHtml(value: string, redirectCount = 0): Promise<string> {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    isIP(url.hostname) ||
    url.hostname.startsWith("[")
  ) {
    throw new Error("Unsupported link metadata URL.");
  }

  return new Promise((resolveHtml, reject) => {
    const request = get(
      url,
      {
        agent: false,
        family: 4,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-encoding": "identity",
          "user-agent": "Poracode-Link-Preview/1.0",
        },
        lookup: (hostname, _options, callback) => {
          void lookup(hostname, { family: 4 }).then(
            ({ address }) => {
              if (blocked.check(address)) {
                callback(new Error("Non-public link metadata address."), "", 4);
              } else {
                callback(null, address, 4);
              }
            },
            (error: Error) => callback(error, "", 4),
          );
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location;
        if (status >= 300 && status < 400 && location && redirectCount < MAX_REDIRECTS) {
          response.resume();
          void fetchPublicHtml(new URL(location, url).href, redirectCount + 1).then(
            resolveHtml,
            reject,
          );
          return;
        }
        const contentType = response.headers["content-type"] ?? "";
        if (status !== 200 || !/^text\/html|application\/xhtml\+xml/iu.test(contentType)) {
          response.resume();
          resolveHtml("");
          return;
        }

        const chunks: Buffer[] = [];
        let length = 0;
        response.on("data", (chunk: Buffer) => {
          length += chunk.length;
          if (length > MAX_HTML_BYTES) {
            response.destroy();
            resolveHtml(Buffer.concat(chunks).toString("utf8"));
            return;
          }
          chunks.push(chunk);
          if (/<\/head\s*>/iu.test(chunk.toString("utf8"))) {
            response.destroy();
            resolveHtml(Buffer.concat(chunks).toString("utf8"));
          }
        });
        response.on("end", () => resolveHtml(Buffer.concat(chunks).toString("utf8")));
        response.on("error", reject);
      },
    );
    request.on("error", reject);
  });
}

function readMetaContent(html: string): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b[^>]*>/giu)) {
    const attributes = new Map<string, string>();
    for (const attribute of match[0].matchAll(
      /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/giu,
    )) {
      attributes.set(
        attribute[1]!.toLowerCase(),
        attribute[2] ?? attribute[3] ?? attribute[4] ?? "",
      );
    }
    const key = (attributes.get("property") ?? attributes.get("name"))?.toLowerCase();
    const content = attributes.get("content");
    if (key && content && !values.has(key)) values.set(key, content);
  }
  return values;
}

function cleanText(value: string | undefined, maxLength: number): string | null {
  if (!value) return null;
  const cleaned = decodeEntities(value).replace(/\s+/gu, " ").trim();
  if (!cleaned) return null;
  return cleaned.length <= maxLength ? cleaned : `${cleaned.slice(0, maxLength - 1).trimEnd()}…`;
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    lt: "<",
    mdash: "—",
    nbsp: " ",
    ndash: "–",
    quot: '"',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/giu, (entity, code: string) => {
    if (code.startsWith("#")) {
      const hex = code[1]?.toLowerCase() === "x";
      const point = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : entity;
    }
    return named[code.toLowerCase()] ?? entity;
  });
}
