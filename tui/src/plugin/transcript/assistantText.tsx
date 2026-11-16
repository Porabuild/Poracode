import { createMemo, createResource, Show } from "solid-js";
import { BoxRenderable, SyntaxStyle, type MarkdownOptions, type Renderable } from "@opentui/core";
import type { Plugin } from "@opencode/plugin/tui";
import type { TranscriptEntry, TranscriptRowInput } from "@opencode/plugin/tui/context";
import { resolvePart } from "./items";
import { chatMarkdown } from "./chatMarkdown";

/** Top-level entry names per session directory, fetched once through the host client. */
const rootNamesCache = new Map<string, Promise<ReadonlySet<string> | undefined>>();

function loadRootNames(context: Plugin.Context, directory: string) {
  let pending = rootNamesCache.get(directory);
  if (!pending) {
    pending = context.client.file
      .list({ location: { directory }, path: "" })
      .then(
        (listed) =>
          new Set(
            listed.data.map(
              (entry) =>
                entry.path
                  .replace(/[\\/]+$/u, "")
                  .split(/[\\/]/u)
                  .at(-1) ?? entry.path,
            ),
          ),
      )
      .catch(() => {
        // A failed listing is not cached: the next render retries.
        rootNamesCache.delete(directory);
        return undefined;
      });
    rootNamesCache.set(directory, pending);
  }
  return pending;
}

/** Root names for the session directory; undefined until loaded or on failure. */
export function useRootNames(context: Plugin.Context, directory: () => string | undefined) {
  const [names] = createResource(directory, (dir) =>
    dir ? loadRootNames(context, dir) : Promise.resolve(undefined),
  );
  return () => names() ?? undefined;
}

// One derived style per plugin context: every text row shares it, and a theme
// change (new context.syntax identity) rebuilds it once, releasing the old.
const syntaxCache = new WeakMap<Plugin.Context, { source: SyntaxStyle; derived: SyntaxStyle }>();

function assistantSyntax(context: Plugin.Context): SyntaxStyle {
  const cached = syntaxCache.get(context);
  if (cached && cached.source === context.syntax) return cached.derived;
  // Inline chips use border.base — the same pill the user bubble draws;
  // raised.base is nearly the transcript background and reads as no chip.
  const chip = context.theme.border.base;
  const styles: Record<string, object> = {};
  for (const name of context.syntax.getRegisteredNames()) {
    const style = context.syntax.getStyle(name) ?? {};
    if (name === "markup.raw.inline" || name === "markup.raw")
      styles[name] = { ...style, bg: chip };
    else if (name === "markup.link.label") styles[name] = { ...style, bg: chip, underline: false };
    else styles[name] = style;
  }
  // Register the chip overrides even when the theme omits those names.
  for (const name of ["markup.raw.inline", "markup.raw"]) styles[name] ??= { bg: chip };
  styles["markup.link.label"] ??= { bg: chip, underline: false };
  const derived = SyntaxStyle.fromStyles(styles, context.renderer.nativeScene);
  syntaxCache.set(context, { source: context.syntax, derived });
  if (cached)
    void context.renderer
      .idle()
      .catch(() => {})
      .finally(() => cached.derived.destroy());
  return derived;
}

/**
 * The host TextPart presentation with the desktop's chips: the same markdown
 * block, but inline code, file paths, and links render as code spans via
 * `chatMarkdown`, and fenced code sits on a raised panel.
 */
export function AssistantText(props: {
  context: Plugin.Context;
  markdown: TranscriptRowInput["markdown"];
  text: string;
  streaming: boolean;
  root: string | undefined;
  rootNames: ReadonlySet<string> | undefined;
}) {
  const theme = () => props.context.theme;
  const content = createMemo(() => {
    const text = props.text.trim();
    if (!text) return "";
    if (props.markdown.mode === "source") return text;
    return chatMarkdown(text, { root: props.root, rootNames: props.rootNames });
  });
  // renderNode identity rebuilds every markdown block, so it is memoized on the
  // host renderer, the chip color, the renderer context, and the streaming flag.
  const renderNode = createMemo<MarkdownOptions["renderNode"]>(() => {
    const host = props.markdown.renderNode;
    const chip = theme().background.raised.base;
    const renderer = props.context.renderer;
    const streaming = props.streaming;
    const node = (
      token: Parameters<NonNullable<MarkdownOptions["renderNode"]>>[0],
      rctx: Parameters<NonNullable<MarkdownOptions["renderNode"]>>[1],
    ): Renderable | undefined | null => {
      const custom = host?.(token, rctx);
      if (custom) return custom;
      // While streaming, code blocks keep the host's in-place updates — the
      // wrapping panel would force OpenTUI to recreate the block each frame.
      // When streaming ends the renderNode identity changes and every block
      // rebuilds, painting the panels.
      if (token.type !== "code" || streaming) return undefined;
      const rendered = rctx.defaultRender();
      if (!rendered) return rendered;
      // OpenTUI disables renderBefore/renderAfter on CodeRenderable
      // (TextBufferRenderable nativeIntegration.beforeAfter === false), so the
      // raised panel wraps the default block: chip bg with a one-column inset.
      const panel = new BoxRenderable(renderer, {
        backgroundColor: chip,
        paddingLeft: 1,
        width: "100%",
        flexDirection: "column",
        flexShrink: 0,
      });
      panel.add(rendered);
      return panel;
    };
    // The host consults renderNode only for separately rendered blocks.
    (node as { codeBlockOnly?: boolean }).codeBlockOnly = true;
    return node;
  });
  return (
    <Show when={content()}>
      <box paddingLeft={3} flexShrink={0}>
        <markdown
          syntaxStyle={assistantSyntax(props.context)}
          renderNode={renderNode()}
          content={content()}
          streaming={props.streaming}
          internalBlockMode="top-level"
          tableOptions={{ style: "grid", cellPaddingX: 1 }}
          conceal={props.markdown.mode === "rendered"}
          fg={theme().markdown.text}
        />
      </box>
    </Show>
  );
}

type PartEntry = Extract<TranscriptEntry, { type: "part" }>;

/**
 * A part entry's text presentation: assistant text parts render through
 * `AssistantText`; anything else defers to the host's `entry` renderer.
 */
export function PartText(props: {
  context: Plugin.Context;
  input: TranscriptRowInput;
  entry: PartEntry;
}) {
  const sessionID = () => props.input.sessionID;
  const message = () => props.context.data.session.message.get(sessionID(), props.entry.messageID);
  const part = () => resolvePart(message(), props.entry.partID);
  const text = () => {
    const value = part();
    return value?.type === "text" ? value : undefined;
  };
  const directory = () => props.context.data.session.get(sessionID())?.location.directory;
  const rootNames = useRootNames(props.context, directory);
  const streaming = () => {
    const msg = message();
    return msg?.type === "assistant" && msg.time.completed === undefined;
  };
  return (
    <Show when={text()} fallback={props.input.entry(props.entry)}>
      {(value) => (
        <AssistantText
          context={props.context}
          markdown={props.input.markdown}
          text={value().text}
          streaming={streaming()}
          root={directory()}
          rootNames={rootNames()}
        />
      )}
    </Show>
  );
}
