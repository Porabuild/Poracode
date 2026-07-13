import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import type { AnchorHTMLAttributes } from "react";

const components = {
  a: ({ children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    // eslint-disable-next-line jsx-a11y/anchor-has-content, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- anchor rendered by react-markdown always has children via props spread
    <a
      {...rest}
      onClick={(e) => {
        e.preventDefault();
        if (rest.href) window.open(rest.href, "_blank");
      }}
    >
      {children}
    </a>
  ),
};

export function MarkdownPreview(props: { content: string; compact?: boolean }) {
  return (
    <div className={`h-full overflow-auto ${props.compact ? "px-5 py-3" : "px-6 py-4"}`}>
      <div
        className={`lightcode-markdown-preview mx-auto w-full max-w-3xl ${props.compact ? "lightcode-markdown-preview--compact" : ""}`}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={components}
        >
          {props.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
