import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math-extended";
import type { Pluggable, PluggableList } from "unified";

/**
 * Both dialects models emit. Single `$` is on because replies use `$Z=XW$`.
 * `backslashDelimiters` accepts `\(...\)` and `\[…\]`. An opening `\[` without
 * a closer stays ordinary Markdown instead of swallowing the rest of the message.
 */
const chatMathOptions = {
  singleDollarTextMath: true,
  backslashDelimiters: true,
} as const;

export const chatRemarkMath: Pluggable = [remarkMath, chatMathOptions];

/** After sanitize, so KaTeX's generated markup is not stripped. */
const chatRehypeKatex: Pluggable = rehypeKatex;

export function withChatMathRehype(plugins: PluggableList): PluggableList {
  if (plugins.includes(chatRehypeKatex)) return plugins;
  return [...plugins, chatRehypeKatex];
}
