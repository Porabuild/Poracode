import { createMemo, createSignal, For, Show } from "solid-js";
import type { MouseEvent, RGBA } from "@opentui/core";
import type { SessionMessageUser } from "@opencode/client";
import type { Plugin } from "@opencode/plugin/tui";
import type { TranscriptRowInput } from "@opencode/plugin/tui/context";
import { textWidth } from "../textFit";
import { useRootNames } from "./assistantText";
import { useDisclosure } from "./disclosure";
import { tokenizeUserText, type UserTextSegment } from "./userText";

const USER_LINES = 4;

type Props = { readonly context: Plugin.Context; readonly input: TranscriptRowInput };

function wrappedLines(text: string, width: number) {
  const columns = Math.max(1, width);
  return text
    .split("\n")
    .reduce((total, line) => total + Math.max(1, Math.ceil(textWidth(line) / columns)), 0);
}

function BubbleSegment(props: { segment: UserTextSegment; fg: RGBA; chipBg: RGBA; codeFg: RGBA }) {
  const segment = props.segment;
  if (segment.kind === "text") return <>{segment.text}</>;
  return (
    <span style={{ bg: props.chipBg, fg: segment.kind === "code" ? props.codeFg : props.fg }}>
      {" "}
      {segment.kind === "code" ? segment.text : segment.label}{" "}
    </span>
  );
}

/** The desktop user bubble: a raised, hairline-bordered surface that clamps long prompts. */
export function UserBubble(props: Props & { message: SessionMessageUser }) {
  const theme = () => props.context.theme;
  const [hover, setHover] = createSignal(false);
  const text = () => props.message.text.replace(/\s+$/u, "");
  const pending = () =>
    props.context.data.session.pending
      .list(props.input.sessionID)
      .some((item) => item.id === props.message.id);
  const chips = createMemo(() => [
    ...(props.message.skills ?? []).map((skill) => ({ label: "skill", name: skill.name })),
    ...(props.message.files ?? []).map((file) => ({
      label: file.mime.startsWith("image/")
        ? "image"
        : file.mime === "application/x-directory"
          ? "dir"
          : "file",
      name: file.name ?? (file.source.type === "uri" ? file.source.uri : "attachment"),
    })),
  ]);
  const directory = () => props.context.data.session.get(props.input.sessionID)?.location.directory;
  const rootNames = useRootNames(props.context, directory);
  const segments = createMemo(() => tokenizeUserText(text(), rootNames()));
  const disclosure = useDisclosure(
    props.context,
    props.input.disclosure,
    () => `poracode:user:${props.message.id}`,
    () => false,
  );
  const overflow = createMemo(() => wrappedLines(text(), props.input.width - 4) > USER_LINES);
  const background = () =>
    hover() ? theme().decrease(theme().background.raised.base) : theme().background.raised.base;
  const fg = () => (pending() ? theme().text.muted : theme().text.base);
  return (
    <Show when={text() || chips().length}>
      <box
        border={true}
        borderStyle="rounded"
        borderColor={theme().border.base}
        backgroundColor={background()}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="column"
        flexShrink={0}
        onMouseOver={() => setHover(true)}
        onMouseOut={() => setHover(false)}
        onMouseUp={() => props.input.actions(props.message.id)}
      >
        <Show when={chips().length}>
          <box flexDirection="row" gap={1} flexWrap="wrap">
            <For each={chips()}>
              {(chip) => (
                <text>
                  <span style={{ bg: theme().border.base, fg: theme().text.base }}>
                    {" "}
                    {chip.label}{" "}
                  </span>
                  <span style={{ fg: theme().text.muted }}> {chip.name}</span>
                </text>
              )}
            </For>
          </box>
        </Show>
        <Show when={text()}>
          <text
            fg={fg()}
            {...(overflow() && !disclosure.expanded() ? { maxHeight: USER_LINES } : {})}
          >
            <For each={segments()}>
              {(segment) => (
                <BubbleSegment
                  segment={segment}
                  fg={fg()}
                  chipBg={theme().border.base}
                  codeFg={theme().markdown.code}
                />
              )}
            </For>
          </text>
        </Show>
        {props.input.images(props.message.id)}
        <Show when={overflow()}>
          <box
            onMouseUp={(event: MouseEvent) => {
              event.stopPropagation();
              disclosure.toggle();
            }}
          >
            <text fg={theme().text.muted}>
              {disclosure.expanded() ? "▴ Show less" : "▾ Show more"}
            </text>
          </box>
        </Show>
      </box>
    </Show>
  );
}
