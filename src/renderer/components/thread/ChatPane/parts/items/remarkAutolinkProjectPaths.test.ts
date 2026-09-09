import { describe, expect, it, vi } from "vitest";
import type { ProjectPathRef } from "./parseProjectPathRef";
import { remarkAutolinkProjectPaths } from "./remarkAutolinkProjectPaths";
import { pathRefUrl } from "./markdownPathRefs";

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

describe("remarkAutolinkProjectPaths", () => {
  it.each([
    "https://example.test/report.pdf",
    "https://poracode.local/path/v2/%2Ftmp%2Freport%3A2026?line=12",
    "https://poracode.local/path/v3/%2Ftmp%2Freport.pdf",
    "poracode:path:src%2Fmain.ts%3A12-18",
  ])("preserves URL identity before heuristic filesystem lookup: %s", (url) => {
    const parsePathRef = vi.fn<(token: string) => ProjectPathRef | null>((path) => ({
      kind: "folder",
      path,
    }));
    const tree: MdNode = {
      type: "root",
      children: [{ type: "link", url, children: [{ type: "text", value: "report" }] }],
    };

    remarkAutolinkProjectPaths({ parsePathRef })(tree);

    expect(parsePathRef).not.toHaveBeenCalled();
    expect(tree.children?.[0]?.url).toBe(url);
  });

  it("detects bare filename references in plain text", () => {
    const tree: MdNode = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "text",
              value: "BrowserPanelManager.ts:288 lost its badge.",
            },
          ],
        },
      ],
    };

    remarkAutolinkProjectPaths({
      parsePathRef: (token): ProjectPathRef | null =>
        token === "BrowserPanelManager.ts:288"
          ? { kind: "file", path: "BrowserPanelManager.ts", line: 288 }
          : null,
    })(tree);

    expect(tree.children?.[0]?.children?.[0]?.url).toBe(
      pathRefUrl({ kind: "file", path: "BrowserPanelManager.ts", line: 288 }),
    );
  });

  it("rewrites recognized markdown link urls to file-chip links", () => {
    const tree: MdNode = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "link",
              url: "C:/repo/src/supervisor/agents/acp/session.ts:945",
              children: [{ type: "text", value: "session.ts" }],
            },
          ],
        },
      ],
    };

    remarkAutolinkProjectPaths({
      parsePathRef: (token): ProjectPathRef | null =>
        token === "C:/repo/src/supervisor/agents/acp/session.ts:945"
          ? { kind: "file", path: "src/supervisor/agents/acp/session.ts", line: 945 }
          : null,
    })(tree);

    expect(tree.children?.[0]?.children?.[0]?.url).toBe(
      pathRefUrl({ kind: "file", path: "src/supervisor/agents/acp/session.ts", line: 945 }),
    );
  });

  it("detects absolute POSIX paths in plain text", () => {
    const tree: MdNode = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "text",
              value: "See /home/me/repo/src/foo.ts:42 for details.",
            },
          ],
        },
      ],
    };

    remarkAutolinkProjectPaths({
      parsePathRef: (token): ProjectPathRef | null =>
        token === "/home/me/repo/src/foo.ts:42"
          ? { kind: "file", path: "/home/me/repo/src/foo.ts", line: 42 }
          : null,
    })(tree);

    const linkNode = tree.children?.[0]?.children?.find((child) => child.type === "link");
    expect(linkNode?.url).toBe(
      pathRefUrl({ kind: "file", path: "/home/me/repo/src/foo.ts", line: 42 }),
    );
  });

  it("preserves recognized file line ranges in chip links", () => {
    const tree: MdNode = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "text",
              value: "See src/renderer/components/thread/ChatPane/chatPaneSelectors.ts:157-172",
            },
          ],
        },
      ],
    };

    remarkAutolinkProjectPaths({
      parsePathRef: (token): ProjectPathRef | null =>
        token === "src/renderer/components/thread/ChatPane/chatPaneSelectors.ts:157-172"
          ? {
              kind: "file",
              path: "src/renderer/components/thread/ChatPane/chatPaneSelectors.ts",
              line: 157,
              endLine: 172,
            }
          : null,
    })(tree);

    expect(tree.children?.[0]?.children?.[1]?.url).toBe(
      pathRefUrl({
        kind: "file",
        path: "src/renderer/components/thread/ChatPane/chatPaneSelectors.ts",
        line: 157,
        endLine: 172,
      }),
    );
  });
});
// @vitest-environment node
