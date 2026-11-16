import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  Show,
  Switch,
} from "solid-js";
import { infoStringToFiletype, TextAttributes, type Renderable } from "@opentui/core";
import type {
  SessionMessageAssistant,
  SessionMessageAssistantTool,
  SessionMessageInfo,
  SessionMessageUser,
} from "@opencode/client";
import type { Plugin } from "@opencode/plugin/tui";
import type {
  TranscriptEntry,
  TranscriptRow as Row,
  TranscriptRowInput,
} from "@opencode/plugin/tui/context";
import type { ProjectLocation } from "@/shared/contracts";
import { questionAnswerItemPayloadSchema } from "@/shared/contracts/runtimeEvent";
import { endTruncate, headTruncate, textWidth } from "../textFit";
import {
  analyzeEditToolGroup,
  buildSubAgentProgressParts,
  delegatedAgentResultText,
  deriveToolDisplay,
  extractAcpDiffResultPart,
  formatElapsed,
  getReasoningInlinePreview,
  getReasoningLastLine,
  getReasoningPreview,
  getToolLikePayload,
  i18n,
  isCrewRun,
  isCrossagentTool,
  isDelegatedAgentTool,
  isWorkflowTool,
  pickResultDetail,
  pickWorkflowResultLabel,
  readSubAgentLiveLabel,
  segmentToolGroupRows,
  splitPath,
  summarizeWorkflowResult,
  toProjectRelativeDisplayPath,
  workflowResultView,
  type RuntimeChatItem,
  type SameFileEditGroupSummary,
  type WorkflowResultList,
  type WorkflowResultView,
} from "../../desktop/presentation";
import { GLYPH } from "./glyphs";
import { PartText } from "./assistantText";
import { useDisclosure as sharedDisclosure } from "./disclosure";
import { UserBubble } from "./userBubble";
import {
  isVisibleItem,
  joinsRun,
  poracodeItemOf,
  projectLocation,
  reasoningChatItem,
  resolvePart,
  toolChatItem,
  turnStartedAt,
} from "./items";
import {
  diffStat,
  groupHeader,
  normalizeTitle,
  toolRow,
  type MetaPart,
  type RowTitle,
  type Tone,
  type ToolBody,
} from "./model";

/** The host's markdown column; tool activity nests two columns further in, as on desktop. */
const PROSE = 3;
const ROW = PROSE + 2;
/** The expanded group's rail insets inline rows by marginLeft ROW+1 + paddingLeft 1. */
const GROUP_RAIL = ROW + 2;
/** The desktop `TOOL_CALL_GROUP_MAX_VISIBLE_ROWS`. */
const GROUP_ROWS = 8;
const BODY_LINES = 40;

type Props = { readonly context: Plugin.Context; readonly input: TranscriptRowInput };
type PartEntry = Extract<TranscriptEntry, { type: "part" }>;
type GroupRowData = Extract<Row, { type: "group" }>;
type Member = {
  readonly key: string;
  readonly entry: TranscriptEntry;
  /** The desktop item; absent when the host presents the entry. */
  readonly item?: RuntimeChatItem;
  readonly part?: SessionMessageAssistantTool;
  readonly hidden: boolean;
  readonly joins: boolean;
};
type Segment =
  | { readonly key: string; readonly kind: "run"; readonly members: readonly Member[] }
  | { readonly key: string; readonly kind: "single"; readonly member: Member };

export function TranscriptRow(props: Props) {
  const row = () => props.input.row;
  return (
    <Switch fallback={props.input.fallback()}>
      <Match when={row().type === "group"}>
        <GroupRow {...props} />
      </Match>
      <Match when={row().type === "part"}>
        <PartRow {...props} entry={row() as PartEntry} />
      </Match>
      <Match when={row().type === "message"}>
        <MessageRow {...props} messageID={(row() as { messageID: string }).messageID} />
      </Match>
      <Match when={row().type === "assistant-footer"}>
        <TurnFooter {...props} messageID={(row() as { messageID: string }).messageID} />
      </Match>
    </Switch>
  );
}

function useHidden(props: Props, hidden: () => boolean) {
  createEffect(() => props.input.hide(hidden()));
  onCleanup(() => props.input.hide(false));
}

function messageOf(props: Props, messageID: string) {
  return props.context.data.session.message.get(props.input.sessionID, messageID);
}

function useLocation(props: Props) {
  return createMemo(() =>
    projectLocation(props.context.data.session.get(props.input.sessionID)?.location.directory),
  );
}

/** Disclosure kept in the host's per-session store; the anchor keeps the toggled row in view. */
function useDisclosure(props: Props, key: () => string, fallback: () => boolean) {
  return sharedDisclosure(props.context, props.input.disclosure, key, fallback);
}

