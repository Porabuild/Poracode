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

const upstream = createRequire(`${realpathSync("node_modules/streamdown")}/package.json`);
const { default: remarkParse } = (await import(upstream.resolve("remark-parse"))) as {
  default: Plugin;
};

describe("remarkAutolinkProjectPaths", () => {
  it("visits the real 4096-strong Markdown AST without recursion or losing formatting", () => {
    const text = "*".repeat(8_192) + "src/deep.ts" + "*".repeat(8_192);
    const tree = unified().use(remarkParse).parse(text) as MdNode;
    const parsePathRef = vi.fn<(token: string) => ProjectPathRef | null>((token) =>
      token === "src/deep.ts" ? { kind: "file", path: token } : null,
    );
    remarkAutolinkProjectPaths({ parsePathRef })(tree);
    const pending = [tree];
    let strong = 0;
    let link: MdNode | undefined;
    while (pending.length > 0) {
      const node = pending.pop()!;
      if (node.type === "strong") strong += 1;
      if (node.type === "link") link = node;
      if (node.children) pending.push(...node.children);
    }
    expect(strong).toBe(4_096);
    expect(parsePathRef.mock.calls).toEqual([["src/deep.ts"]]);
    expect(link?.url).toBe(pathRefUrl({ kind: "file", path: "src/deep.ts" }));
    expect(link?.children).toEqual([{ type: "text", value: "src/deep.ts" }]);
  });

  it("preserves DFS callback order, original child-array iteration and delayed replacements", () => {
    const first: MdNode = { type: "paragraph", children: [{ type: "text", value: "a.ts" }] };
    const nested: MdNode = { type: "strong", children: [{ type: "text", value: "b.ts" }] };
    const second: MdNode = {
      type: "paragraph",
      children: [nested, { type: "text", value: "c.ts" }],
    };
    const initial = [first, second, { type: "text", value: "d.ts" }];
    const tree: MdNode = { type: "root", children: initial };
    const firstChildren = first.children;
    const nestedChildren = nested.children;
    const secondChildren = second.children;
    const observations: unknown[] = [];
    remarkAutolinkProjectPaths({
      parsePathRef: (token) => {
        observations.push([
          token,
          tree.children === initial,
          first.children === firstChildren,
          nested.children === nestedChildren,
          second.children === secondChildren,
        ]);
        if (token === "a.ts") tree.children = [{ type: "text", value: "replacement.ts" }];
        return { kind: "file", path: token };
      },
    })(tree);
    expect(observations).toEqual([
      ["a.ts", true, true, true, true],
      ["b.ts", false, false, true, true],
      ["c.ts", false, false, false, true],
      ["d.ts", false, false, false, false],
    ]);
    expect(tree.children).toEqual([
      first,
      second,
      {
        type: "link",
        url: pathRefUrl({ kind: "file", path: "d.ts" }),
        children: [{ type: "text", value: "d.ts" }],
      },
    ]);
    expect(tree.children).not.toBe(initial);
  });

  it("retains completed-child/link effects and uncommitted ancestors when a callback throws", () => {
    const completed: MdNode = { type: "paragraph", children: [{ type: "text", value: "done.ts" }] };
    const link: MdNode = {
      type: "link",
      url: "link.ts",
      children: [{ type: "text", value: "skipped.ts" }],
    };
    const unfinished: MdNode = {
      type: "paragraph",
      children: [{ type: "text", value: "fail.ts" }],
    };
    const rootChildren = [completed, link, unfinished];
    const completedChildren = completed.children;
    const unfinishedChildren = unfinished.children;
    const tree: MdNode = { type: "root", children: rootChildren };
    const failure = new Error("fixture callback");
    const calls: string[] = [];
    expect(() =>
      remarkAutolinkProjectPaths({
        parsePathRef: (token) => {
          calls.push(token);
          if (token === "fail.ts") throw failure;
          return { kind: "file", path: token };
        },
      })(tree),
    ).toThrow(failure);
    expect(calls).toEqual(["done.ts", "link.ts", "fail.ts"]);
    expect(completed.children).not.toBe(completedChildren);
    expect(completed.children?.[0]?.url).toBe(pathRefUrl({ kind: "file", path: "done.ts" }));
    expect(link.url).toBe(pathRefUrl({ kind: "file", path: "link.ts" }));
    expect(link.children).toEqual([{ type: "text", value: "skipped.ts" }]);
    expect(unfinished.children).toBe(unfinishedChildren);
    expect(tree.children).toBe(rootChildren);
  });
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
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { unified, type Plugin } from "unified";
