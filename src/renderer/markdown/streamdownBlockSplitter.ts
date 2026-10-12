/**
 * Grouping adapted from Streamdown, Copyright 2023 Vercel, Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { Lexer } from "streamdown-marked";
import { parseMarkdownIntoBlocks } from "streamdown";

export const STREAMDOWN_BLOCK_ONLY_LIMIT_CHARS = 48 * 1024;

const FOOTNOTE_REFERENCE = /\[\^[\w-]{1,200}\](?!:)/;
const FOOTNOTE_DEFINITION = /\[\^[\w-]{1,200}\]:/;
const HTML_TAG = /<([A-Za-z][\w:-]*)[\s>/]/;
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function countOpenTags(raw: string, tag: string): number {
  const name = tag.toLowerCase();
  if (VOID_ELEMENTS.has(name)) return 0;
  const matches = raw.match(new RegExp(`<${name}(?=[\\s>/])[^>]*>`, "gi"));
  if (!matches) return 0;
  let count = 0;
  for (const match of matches) {
    if (!match.trimEnd().endsWith("/>")) count += 1;
  }
  return count;
}

function countCloseTags(raw: string, tag: string): number {
  return raw.match(new RegExp(`</${tag.toLowerCase()}(?=[\\s>])[^>]*>`, "gi"))?.length ?? 0;
}

function countMathDelimiters(raw: string): number {
  let count = 0;
  for (let index = 0; index < raw.length - 1; index += 1) {
    if (raw[index] === "$" && raw[index + 1] === "$") {
      count += 1;
      index += 1;
    }
  }
  return count;
}

/**
 * Streamdown 2.6.0's block grouping with Marked 17.0.6's block pass only.
 * Keep this paired with the untouched upstream oracle tests when upgrading
 * either dependency: the inline-token queue is unused by this projection.
 */
export function splitStreamdownMarkdownBlocks(markdown: string): string[] {
  if (markdown.length >= STREAMDOWN_BLOCK_ONLY_LIMIT_CHARS) {
    return parseMarkdownIntoBlocks(markdown);
  }
  // Upstream checks footnotes before lexing, preserving the original CR units.
  if (FOOTNOTE_REFERENCE.test(markdown) || FOOTNOTE_DEFINITION.test(markdown)) {
    return [markdown];
  }

  const lexer = new Lexer({ gfm: true });
  // Match Lexer.lex's normalization and block bookkeeping, omitting only its
  // final drain of queued inlineTokens. Never reuse a lexer across snapshots.
  const tokens = lexer.blockTokens(markdown.replace(/\r\n|\r/g, "\n"), lexer.tokens);
  const blocks: string[] = [];
  const openTags: string[] = [];
  let previousWasCode = false;

  for (const token of tokens) {
    const raw = token.raw;
    const count = blocks.length;
    if (openTags.length > 0) {
      blocks[count - 1] += raw;
      const tag = openTags.at(-1)!;
      const opens = countOpenTags(raw, tag);
      const closes = countCloseTags(raw, tag);
      for (let index = 0; index < opens; index += 1) openTags.push(tag);
      for (let index = 0; index < closes; index += 1) {
        if (openTags.length > 0 && openTags.at(-1) === tag) openTags.pop();
      }
      continue;
    }

    if (token.type === "html" && token.block) {
      const match = raw.match(HTML_TAG);
      if (match) {
        const tag = match[1]!;
        // Upstream deliberately pushes one witness, even for multiple opens.
        if (countOpenTags(raw, tag) > countCloseTags(raw, tag)) openTags.push(tag);
      }
    }

    if (count > 0 && !previousWasCode) {
      const previous = blocks[count - 1]!;
      if (countMathDelimiters(previous) % 2 === 1) {
        blocks[count - 1] = previous + raw;
        continue;
      }
    }
    blocks.push(raw);
    if (token.type !== "space") previousWasCode = token.type === "code";
  }
  return blocks;
}