function member(props: Props, entry: TranscriptEntry, tail: boolean): Member {
  const key =
    entry.type === "part"
      ? `${entry.messageID}:${entry.partID}`
      : `${entry.type}:${JSON.stringify(entry)}`;
  if (entry.type !== "part") return { key, entry, hidden: false, joins: false };
  const message = messageOf(props, entry.messageID);
  const part = resolvePart(message, entry.partID);
  if (part?.type === "tool") {
    // Only a running session keeps an open tool live; a part left "running"
    // past its turn reads as the desktop's plain completed row.
    const live = props.context.data.session.status(props.input.sessionID) === "running";
    const item = toolChatItem(part, live);
    if (!item) return { key, entry, hidden: false, joins: false };
    return { key, entry, item, part, hidden: !isVisibleItem(item), joins: joinsRun(item) };
  }
  if (part?.type === "reasoning" && message?.type === "assistant") {
    // Only the live tail can still be thinking; history without completion marks reads as done.
    const done =
      !tail ||
      part.time?.completed !== undefined ||
      message.time.completed !== undefined ||
      message.finish !== undefined;
    const text = part.text.replace("[REDACTED]", "").trim();
    return { key, entry, item: reasoningChatItem(key, text, done), hidden: !text, joins: true };
  }
  return { key, entry, hidden: false, joins: false };
}

/** Desktop grouping inside a host row: runs of two or more joinable items become one group. */
function segments(
  members: readonly Member[],
  blocked: (entry: TranscriptEntry) => boolean,
): Segment[] {
  const result: Segment[] = [];
  let run: Member[] = [];
  const flush = () => {
    if (run.length === 1) result.push({ key: run[0]!.key, kind: "single", member: run[0]! });
    if (run.length > 1) result.push({ key: run[0]!.key, kind: "run", members: run });
    run = [];
  };
  for (const value of members) {
    if (value.hidden) continue;
    if (value.joins && value.item && !blocked(value.entry)) {
      run.push(value);
      continue;
    }
    flush();
    result.push({ key: value.key, kind: "single", member: value });
  }
  flush();
  return result;
}

function GroupRow(props: Props) {
  const group = () => props.input.row as GroupRowData;
  const members = createMemo(() =>
    group().entries.map((entry, index, all) =>
      member(props, entry, props.input.live && index === all.length - 1),
    ),
  );
  const parts = createMemo(() =>
    segments(members(), (entry) =>
      group().pending.some(
        (ref) =>
          entry.type === "part" && ref.messageID === entry.messageID && ref.partID === entry.partID,
      ),
    ),
  );
  const byKey = createMemo(() => new Map(parts().map((segment) => [segment.key, segment])));
  const keys = createMemo(() => parts().map((segment) => segment.key));
  useHidden(props, () => keys().length === 0);
  return (
    <box flexDirection="column" gap={1}>
      <For each={keys()}>
        {(key) => (
          <Show when={byKey().get(key)}>
            {(segment) => (
              <Show
                when={
                  segment().kind === "run"
                    ? (segment() as Extract<Segment, { kind: "run" }>)
                    : undefined
                }
                fallback={
                  <MemberRow
                    {...props}
                    member={(segment() as Extract<Segment, { kind: "single" }>).member}
                  />
                }
              >
                {(run) => (
                  <ToolGroup
                    {...props}
                    groupKey={key}
                    members={run().members}
                    live={props.input.live && keys().at(-1) === key}
                  />
                )}
              </Show>
            )}
          </Show>
        )}
      </For>
    </box>
  );
}

function MemberRow(props: Props & { member: Member }) {
  return (
    <Show when={props.member.item} fallback={memberFallback(props, props.member.entry)}>
      {(item) => <ItemRow {...props} item={item()} part={props.member.part} />}
    </Show>
  );
}

/** Text parts render through the plugin's markdown; everything else uses the host entry. */
function memberFallback(props: Props, entry: TranscriptEntry) {
  return entry.type === "part" ? (
    <PartText context={props.context} input={props.input} entry={entry} />
  ) : (
    props.input.entry(entry)
  );
}

function PartRow(props: Props & { entry: PartEntry }) {
  const value = createMemo(() => member(props, props.entry, props.input.live));
  useHidden(props, () => value().hidden);
  const part = createMemo(() =>
    resolvePart(messageOf(props, props.entry.messageID), props.entry.partID),
  );
  return (
    <Switch fallback={value().hidden ? null : memberFallback(props, props.entry)}>
      <Match when={part()?.type === "text"}>
        <PartText context={props.context} input={props.input} entry={props.entry} />
      </Match>
      <Match when={!value().hidden}>
        <MemberRow {...props} member={value()} />
      </Match>
    </Switch>
  );
}

/** A standalone item: the desktop's accordion row, sub-agent pill, or reasoning toggle. */
function ItemRow(props: Props & { item: RuntimeChatItem; part?: SessionMessageAssistantTool }) {
  return (
    <Switch fallback={<ToolRow {...props} />}>
      <Match when={props.item.type === "reasoning"}>
        <ReasoningRow {...props} indent={ROW} />
      </Match>
      <Match
        when={
          props.item.type === "tool_call" && isDelegatedAgentTool(getToolLikePayload(props.item))
        }
      >
        <SubagentRow {...props} />
      </Match>
      <Match when={props.item.type === "question_answer" ? props.item : undefined}>
        {(item) => <QuestionAnswerRow {...props} item={item()} />}
      </Match>
    </Switch>
  );
}

function toneColor(context: Plugin.Context, tone: Tone) {
  const theme = context.theme;
  if (tone === "danger" || tone === "removed") return theme.text.feedback.error.base;
  if (tone === "added") return theme.text.feedback.success.base;
  return theme.text.muted;
}

