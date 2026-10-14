// @vitest-environment node
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { defaultRehypePlugins } from "streamdown";
import remarkGfm from "remark-gfm";
import { unified, type Plugin, type Transformer } from "unified";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  STRONG_TEXT_RUN_COMPONENT,
  STRONG_TEXT_RUN_OPTIONS,
  readStrongTextRun,
  remarkStrongTextRuns,
  rehypeRestoreStrongTextRuns,
  rehypeStrongTextRunComponents,
} from "./strongTextRuns";

// Resolve the parser at the actual declared Streamdown dependency boundary,
// rather than introduce undeclared first-party runtime dependencies.
const upstream = createRequire(`${realpathSync("node_modules/streamdown")}/package.json`);
const { default: remarkParse } = (await import(upstream.resolve("remark-parse"))) as {
  default: Plugin;
};
const { default: remarkRehype } = (await import(upstream.resolve("remark-rehype"))) as {
  default: Plugin<[{ allowDangerousHtml: boolean }?]>;
};
type Node = Parameters<Exclude<ReturnType<typeof remarkStrongTextRuns>, void>>[0];
type File = Parameters<Transformer<Node>>[1];
type Stage = "encoded" | "raw" | "decoded" | "sanitized" | "complete";

function stage(text: string, stop: Stage = "complete") {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkStrongTextRuns);
  if (stop !== "encoded") {
    processor.use(remarkRehype, { allowDangerousHtml: true }).use([defaultRehypePlugins.raw!]);
    if (stop !== "raw") {
      processor.use(rehypeRestoreStrongTextRuns);
      if (stop !== "decoded") {
        processor.use([defaultRehypePlugins.sanitize!]);
        if (stop !== "sanitized") processor.use(rehypeStrongTextRunComponents);
      }
    }
  }
  let file!: File;
  processor.use(() => (_tree, current) => {
    file = current;
  });
  const tree = processor.runSync(processor.parse(text), text) as Node;
  return { tree, file };
}

function nodes(tree: Node): Node[] {
  const found: Node[] = [];
  const pending = [tree];
  while (pending.length) {
    const node = pending.pop()!;
    found.push(node);
    if (node.children) pending.push(...node.children);
  }
  return found;
}

function transform(plugin: typeof rehypeRestoreStrongTextRuns) {
  const result = plugin.call(unified(), STRONG_TEXT_RUN_OPTIONS);
  if (typeof result !== "function") throw new TypeError();
  // These three named same-pipeline plugins are explicitly synchronous.
  return result as (tree: Node, file: File) => void;
}

afterEach(() => vi.restoreAllMocks());

