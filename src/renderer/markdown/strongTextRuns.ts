import type { Plugin, Transformer } from "unified";

/** Private, same-pipeline representation; never persisted or sent over IPC. */
export const STRONG_TEXT_RUN_VERSION = 1;
export const STRONG_TEXT_RUN_COMPONENT = "poracode-strong-text-run";
export const STRONG_TEXT_RUN_OPTIONS = Object.freeze({ version: STRONG_TEXT_RUN_VERSION });

interface AstNode {
  type: string;
  tagName?: string | undefined;
  value?: string | undefined;
  children?: AstNode[] | undefined;
  properties?: Record<string, unknown> | undefined;
  data?: Record<string, unknown> | undefined;
}

type MarkdownFile = Parameters<Transformer<AstNode>>[1];
const RELAY = Symbol("strong-text-run-relay");
const RECEIPT = Symbol("strong-text-run-receipt");
const DATA_KEY = "poracodeStrongTextRun";
const RAW_PREFIX = "data-strongrun";
const HAST_PREFIX = "dataStrongrun";

interface Relay {
  owner: MarkdownFile;
  marker: string | null;
  counts: number[] | null;
}

interface Receipt {
  owner: MarkdownFile;
  marker: string | null;
  expected: number;
}

interface WorkingData {
  [RELAY]?: Relay;
  [RECEIPT]?: Receipt;
}

interface RunMetadata {
  version: number;
  count: number;
  index?: number;
  marker?: string;
  stamp?: string;
}

interface ReadableRunNode {
  type: string;
  tagName?: string | undefined;
  children?: readonly { type: string; value?: string | undefined }[] | undefined;
  properties?: object | undefined;
  data?: object | undefined;
}

function workingData(file: MarkdownFile): WorkingData {
  return file.data as WorkingData;
}

function requireVersion(options: typeof STRONG_TEXT_RUN_OPTIONS): void {
  if (options.version !== STRONG_TEXT_RUN_VERSION) throw new TypeError();
}

function childrenOnto(pending: AstNode[], node: AstNode): void {
  if (node.children) {
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      pending.push(node.children[index]!);
    }
  }
}

function freshMarker(source: string): string {
  const random = crypto.getRandomValues(new Uint32Array(4));
  let marker = Array.from(random, (value) => value.toString(16).padStart(8, "0")).join("");
  // Even a controlled random source cannot let authored markup name this relay.
  while (source.toLowerCase().includes(marker)) marker += "x";
  return marker;
}

/**
 * Pack only data-free unary strong -> nonempty text runs, after path/math
 * transforms. Raw HTML or property overrides leave the complete block alone.
 * The final DOM still contains every original formatting span.
 */
export const remarkStrongTextRuns: Plugin<[typeof STRONG_TEXT_RUN_OPTIONS?], AstNode> = (
  options = STRONG_TEXT_RUN_OPTIONS,
) => {
  requireVersion(options);
  return (tree, file) => {
    const data = workingData(file);
    if (data[RELAY] || data[RECEIPT]) throw new TypeError();
    const relay: Relay = { owner: file, marker: null, counts: null };
    data[RELAY] = relay;
    const pending = [tree];
    let candidates: { node: AstNode; leaf: AstNode; count: number }[] | undefined;
    while (pending.length > 0) {
      const node = pending.pop()!;
      // Do not change HTML adoption-agency behavior or data.hChildren custody.
      if (node.type === "html" || node.data) return;
      if (
        node.type === "strong" &&
        node.children?.length === 1 &&
        node.children[0]?.type === "strong"
      ) {
        let leaf = node;
        let count = 0;
        while (leaf.type === "strong" && !leaf.data && leaf.children?.length === 1) {
          count += 1;
          leaf = leaf.children[0]!;
        }
        if (leaf.data || leaf.type === "html") return;
        if (count >= 2 && leaf.type === "text" && leaf.value) {
          (candidates ??= []).push({ node, leaf, count });
        } else {
          // Visit the remaining subtree once, rather than rescan this chain.
          pending.push(leaf);
        }
      } else {
        childrenOnto(pending, node);
      }
    }
    if (!candidates) return;
    relay.marker = freshMarker(file.toString());
    relay.counts = candidates.map(({ count }) => count);
    for (const [index, { node, leaf }] of candidates.entries()) {
      node.children = [leaf];
      node.data = { hProperties: { [`${RAW_PREFIX}${relay.marker}`]: String(index) } };
    }
  };
};