function displayPath(path: string, location: ProjectLocation | undefined) {
  const relative = location ? toProjectRelativeDisplayPath(path, location) : path;
  const { dirWithSlash, basename } = splitPath(relative);
  return { basename, dir: dirWithSlash.replace(/[\\/]$/u, "") };
}

/**
 * One quiet row: icon, title, and trailing meta, muted at rest and lit on
 * hover like the desktop rows. Files read `<basename> <muted dir>`.
 */
function RowLine(props: {
  context: Plugin.Context;
  glyph: string;
  title: RowTitle;
  meta: readonly MetaPart[];
  running: boolean;
  hover: boolean;
  expanded?: boolean;
  expandable: boolean;
  width: number;
  location: ProjectLocation | undefined;
  italic?: boolean;
  detail?: string;
}) {
  const theme = () => props.context.theme;
  const color = () => (props.hover || props.running ? theme().text.base : theme().text.muted);
  const path = createMemo(() =>
    props.title.file ? displayPath(props.title.file, props.location) : undefined,
  );
  const metaWidth = () =>
    props.meta.reduce(
      (width, part, index) => width + (index === 0 ? 3 : 1) + textWidth(part.text),
      0,
    );
  const prefixText = () =>
    endTruncate(props.title.prefix, props.width - 4 - metaWidth() - (props.expandable ? 2 : 0));
  // The basename keeps priority over its directory: it end-truncates into
  // whatever the prefix/meta leave, and the muted dir only shows when at
  // least 8 columns remain after it.
  const afterPrefix = () =>
    Math.max(
      0,
      props.width - 4 - textWidth(prefixText()) - metaWidth() - (props.expandable ? 2 : 0),
    );
  const basenameText = () => (path() ? endTruncate(path()!.basename, afterPrefix()) : "");
  const dirRoom = () => afterPrefix() - textWidth(basenameText());
  const indicator = () => (props.expanded ? " ▾" : props.expandable && props.hover ? " ▸" : "");
  return (
    <text wrapMode="none" attributes={props.italic ? TextAttributes.ITALIC : undefined}>
      <span style={{ fg: color() }}>{props.glyph} </span>
      <span style={{ fg: color() }}>{prefixText()}</span>
      <Show when={path()}>
        {(value) => (
          <>
            <span style={{ fg: theme().text.base }}>{basenameText()}</span>
            <Show when={value().dir && dirRoom() >= 8}>
              <span style={{ fg: theme().text.muted }}>
                {" "}
                {headTruncate(value().dir!, dirRoom() - 1)}
              </span>
            </Show>
          </>
        )}
      </Show>
      <Show when={props.title.target}>
        {(target) => <span style={{ fg: color() }}>{headTruncate(target(), afterPrefix())}</span>}
      </Show>
      <Show when={props.detail}>
        {(detail) => (
          <>
            <span style={{ fg: theme().text.muted }}> · </span>
            <span style={{ fg: theme().text.muted }}>{detail()}</span>
          </>
        )}
      </Show>
      <For each={props.meta}>
        {(part, index) => (
          <>
            <span style={{ fg: theme().text.muted }}>{index() === 0 ? " · " : " "}</span>
            <span style={{ fg: toneColor(props.context, part.tone) }}>{part.text}</span>
          </>
        )}
      </For>
      <span style={{ fg: theme().text.muted }}>{indicator()}</span>
    </text>
  );
}

function Clickable(props: {
  onToggle?: (anchor: Renderable | null) => void;
  onHover: (value: boolean) => void;
  paddingLeft?: number;
  children: unknown;
}) {
  const [node, setNode] = createSignal<Renderable | null>(null);
  return (
    <box
      ref={setNode}
      paddingLeft={props.paddingLeft}
      onMouseOver={() => props.onToggle && props.onHover(true)}
      onMouseOut={() => props.onHover(false)}
      onMouseUp={() => props.onToggle?.(node())}
    >
      {props.children as never}
    </box>
  );
}

/** The desktop `ChatItemAccordion`: a header row whose body opens on click. */
function ToolRow(props: Props & { item: RuntimeChatItem; inline?: boolean; indent?: number }) {
  const location = useLocation(props);
  const model = createMemo(() => toolRow(props.item, props.inline === true));
  const [hover, setHover] = createSignal(false);
  const disclosure = useDisclosure(
    props,
    () => `poracode:item:${props.item.id}`,
    () => false,
  );
  return (
    <Show when={model()}>
      {(row) => (
        <box flexDirection="column" flexShrink={0}>
          <Clickable
            paddingLeft={props.indent ?? ROW}
            onHover={setHover}
            {...(row().hasBody ? { onToggle: disclosure.toggle } : {})}
          >
            <RowLine
              context={props.context}
              glyph={row().glyph}
              title={row().title}
              meta={row().meta}
              running={row().running}
              hover={hover()}
              expanded={row().hasBody && disclosure.expanded()}
              expandable={row().hasBody}
              width={props.input.width - (props.indent ?? ROW) - (props.inline ? GROUP_RAIL : 0)}
              location={location()}
            />
          </Clickable>
          <Show when={row().hasBody && disclosure.expanded()}>
            <Body context={props.context} body={row().body()} indent={(props.indent ?? ROW) + 2} />
          </Show>
        </box>
      )}
    </Show>
  );
}

