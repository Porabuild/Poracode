import type { ComponentProps } from "react";
import remarkGfm from "remark-gfm";
import { Streamdown, defaultRehypePlugins, type Components } from "streamdown";

type RehypePlugins = NonNullable<ComponentProps<typeof Streamdown>["rehypePlugins"]>;

// Streamdown ships `raw` (inline HTML) and `sanitize` by default, which is what
// the preview needs. `harden` rewrites hrefs outside its allowlist into
// "[blocked]" spans; external opens are already gated through the anchor below.
const rehypePlugins = Object.entries(defaultRehypePlugins)
  .filter(([key]) => key !== "harden")
  .map(([, plugin]) => plugin) as RehypePlugins;

const remarkPlugins = [remarkGfm];

const components: Components = {
  a({ href, children }) {
    const url = typeof href === "string" ? href : "";
    return (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- markdown anchor; click is intercepted to open externally
      <a
        href={url}
        onClick={(e) => {
          e.preventDefault();
          if (url) window.open(url, "_blank");
        }}
      >
        {children}
      </a>
    );
  },
};

export function MarkdownPreview(props: { content: string; compact?: boolean }) {
  return (
    <div className={`h-full overflow-auto ${props.compact ? "px-5 py-3" : "px-6 py-4"}`}>
      <div
        className={`poracode-markdown-preview mx-auto w-full max-w-3xl ${props.compact ? "poracode-markdown-preview--compact" : ""}`}
      >
        <Streamdown
          mode="static"
          parseIncompleteMarkdown={false}
          controls={false}
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          components={components}
        >
          {props.content}
        </Streamdown>
      </div>
    </div>
  );
}
