import { describe, expect, it } from "vitest";
import {
  parseJiraCliOutput,
  parseLinkMetadata,
  resolveLinkMetadata,
  type LinkMetadataResolver,
  type LinkMetadataResolverKind,
} from "./linkMetadata";

describe("parseLinkMetadata", () => {
  it("prefers Open Graph metadata and decodes entities", () => {
    const result = parseLinkMetadata(`
      <html><head>
        <title>Fallback &amp; title</title>
        <meta content="A useful &quot;summary&quot;" property="og:description">
        <meta content="A beautiful page &amp; preview" property="og:title">
      </head></html>
    `);

    expect(result).toEqual({
      title: "A beautiful page & preview",
      description: 'A useful "summary"',
    });
  });

  it("uses the document title and standard description when Open Graph is absent", () => {
    const result = parseLinkMetadata(`
      <title>  Example   page </title>
      <meta name="description" content="First line\nSecond line">
    `);

    expect(result).toEqual({ title: "Example page", description: "First line Second line" });
  });

  it("returns empty metadata for non-HTML content", () => {
    expect(parseLinkMetadata("")).toEqual({ title: null, description: null });
  });
});

describe("parseJiraCliOutput", () => {
  const output = `
    # [M9] Alert when an article stays pending too long
    ------------------------ Description ------------------------
    ## Context
    On dev, two articles stayed pending without alerting anyone.
    ------------------------ Linked Issues ------------------------
    View this issue on Jira: https://yieldmo.atlassian.net/browse/SIT-2296
  `;

  it("reads the ticket summary and description from the matching Jira host", () => {
    expect(parseJiraCliOutput(output, "https://yieldmo.atlassian.net/browse/SIT-2296")).toEqual({
      title: "[M9] Alert when an article stays pending too long",
      description: "## Context On dev, two articles stayed pending without alerting anyone.",
    });
  });

  it("rejects metadata from a differently configured Jira host", () => {
    expect(parseJiraCliOutput(output, "https://other.atlassian.net/browse/SIT-2296")).toEqual({
      title: null,
      description: null,
    });
  });
});

describe("resolveLinkMetadata", () => {
  it.each([
    "not a url",
    "http://example.test/page",
    "https://127.0.0.1/private",
    "https://user:secret@example.test/private",
    "https://example.test:8443/private",
  ])("fails closed for unsupported or non-public sources: %s", async (url) => {
    await expect(resolveLinkMetadata(url)).resolves.toEqual({ title: null, description: null });
  });

  it("skips a generic browser title in favor of the richer CLI result", async () => {
    const calls: LinkMetadataResolverKind[] = [];
    const resolvers = [
      resolver("browser", "Jira", null, calls),
      resolver("cli", "[M9] Alert when an article stays pending too long", "Details", calls),
      resolver("mcp", "MCP title", null, calls),
      resolver("plugin", "Plugin title", null, calls),
    ];

    await expect(
      resolveLinkMetadata("https://yieldmo.atlassian.net/browse/SIT-2296", { resolvers }),
    ).resolves.toEqual({
      title: "[M9] Alert when an article stays pending too long",
      description: "Details",
    });
    expect(calls).toEqual(["browser", "cli"]);
  });

  it("falls through CLI and MCP failures to a plugin result", async () => {
    const calls: LinkMetadataResolverKind[] = [];
    const resolvers = [
      resolver("browser", null, null, calls),
      resolver("cli", null, null, calls, true),
      resolver("mcp", null, null, calls),
      resolver("plugin", "Plugin title", "Plugin details", calls),
    ];

    await expect(resolveLinkMetadata("https://example.test/docs", { resolvers })).resolves.toEqual({
      title: "Plugin title",
      description: "Plugin details",
    });
    expect(calls).toEqual(["browser", "cli", "mcp", "plugin"]);
  });

  it("returns empty metadata when every resolver fails", async () => {
    const calls: LinkMetadataResolverKind[] = [];
    const resolvers = [resolver("browser", null, null, calls, true)];

    await expect(resolveLinkMetadata("https://example.test/docs", { resolvers })).resolves.toEqual({
      title: null,
      description: null,
    });
    expect(calls).toEqual(["browser"]);
  });
});

function resolver(
  kind: LinkMetadataResolverKind,
  title: string | null,
  description: string | null,
  calls: LinkMetadataResolverKind[],
  throws = false,
): LinkMetadataResolver {
  return {
    kind,
    canResolve: () => true,
    resolve: async () => {
      calls.push(kind);
      if (throws) throw new Error(`${kind} unavailable`);
      return { title, description };
    },
  };
}