function limitLines(text: string) {
  const lines = text.replace(/\s+$/u, "").split("\n");
  return {
    text: lines.slice(0, BODY_LINES).join("\n"),
    hidden: Math.max(0, lines.length - BODY_LINES),
  };
}

function filetypeOf(language: string | undefined, path: string | undefined) {
  const info = language ?? path?.split(/[\\/]/u).pop()?.split(".").pop();
  return info ? infoStringToFiletype(info) : undefined;
}

function CodeBlock(props: {
  context: Plugin.Context;
  text: string;
  language?: string;
  path?: string;
}) {
  const theme = () => props.context.theme;
  const limited = createMemo(() => limitLines(props.text));
  const filetype = createMemo(() => filetypeOf(props.language, props.path));
  return (
    <box flexDirection="column" flexShrink={0}>
      <Show when={filetype()} fallback={<text fg={theme().text.muted}>{limited().text}</text>}>
        {(value) => (
          <code
            filetype={value()}
            content={limited().text}
            syntaxStyle={props.context.syntax}
            fg={theme().text.base}
            conceal={false}
          />
        )}
      </Show>
      <Show when={limited().hidden > 0}>
        <text fg={theme().text.muted}>… {limited().hidden} more lines</text>
      </Show>
    </box>
  );
}

function DiffBlock(props: { context: Plugin.Context; text: string; path: string }) {
  const theme = () => props.context.theme;
  return (
    <diff
      diff={props.text}
      view="unified"
      filetype={filetypeOf(undefined, props.path)}
      syntaxStyle={props.context.syntax}
      showLineNumbers={true}
      width="100%"
      wrapMode="word"
      fg={theme().text.base}
      addedBg={theme().diff.background.added}
      removedBg={theme().diff.background.removed}
      contextBg={theme().diff.background.context}
      addedSignColor={theme().diff.highlight.added}
      removedSignColor={theme().diff.highlight.removed}
      lineNumberFg={theme().diff.lineNumber.text}
      lineNumberBg={theme().diff.background.context}
      addedLineNumberBg={theme().diff.lineNumber.background.added}
      removedLineNumberBg={theme().diff.lineNumber.background.removed}
    />
  );
}

function Body(props: { context: Plugin.Context; body: ToolBody | undefined; indent: number }) {
  const theme = () => props.context.theme;
  return (
    <Show when={props.body}>
      {(body) => (
        <box
          paddingLeft={props.indent}
          paddingTop={1}
          paddingBottom={1}
          flexDirection="column"
          gap={1}
        >
          <Switch>
            <Match
              when={
                body().kind === "diff" ? (body() as Extract<ToolBody, { kind: "diff" }>) : undefined
              }
            >
              {(diff) => (
                <DiffBlock context={props.context} text={diff().text} path={diff().path} />
              )}
            </Match>
            <Match
              when={
                body().kind === "code" ? (body() as Extract<ToolBody, { kind: "code" }>) : undefined
              }
            >
              {(code) => (
                <CodeBlock
                  context={props.context}
                  text={code().text}
                  {...(code().language ? { language: code().language } : {})}
                  {...(code().path ? { path: code().path } : {})}
                />
              )}
            </Match>
            <Match
              when={
                body().kind === "sections"
                  ? (body() as Extract<ToolBody, { kind: "sections" }>)
                  : undefined
              }
            >
              {(sections) => (
                <For each={sections().sections}>
                  {(section) => (
                    <box flexDirection="column">
                      <text fg={theme().text.muted}>{section.label}</text>
                      <CodeBlock
                        context={props.context}
                        text={section.text}
                        {...(section.language ? { language: section.language } : {})}
                      />
                    </box>
                  )}
                </For>
              )}
            </Match>
          </Switch>
        </box>
      )}
    </Show>
  );
}

/** The desktop `Reasoning` toggle, or `ReasoningInline` inside a group. */
function ReasoningRow(props: Props & { item: RuntimeChatItem; indent: number; inline?: boolean }) {
  const theme = () => props.context.theme;
  const [hover, setHover] = createSignal(false);
  const text = () => props.item.streams.reasoning_text ?? "";
  const running = () => props.item.state !== "completed";
  const disclosure = useDisclosure(
    props,
    () => `poracode:item:${props.item.id}`,
    () => false,
  );
  // Inline rows sit inside the group rail, a few columns past the row indent.
  const room = () => props.input.width - (props.inline ? GROUP_RAIL : props.indent) - 14;
  const preview = () =>
    endTruncate(
      disclosure.expanded()
        ? ""
        : running()
          ? getReasoningLastLine(text())
          : props.inline
            ? getReasoningInlinePreview(text())
            : getReasoningPreview(text()),
      room(),
    );
  return (
    <box flexDirection="column" flexShrink={0}>
      <Clickable paddingLeft={props.indent} onHover={setHover} onToggle={disclosure.toggle}>
        <text wrapMode="none" attributes={TextAttributes.ITALIC}>
          <span style={{ fg: hover() || running() ? theme().text.base : theme().text.muted }}>
            {GLYPH.thought} {running() ? "Thinking" : "Thought"}
          </span>
          <Show when={preview()}>
            <span style={{ fg: theme().text.muted }}>{props.inline ? " · " : " "}</span>
            <span style={{ fg: props.inline ? theme().text.muted : theme().text.faint }}>
              {preview()}
            </span>
          </Show>
          <span style={{ fg: theme().text.muted }}>
            {disclosure.expanded() ? " ▾" : hover() ? " ▸" : ""}
          </span>
        </text>
      </Clickable>
      <Show when={disclosure.expanded() && text()}>
        <box paddingLeft={props.indent + 2} paddingTop={1}>
          <code
            filetype="markdown"
            drawUnstyledText={false}
            streaming={running()}
            syntaxStyle={props.context.syntax}
            content={text()}
            conceal={true}
            fg={theme().text.muted}
          />
        </box>
      </Show>
    </box>
  );
}

