import { useLayoutEffect, useRef } from "react";
import type { ExtraProps } from "streamdown";
import { readStrongTextRun } from "@/renderer/markdown/strongTextRuns";

/**
 * Private plain-text run owner. One shallow Fiber restores every stock strong
 * span, avoiding recursive Markdown/Fiber walks. Ordinary strong is untouched.
 */
export function MarkdownStrong(props: Record<string, unknown> & ExtraProps) {
  const { count, text } = readStrongTextRun(props.node);
  if (props.children !== text) throw new TypeError();
  const element = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const root = element.current;
    if (!root) return;
    const owned: (HTMLSpanElement | Text)[] = [];
    const dispose = () => {
      for (let index = owned.length - 1; index >= 0; index -= 1) owned[index]!.remove();
      owned.length = 0;
    };
    try {
      let parent = root;
      for (let index = 1; index < count; index += 1) {
        const span = root.ownerDocument.createElement("span");
        span.className = "font-semibold";
        span.dataset.streamdown = "strong";
        owned.push(span);
        parent.appendChild(span);
        parent = span;
      }
      const leaf = root.ownerDocument.createTextNode(text);
      owned.push(leaf);
      parent.appendChild(leaf);
    } catch (error) {
      dispose();
      throw error;
    }
    return dispose;
  }, [count, text]);

  // Eligible source nodes have no properties. Never forward private metadata
  // or switch this owned shell to React-managed children during replacement.
  return <span ref={element} className="font-semibold" data-streamdown="strong" />;
}