/** Consume the single-use relay immediately after rehype-raw, before sanitize. */
export const rehypeRestoreStrongTextRuns: Plugin<[typeof STRONG_TEXT_RUN_OPTIONS?], AstNode> = (
  options = STRONG_TEXT_RUN_OPTIONS,
) => {
  requireVersion(options);
  return (tree, file) => {
    const data = workingData(file);
    const relay = data[RELAY];
    if (!relay || relay.owner !== file || data[RECEIPT]) throw new TypeError();
    const receipt: Receipt = {
      owner: file,
      marker: relay.marker,
      expected: relay.counts?.length ?? 0,
    };
    const pending = [tree];
    try {
      while (pending.length > 0) {
        const node = pending.pop()!;
        childrenOnto(pending, node);
        for (const property in node.properties) {
          if (!property.startsWith(HAST_PREFIX) && !property.startsWith(RAW_PREFIX)) continue;
          const marker = property.slice(
            property.startsWith(HAST_PREFIX) ? HAST_PREFIX.length : RAW_PREFIX.length,
          );
          if (!relay.marker) {
            // Authored HTML retains the stock sanitizer behavior, never trust.
            if (!file.toString().toLowerCase().includes(`${RAW_PREFIX}${marker}`.toLowerCase())) {
              throw new TypeError();
            }
            continue;
          }
          if (marker !== relay.marker || node.type !== "element" || node.tagName !== "strong") {
            throw new TypeError();
          }
          const rawIndex = node.properties![property];
          if (typeof rawIndex !== "string" || !/^(0|[1-9]\d*)$/.test(rawIndex))
            throw new TypeError();
          const index = Number(rawIndex);
          const count = relay.counts?.[index];
          if (!Number.isSafeInteger(index) || !count || count < 2 || node.data?.[DATA_KEY]) {
            throw new TypeError();
          }
          relay.counts![index] = 0;
          delete node.properties![property];
          node.data = {
            ...node.data,
            [DATA_KEY]: {
              version: STRONG_TEXT_RUN_VERSION,
              count,
              index,
              marker,
              stamp: `${marker}:${index}:${count}`,
            } satisfies RunMetadata,
          };
        }
      }
      if (relay.counts?.some((count) => count !== 0)) throw new TypeError();
      data[RECEIPT] = receipt;
    } finally {
      // No run array, transport property or encoded-source custody crosses sanitize.
      if (relay.counts) relay.counts.length = 0;
      delete data[RELAY];
    }
  };
};

/**
 * Only authenticated, sanitized runs receive an internal component tag.
 * Ordinary strong nodes keep Streamdown's own component. Authored versions of
 * this tag are not added to the sanitizer allowlist.
 */
export const rehypeStrongTextRunComponents: Plugin<[typeof STRONG_TEXT_RUN_OPTIONS?], AstNode> = (
  options = STRONG_TEXT_RUN_OPTIONS,
) => {
  requireVersion(options);
  return (tree, file) => {
    const data = workingData(file);
    const receipt = data[RECEIPT];
    if (!receipt || receipt.owner !== file || data[RELAY]) throw new TypeError();
    try {
      if (receipt.expected === 0) return;
      const pending = [tree];
      const seen: boolean[] = [];
      let observed = 0;
      while (pending.length > 0) {
        const node = pending.pop()!;
        childrenOnto(pending, node);
        const metadata = node.data?.[DATA_KEY] as RunMetadata | undefined;
        if (!metadata) continue;
        const { index, marker, count, version, stamp } = metadata;
        if (
          version !== STRONG_TEXT_RUN_VERSION ||
          marker !== receipt.marker ||
          !Number.isSafeInteger(index) ||
          index === undefined ||
          index < 0 ||
          index >= receipt.expected ||
          seen[index] ||
          !Number.isSafeInteger(count) ||
          count < 2 ||
          stamp !== `${receipt.marker}:${index}:${count}` ||
          node.type !== "element" ||
          node.tagName !== "strong" ||
          node.children?.length !== 1 ||
          node.children[0]?.type !== "text" ||
          !node.children[0].value ||
          Object.keys(node.properties ?? {}).length !== 0
        )
          throw new TypeError();
        seen[index] = true;
        observed += 1;
        node.tagName = STRONG_TEXT_RUN_COMPONENT;
        node.data![DATA_KEY] = { version, count } satisfies RunMetadata;
      }
      if (observed !== receipt.expected) throw new TypeError();
    } finally {
      delete data[RECEIPT];
    }
  };
};

/** Read only the finalized private leaf; no count/auth/transport props reach DOM. */
export function readStrongTextRun(node: ReadableRunNode | undefined): {
  count: number;
  text: string;
} {
  const metadata = (node?.data as { [DATA_KEY]?: RunMetadata } | undefined)?.[DATA_KEY];
  const text = node?.children?.[0]?.value;
  if (
    node?.type !== "element" ||
    node.tagName !== STRONG_TEXT_RUN_COMPONENT ||
    !metadata ||
    metadata.version !== STRONG_TEXT_RUN_VERSION ||
    !Number.isSafeInteger(metadata.count) ||
    metadata.count < 2 ||
    metadata.index !== undefined ||
    metadata.marker !== undefined ||
    metadata.stamp !== undefined ||
    node.children?.length !== 1 ||
    node.children[0]?.type !== "text" ||
    !text ||
    Object.keys(node.properties ?? {}).length !== 0
  )
    throw new TypeError();
  return { count: metadata.count, text };
}