/** The desktop `ToolCallGroup`: one summary for a run of activity, open while it is the live tail. */
function ToolGroup(props: Props & { groupKey: string; members: readonly Member[]; live: boolean }) {
  const theme = () => props.context.theme;
  const location = useLocation(props);
  const [hover, setHover] = createSignal(false);
  const items = createMemo(() => props.members.map((value) => value.item!));
  const header = createMemo(() => groupHeader(items()));
  const disclosure = useDisclosure(
    props,
    () => `poracode:group:${props.groupKey}`,
    // Edit-only groups stay collapsed while live; their summary already says everything.
    () => props.live && !analyzeEditToolGroup(items()).editOnly,
  );
  const showAll = useDisclosure(
    props,
    () => `poracode:all:${props.groupKey}`,
    () => false,
  );
  const rows = createMemo(() => segmentToolGroupRows(items()));
  const overflow = () => header().kind === "sections" && rows().length > GROUP_ROWS;
  const visible = createMemo(() =>
    overflow() && !showAll.expanded() ? rows().slice(-GROUP_ROWS) : rows(),
  );
  const byKey = createMemo(
    () =>
      new Map(
        visible().map((row) => [
          row.kind === "same-file-edits" ? row.items[0]!.id : row.item.id,
          row,
        ]),
      ),
  );
  const keys = createMemo(() => [...byKey().keys()]);
  return (
    <box flexDirection="column" flexShrink={0}>
      <Clickable paddingLeft={ROW} onHover={setHover} onToggle={disclosure.toggle}>
        <Show
          when={
            header().kind === "sections"
              ? (header() as Extract<ReturnType<typeof groupHeader>, { kind: "sections" }>)
              : undefined
          }
          fallback={
            <SameFileTitle
              context={props.context}
              summary={header() as Extract<ReturnType<typeof groupHeader>, { kind: "same-file" }>}
              hover={hover()}
              expanded={disclosure.expanded()}
              location={location()}
              width={props.input.width - ROW}
            />
          }
        >
          {(value) => (
            <text wrapMode="none">
              <For each={value().sections}>
                {(section, index) => (
                  <>
                    <Show when={index() > 0}>
                      <span style={{ fg: theme().text.muted }}> · </span>
                    </Show>
                    <span
                      style={{
                        fg:
                          hover() || (!disclosure.expanded() && section.running)
                            ? theme().text.base
                            : theme().text.muted,
                      }}
                    >
                      {section.glyph} {section.count} {section.label}
                    </span>
                    <For each={section.meta}>
                      {(part) => (
                        <span style={{ fg: toneColor(props.context, part.tone) }}>
                          {" "}
                          {part.text}
                        </span>
                      )}
                    </For>
                  </>
                )}
              </For>
              <span style={{ fg: theme().text.muted }}>
                {disclosure.expanded() ? " ▾" : hover() ? " ▸" : ""}
              </span>
            </text>
          )}
        </Show>
      </Clickable>
      <Show when={disclosure.expanded()}>
        <box
          marginLeft={ROW + 1}
          paddingLeft={1}
          border={["left"]}
          borderStyle="single"
          borderColor={theme().border.base}
          flexDirection="column"
        >
          <Show when={overflow()}>
            <Clickable onHover={() => {}} onToggle={showAll.toggle}>
              <text fg={theme().text.muted}>{showAll.expanded() ? "Show less" : "Show all"}</text>
            </Clickable>
          </Show>
          <For each={keys()}>
            {(key) => (
              <Show when={byKey().get(key)}>
                {(row) => (
                  <Show
                    when={
                      row().kind === "same-file-edits"
                        ? (row() as Extract<
                            ReturnType<typeof segmentToolGroupRows>[number],
                            { kind: "same-file-edits" }
                          >)
                        : undefined
                    }
                    fallback={
                      <InlineItem
                        {...props}
                        item={
                          (
                            row() as Extract<
                              ReturnType<typeof segmentToolGroupRows>[number],
                              { kind: "item" }
                            >
                          ).item
                        }
                      />
                    }
                  >
                    {(run) => (
                      <SameFileRun
                        {...props}
                        items={run().items}
                        summary={run().summary}
                        location={location()}
                      />
                    )}
                  </Show>
                )}
              </Show>
            )}
          </For>
        </box>
      </Show>
    </box>
  );
}

function InlineItem(props: Props & { item: RuntimeChatItem }) {
  return (
    <Show
      when={props.item.type !== "reasoning"}
      fallback={<ReasoningRow {...props} indent={0} inline />}
    >
      <ToolRow {...props} inline indent={0} />
    </Show>
  );
}