describe("private strong text run custody", () => {
  it("round trips the complete 4096-span representation through actual raw and sanitize", () => {
    const text = "*".repeat(8_192) + "x" + "*".repeat(8_192);
    const complete = stage(text);
    const run = nodes(complete.tree).find((node) => node.tagName === STRONG_TEXT_RUN_COMPONENT)!;
    expect(readStrongTextRun(run)).toEqual({ count: 4_096, text: "x" });
    expect(run.properties).toEqual({});
    expect(Object.getOwnPropertySymbols(complete.file.data)).toHaveLength(0);
    expect(JSON.stringify(complete.tree)).not.toContain("data-strongrun");
    expect(JSON.stringify(complete.tree)).not.toContain('"marker"');
    expect(JSON.stringify(complete.tree)).not.toContain('"index"');
    expect(JSON.stringify(complete.tree)).not.toContain('"stamp"');
  });

  it("keeps single strong nodes stock without random/run allocation", () => {
    const random = vi.spyOn(crypto, "getRandomValues");
    const complete = stage("A **small** paragraph with _emphasis_ and `code`.");
    expect(random).not.toHaveBeenCalled();
    expect(nodes(complete.tree).filter((node) => node.tagName === "strong")).toHaveLength(1);
    expect(nodes(complete.tree).some((node) => node.tagName === STRONG_TEXT_RUN_COMPONENT)).toBe(
      false,
    );
    expect(Object.getOwnPropertySymbols(complete.file.data)).toHaveLength(0);
  });

  it("proves the dynamic marker absent even with controlled random bytes", () => {
    vi.spyOn(crypto, "getRandomValues").mockImplementation(((array: Uint32Array) => {
      array.fill(0);
      return array;
    }) as Crypto["getRandomValues"]);
    const text = `****${"0".repeat(32)}****`;
    const encoded = stage(text, "encoded");
    const run = nodes(encoded.tree).find((node) => node.data?.hProperties)!;
    const properties = run.data!.hProperties as Record<string, unknown>;
    const [property] = Object.keys(properties);
    expect(property).toBe(`data-strongrun${"0".repeat(32)}x`);
    expect(text.toLowerCase()).not.toContain(property!.slice("data-strongrun".length));
  });

  it.each([
    "<poracode-strong-text-run>forged</poracode-strong-text-run>",
    '<strong data-strongrundeadbeef="0">kept</strong>',
    '<strong data-poracode-strong-text-run="4096">kept</strong>',
    '<strong data-poracode-strong-text-run-count="4096">kept</strong>',
  ])("authored markup cannot acquire run dispatch: %s", (text) => {
    const complete = stage(text);
    expect(nodes(complete.tree).some((node) => node.tagName === STRONG_TEXT_RUN_COMPONENT)).toBe(
      false,
    );
    expect(nodes(complete.tree).some((node) => node.data?.poracodeStrongTextRun)).toBe(false);
    const properties = nodes(complete.tree).flatMap((node) => Object.keys(node.properties ?? {}));
    expect(properties.some((property) => /strongrun|strong-text-run/i.test(property))).toBe(false);
  });

  it("keeps complete raw-HTML blocks out of the representation", () => {
    const random = vi.spyOn(crypto, "getRandomValues");
    const complete = stage("****x**** <b>ordinary</b>");
    expect(random).not.toHaveBeenCalled();
    expect(nodes(complete.tree).filter((node) => node.tagName === "strong")).toHaveLength(2);
    expect(nodes(complete.tree).some((node) => node.tagName === STRONG_TEXT_RUN_COMPONENT)).toBe(
      false,
    );
  });

  it("leaves data overrides untouched before mutating any candidate", () => {
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(() => (tree) => {
        const text = nodes(tree as Node).find((node) => node.type === "text")!;
        text.data = { hName: "i" };
      })
      .use(remarkStrongTextRuns);
    const tree = processor.runSync(processor.parse("****x****"), "****x****") as Node;
    expect(nodes(tree).filter((node) => node.type === "strong")).toHaveLength(2);
    expect(nodes(tree).some((node) => node.data?.hProperties)).toBe(false);
  });

  it("rejects missing, repeated and cross-file relay custody", () => {
    const first = stage("****a****", "raw");
    const second = stage("****b****", "raw");
    const plain = stage("plain", "raw");
    const missing = stage("plain");
    const restore = transform(rehypeRestoreStrongTextRuns);
    expect(() => restore(first.tree, missing.file)).toThrow(TypeError);
    expect(() => restore(structuredClone(first.tree), second.file)).toThrow(TypeError);
    expect(() => restore(structuredClone(first.tree), plain.file)).toThrow(TypeError);
    restore(first.tree, first.file);
    expect(() => restore(first.tree, first.file)).toThrow(TypeError);
  });

  it("rejects file-data reuse, duplicate markers and lost encoded markers", () => {
    const first = stage("****a****", "raw");
    const other = stage("****b****", "raw");
    other.file.data = first.file.data;
    const restore = transform(rehypeRestoreStrongTextRuns);
    expect(() => restore(other.tree, other.file)).toThrow(TypeError);
    const duplicate = stage("****a****", "raw");
    const paragraph = nodes(duplicate.tree).find((node) => node.tagName === "p")!;
    paragraph.children!.push(structuredClone(paragraph.children![0]!));
    expect(() => restore(duplicate.tree, duplicate.file)).toThrow(TypeError);
    const lost = stage("****a****", "raw");
    const run = nodes(lost.tree).find((node) => node.tagName === "strong")!;
    run.properties = {};
    expect(() => restore(lost.tree, lost.file)).toThrow(TypeError);
  });

  it("rejects post-sanitize loss, duplication, count tampering and foreign metadata", () => {
    const dispatch = transform(rehypeStrongTextRunComponents);
    for (const mutation of ["lost", "duplicate", "count", "foreign"] as const) {
      const current = stage("****a****", "sanitized");
      const paragraph = nodes(current.tree).find((node) => node.tagName === "p")!;
      const run = paragraph.children![0]!;
      if (mutation === "lost") delete run.data;
      if (mutation === "duplicate") paragraph.children!.push(structuredClone(run));
      if (mutation === "count") (run.data!.poracodeStrongTextRun as { count: number }).count += 1;
      if (mutation === "foreign")
        run.data = nodes(stage("****b****", "sanitized").tree).find(
          (node) => node.tagName === "strong",
        )!.data;
      expect(() => dispatch(current.tree, current.file)).toThrow(TypeError);
    }
  });

  it("rejects coordinated count changes even when their total and weighted sum are unchanged", () => {
    const current = stage("********a******** ********b******** ********c********", "sanitized");
    const runs = nodes(current.tree).filter((node) => node.data?.poracodeStrongTextRun);
    expect(runs).toHaveLength(3);
    const changed = [5, 2, 5];
    for (const [index, run] of runs.entries()) {
      (run.data!.poracodeStrongTextRun as { count: number }).count = changed[index]!;
    }
    expect(() => transform(rehypeStrongTextRunComponents)(current.tree, current.file)).toThrow(
      TypeError,
    );
  });

  it("erases working custody and keeps cached processors isolated across fresh files", () => {
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkStrongTextRuns)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use([defaultRehypePlugins.raw!])
      .use(rehypeRestoreStrongTextRuns)
      .use([defaultRehypePlugins.sanitize!])
      .use(rehypeStrongTextRunComponents);
    for (const text of [
      "****first****",
      "******second******",
      "ordinary **third**",
      "****first****",
    ]) {
      const tree = processor.runSync(processor.parse(text), text) as Node;
      const runs = nodes(tree).filter((node) => node.tagName === STRONG_TEXT_RUN_COMPONENT);
      expect(runs.map((node) => readStrongTextRun(node))).toEqual(
        text.includes("second")
          ? [{ count: 3, text: "second" }]
          : text.includes("first")
            ? [{ count: 2, text: "first" }]
            : [],
      );
    }
    const complete = stage("****x****");
    expect(() => transform(rehypeStrongTextRunComponents)(complete.tree, complete.file)).toThrow(
      TypeError,
    );
  });
});