function SameFileTitle(props: {
  context: Plugin.Context;
  summary: { count: number; file: string; meta: MetaPart[] };
  hover: boolean;
  expanded: boolean;
  location: ProjectLocation | undefined;
  width: number;
}) {
  return (
    <RowLine
      context={props.context}
      glyph={GLYPH.edit}
      title={{
        prefix: `${props.summary.count} ${props.summary.count === 1 ? "edit" : "edits"}: `,
        file: props.summary.file,
      }}
      meta={props.summary.meta}
      running={false}
      hover={props.hover}
      expanded={props.expanded}
      expandable={true}
      width={props.width}
      location={props.location}
    />
  );
}

/** Consecutive edits of one file merged into a single `N edits: path` row with their combined diff. */
function SameFileRun(
  props: Props & {
    items: readonly RuntimeChatItem[];
    summary: SameFileEditGroupSummary;
    location: ProjectLocation | undefined;
  },
) {
  const [hover, setHover] = createSignal(false);
  const disclosure = useDisclosure(
    props,
    () => `poracode:edits:${props.items[0]!.id}`,
    () => false,
  );
  const diff = createMemo(() =>
    props.items
      .filter((item) => item.type !== "reasoning")
      .map(
        (item) =>
          extractAcpDiffResultPart(
            item.type === "file_change" ? item.payload : getToolLikePayload(item),
          ).text,
      )
      .filter(Boolean)
      .join("\n"),
  );
  return (
    <box flexDirection="column" flexShrink={0}>
      <Clickable onHover={setHover} onToggle={disclosure.toggle}>
        <SameFileTitle
          context={props.context}
          summary={{
            count: props.summary.count,
            file: props.summary.path,
            meta: diffStat(props.summary.diffSummary),
          }}
          hover={hover()}
          expanded={disclosure.expanded()}
          location={props.location}
          width={props.input.width - GROUP_RAIL}
        />
      </Clickable>
      <Show when={disclosure.expanded()}>
        <Show
          when={diff()}
          fallback={<For each={props.items}>{(item) => <InlineItem {...props} item={item} />}</For>}
        >
          <box paddingLeft={2} paddingTop={1} paddingBottom={1}>
            <DiffBlock context={props.context} text={diff()} path={props.summary.path} />
          </box>
        </Show>
      </Show>
    </box>
  );
}

/** The desktop sub-agent pill; opening it shows the agent's own session. */
function SubagentRow(props: Props & { item: RuntimeChatItem; part?: SessionMessageAssistantTool }) {
  const [hover, setHover] = createSignal(false);
  const payload = () => getToolLikePayload(props.item);
  const childID = () => {
    const state = props.part?.state;
    const id = state && state.status !== "streaming" ? state.metadata?.sessionID : undefined;
    return typeof id === "string" ? id : undefined;
  };
  const status = () => payload()?.subAgentStatus ?? payload()?.crossagentStatus;
  // Persisted "running" markers only count while the parent session runs;
  // the child session's own status stays live either way — background agents
  // outlive the parent turn.
  const parentRunning = () =>
    props.context.data.session.status(props.input.sessionID) === "running";
  const running = () =>
    ((props.item.state !== "completed" || status() === "running") && parentRunning()) ||
    (childID() !== undefined && props.context.data.session.status(childID()!) === "running");
  const title = createMemo(() => {
    const value = payload();
    return value ? normalizeTitle(deriveToolDisplay(value).title) : "Agent";
  });
  // The desktop pill's right label (SubAgentToolCall resolveStatus): live
  // progress parts while running, then cancelled/paused/error, persisted
  // progress meta, else "done".
  const meta = (): MetaPart[] => {
    const value = payload();
    const progress = value?.progress;
    // The desktop joins progress parts with " · " — one muted MetaPart keeps
    // RowLine's space-join from flattening them.
    const join = (parts: { label: string }[]) =>
      parts.length
        ? [{ text: parts.map((part) => part.label).join(" · "), tone: "muted" as const }]
        : [];
    if (running()) {
      return join(
        buildSubAgentProgressParts({
          progress,
          liveLabel: readSubAgentLiveLabel(progress, title()),
          ...(progress?.stepCount !== undefined ? { stepCount: progress.stepCount } : {}),
          includeStepCount: true,
        }),
      );
    }
    if (value?.subAgentStatus === "cancelled" || value?.crossagentStatus === "cancelled")
      return [{ text: "cancelled", tone: "muted" }];
    if (value?.subAgentStatus === "paused") return [{ text: "Paused", tone: "muted" }];
    if (value?.status === "error" || status() === "failed")
      return [{ text: GLYPH.error, tone: "danger" }];
    const parts = join(buildSubAgentProgressParts({ progress }));
    return parts.length ? parts : [{ text: "done", tone: "muted" }];
  };
  const isWorkflow = () => {
    const value = payload();
    return value ? isWorkflowTool(value) : false;
  };
  const resultKind = () => {
    const value = payload();
    if (value && isCrewRun(value)) return "crew" as const;
    if (value && isCrossagentTool(value)) return "crossagent" as const;
    return "subagent" as const;
  };
  // The completed agent's answer, behind the desktop's result disclosure.
  // Mirrors SubAgentToolCall's isCompleted — a finished item whose payload is
  // not literally running still discloses, failures included.
  const resultText = createMemo(() => {
    const value = payload();
    if (!value || running()) return "";
    if (props.item.state !== "completed" || value.status === "running") return "";
    return delegatedAgentResultText(value, i18n._);
  });
  // Workflow results render like the desktop's WorkflowResultGroup: a grouped
  // list behind a toggle, non-list JSON as a code block, anything else inline.
  const workflowView = createMemo<WorkflowResultView>(() =>
    isWorkflow() ? workflowResultView(resultText()) : { kind: "none" },
  );
  const workflowList = () => {
    const view = workflowView();
    return view.kind === "list" ? view : undefined;
  };
  const workflowJson = () => {
    const view = workflowView();
    return view.kind === "json" ? view.json : undefined;
  };
  const workflowPlain = () => {
    const view = workflowView();
    return view.kind === "text" ? view.text : undefined;
  };
  const resultLabel = () =>
    resultKind() === "crew"
      ? "Crew Result"
      : resultKind() === "crossagent"
        ? "Crossagent Result"
        : "Subagent Result";
  const resultDisclosure = useDisclosure(
    props,
    () => `poracode:result:${props.item.id}`,
    () => false,
  );
  const [resultHover, setResultHover] = createSignal(false);
  const theme = () => props.context.theme;
  return (
    <box flexDirection="column" flexShrink={0}>
      <Clickable
        paddingLeft={ROW}
        onHover={setHover}
        {...(childID()
          ? {
              onToggle: () => {
                if (props.context.renderer.getSelection()?.getSelectedText()) return;
                props.context.ui.router.navigate({
                  type: "session",
                  sessionID: childID()!,
                });
              },
            }
          : {})}
      >
        <RowLine
          context={props.context}
          glyph={GLYPH.agent}
          title={{ prefix: title() }}
          meta={meta()}
          running={running()}
          hover={hover()}
          expandable={false}
          width={props.input.width - ROW}
          location={undefined}
        />
      </Clickable>
      {/* A tool_use_error workflow result classifies as "none" — render no chrome at all. */}
      <Show when={resultText() && (!isWorkflow() || workflowView().kind !== "none")}>
        <box paddingTop={1} flexDirection="column">
          <Show when={!isWorkflow() || workflowList()}>
            <Clickable
              paddingLeft={ROW}
              onHover={setResultHover}
              onToggle={resultDisclosure.toggle}
            >
              <text
                fg={resultHover() ? theme().text.base : theme().text.muted}
                attributes={TextAttributes.ITALIC}
              >
                {isWorkflow() ? GLYPH.workflow : GLYPH.agent}{" "}
                {isWorkflow() ? "Workflow results" : resultLabel()}
                <Show when={workflowList()}>
                  {(view) => <span style={{ fg: theme().text.muted }}> · {view().countLabel}</span>}
                </Show>
                {resultDisclosure.expanded() ? " ▾" : resultHover() ? " ▸" : ""}
              </text>
            </Clickable>
            <Show when={resultDisclosure.expanded()}>
              <box
                marginLeft={ROW + 1}
                paddingLeft={1}
                border={["left"]}
                borderColor={theme().border.base}
              >
                <Show when={!isWorkflow()}>
                  <text fg={theme().text.muted} attributes={TextAttributes.ITALIC} wrapMode="word">
                    {resultText()}
                  </text>
                </Show>
                <Show when={workflowList()}>
                  {(view) => (
                    <WorkflowResultRows
                      context={props.context}
                      list={view().list}
                      width={Math.max(10, props.input.width - ROW - 8)}
                    />
                  )}
                </Show>
              </box>
            </Show>
          </Show>
          <Show when={workflowJson()}>
            {(json) => (
              <box paddingLeft={ROW} paddingTop={1}>
                <CodeBlock context={props.context} text={json()} language="json" />
              </box>
            )}
          </Show>
          <Show when={workflowPlain()}>
            {(text) => (
              <box paddingLeft={ROW} paddingTop={1}>
                <text fg={theme().text.base} wrapMode="word">
                  {text()}
                </text>
              </box>
            )}
          </Show>
        </box>
      </Show>
    </box>
  );
}

/** One line per workflow result item: label in base, detail muted — the desktop row's collapsed form. */
function WorkflowResultRows(props: {
  context: Plugin.Context;
  list: WorkflowResultList;
  width: number;
}) {
  const theme = () => props.context.theme;
  return (
    <For each={props.list.items}>
      {(entry) => {
        const label = pickWorkflowResultLabel(entry, props.list.labelKey);
        const detail =
          pickResultDetail(entry, props.list.detailKeys) ?? summarizeWorkflowResult(entry);
        const detailWidth = Math.max(8, props.width - (label ? textWidth(label) + 1 : 0));
        return (
          <text wrapMode="none">
            <Show when={label}>
              {(value) => (
                <>
                  <span style={{ fg: theme().text.base }}>{value()}</span>
                  <span style={{ fg: theme().text.muted }}> </span>
                </>
              )}
            </Show>
            <span style={{ fg: theme().text.muted }}>{endTruncate(detail, detailWidth)}</span>
          </text>
        );
      }}
    </For>
  );
}

function poracodeItem(message: SessionMessageInfo | undefined) {
  const metadata = message && "metadata" in message ? message.metadata : undefined;
  return poracodeItemOf(metadata);
}

function poracodeType(message: SessionMessageInfo | undefined) {
  return poracodeItem(message)?.type;
}

/** Provider display label for a handoff kind, from the location's provider catalog. */
function providerLabel(context: Plugin.Context, sessionID: string, kind: string) {
  const location = context.data.session.get(sessionID)?.location;
  const providers = context.data.location.provider.list(location);
  return providers?.find((provider) => provider.id === kind)?.name ?? kind;
}

function MessageRow(props: Props & { messageID: string }) {
  const message = createMemo(() => messageOf(props, props.messageID));
  const type = createMemo(() => poracodeType(message()));
  // Goals and errors live outside the transcript on desktop (the goal line and the turn footer here).
  const hidden = () => type() === "goal" || type() === "error";
  useHidden(props, hidden);
  return (
    <Switch fallback={hidden() ? null : props.input.fallback()}>
      <Match when={message()?.type === "user" ? (message() as SessionMessageUser) : undefined}>
        {(user) => <UserBubble {...props} message={user()} />}
      </Match>
      <Match when={type() === "provider_handoff" ? message() : undefined}>
        {(notice) => {
          const kinds = handoffKinds(notice());
          const text = kinds
            ? `Switched from ${providerLabel(props.context, props.input.sessionID, kinds.from)} to ${providerLabel(props.context, props.input.sessionID, kinds.to)}`
            : "text" in notice()
              ? String((notice() as { text: string }).text)
              : "";
          return <NoticeLine {...props} glyph={GLYPH.handoff} text={text} />;
        }}
      </Match>
    </Switch>
  );
}

function handoffKinds(message: SessionMessageInfo | undefined) {
  const payload = poracodeItem(message)?.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const record = payload as Record<string, unknown>;
  const from = record.fromAgentKind;
  const to = record.toAgentKind;
  return typeof from === "string" && typeof to === "string" ? { from, to } : undefined;
}

function NoticeLine(props: Props & { glyph: string; text: string }) {
  return (
    <box paddingLeft={PROSE}>
      <text fg={props.context.theme.text.muted} wrapMode="word">
        {props.glyph} {props.text}
      </text>
    </box>
  );
}

/** The desktop `QuestionAnswer` card: a raised surface listing each answered question. */
function QuestionAnswerRow(props: Props & { item: RuntimeChatItem }) {
  const theme = () => props.context.theme;
  const questions = () => {
    const parsed = questionAnswerItemPayloadSchema.safeParse(props.item.payload);
    return parsed.success ? parsed.data.questions : [];
  };
  return (
    <Show when={questions().length > 0}>
      <box
        border={true}
        borderStyle="rounded"
        borderColor={theme().border.base}
        backgroundColor={theme().background.raised.base}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="column"
        flexShrink={0}
      >
        <For each={questions()}>
          {(entry, index) => (
            <box flexDirection="column" {...(index() > 0 ? { paddingTop: 1 } : {})}>
              <Show when={entry.header.length > 0 && entry.header !== entry.question}>
                <text fg={theme().text.muted}>{entry.header.toUpperCase()}</text>
              </Show>
              <Show when={entry.question.length > 0}>
                <text fg={theme().text.muted}>{entry.question}</text>
              </Show>
              <For each={entry.selected}>
                {(selection) => (
                  <box flexDirection="column">
                    <text fg={theme().text.base}>✓ {selection.label}</text>
                    <Show when={selection.description}>
                      <box paddingLeft={2}>
                        <text fg={theme().text.muted} wrapMode="word">
                          {selection.description}
                        </text>
                      </box>
                    </Show>
                  </box>
                )}
              </For>
              <Show when={entry.customAnswer}>
                <text fg={theme().text.base} wrapMode="word">
                  › {entry.customAnswer}
                </text>
              </Show>
            </box>
          )}
        </For>
      </box>
    </Show>
  );
}

/** The desktop's closing turn line: `Worked for 2m 05s` and when the turn ended. */
function TurnFooter(props: Props & { messageID: string }) {
  const theme = () => props.context.theme;
  const message = createMemo(() => {
    const value = messageOf(props, props.messageID);
    return value?.type === "assistant" ? (value as SessionMessageAssistant) : undefined;
  });
  const interrupted = () => message()?.error?.message === "Step interrupted";
  const error = () => (interrupted() ? undefined : message()?.error?.message);
  const summary = createMemo(() => {
    const value = message();
    const ended = value?.time.completed;
    if (!value || ended === undefined) return "";
    const started = turnStartedAt(
      props.context.data.session.message.list(props.input.sessionID),
      value.id,
    );
    const seconds = started === undefined ? 0 : Math.max(0, Math.floor((ended - started) / 1000));
    return [
      seconds >= 1 ? `Worked for ${formatElapsed(seconds)}` : undefined,
      interrupted() ? "Interrupted" : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
  });
  // A step that closed without a recorded end has nothing to say.
  useHidden(props, () => message() !== undefined && !message()!.retry && !error() && !summary());
  return (
    <Show when={message() && !message()!.retry} fallback={props.input.fallback()}>
      <box paddingLeft={PROSE} flexDirection="column">
        <Show when={error()}>
          <text fg={theme().text.feedback.error.base} wrapMode="word">
            {GLYPH.error} {error()}
          </text>
        </Show>
        <Show when={summary()}>
          <text fg={theme().text.muted}>{summary()}</text>
        </Show>
      </box>
    </Show>
  );
}
