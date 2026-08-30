import { Disclosure, Surface } from "@heroui/react";
import { memo, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { GitBranch } from "lucide-react";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { chatMessageSurfaceClass } from "./chatMessageSurface";
import {
  ChatRowMetaSeparator,
  chatRowBodyClass,
  chatRowClass,
  chatRowHoverClass,
  chatRowShellClass,
} from "./chatRow";
import { ItemMarkdown } from "./ItemMarkdown";

/**
 * Renders a Workflow tool's structured return value as a single grouped row,
 * mirroring the `ToolCallGroup` chrome. The script's `return` value is
 * inspected for the first array-of-objects payload — typically `findings[]`,
 * `dimensionSummaries[]`, `confirmedBugs[]`, etc. — and each item becomes
 * one expandable row inside the group. When no array shape is found, the
 * raw JSON is shown as a single body.
 */

interface WorkflowResultGroupProps {
  resultText: string;
}

export const WorkflowResultGroup = memo(function WorkflowResultGroup({
  resultText,
}: WorkflowResultGroupProps) {
  const { t } = useLingui();
  const actions = useChatPaneActions();
  const [isExpanded, setIsExpanded] = useState(false);
  const trimmed = resultText.trim();
  if (!trimmed) return null;

  // <tool_use_error>…</tool_use_error> is what Claude SDK emits when the tool
  // itself rejected the call (e.g. workflow script validation). The error
  // text is already attached as a tooltip on the row's error icon — don't
  // duplicate it as an inline banner here.
  if (TOOL_USE_ERROR_RE.test(trimmed)) return null;

  const parsed = tryParseJson(trimmed);
  const list = parsed !== undefined ? findResultList(parsed) : null;

  // No structured list to fan out — render the text inline. Wrapping a single
  // string in a "Workflow result" disclosure adds chrome without information.
  if (!list) {
    return <WorkflowPlainResult text={trimmed} parsed={parsed} />;
  }

  const labelKey = list.labelKey ?? null;
  const itemNoun = labelKey ? prettifyKey(labelKey) : "result";
  const countLabel = `${list.items.length} ${list.items.length === 1 ? itemNoun : pluralize(itemNoun)}`;
  return (
    <WorkflowResultShell
      label={t`Workflow results`}
      countLabel={countLabel}
      isExpanded={isExpanded}
      onToggle={(next) => {
        setIsExpanded(next);
        actions?.onContentHeightChange?.();
      }}
    >
      <ul className="flex flex-col gap-1">
        {list.items.map((item, index) => (
          <WorkflowResultRow
            key={`${index}-${pickLabel(item, list.labelKey) ?? "row"}`}
            item={item}
            labelKey={list.labelKey}
            detailKeys={list.detailKeys}
          />
        ))}
      </ul>
    </WorkflowResultShell>
  );
});

const TOOL_USE_ERROR_RE = /<tool_use_error>[\s\S]*?<\/tool_use_error>/i;

function WorkflowPlainResult({ text, parsed }: { text: string; parsed: unknown | undefined }) {
  // A parsed JSON value that wasn't a list — show it as a code block so users
  // see the structure. Plain text (the common case: launch confirmation,
  // status lines) goes through Markdown so links and code spans render.
  if (parsed !== undefined && typeof parsed !== "string") {
    return (
      <pre className="w-full min-w-0 overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-[color:var(--border)] bg-[var(--composer-surface)] px-2 py-1.5 font-mono text-[length:var(--lc-chat-font-size-meta)] text-foreground/90">
        {safeStringify(parsed, 2)}
      </pre>
    );
  }
  return (
    <Surface variant="transparent" className={chatMessageSurfaceClass}>
      <div className="min-w-0 leading-snug text-foreground">
        <ItemMarkdown text={text} />
      </div>
    </Surface>
  );
}

function WorkflowResultShell({
  label,
  countLabel,
  isExpanded,
  onToggle,
  children,
}: {
  label: string;
  countLabel: string | null;
  isExpanded: boolean;
  onToggle: (next: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className={chatRowShellClass}>
      <Disclosure
        className="text-[length:var(--lc-chat-font-size-command)] leading-tight"
        isExpanded={isExpanded}
        onExpandedChange={onToggle}
      >
        <Disclosure.Heading>
          <Disclosure.Trigger className={`${chatRowClass} gap-2 ${chatRowHoverClass}`}>
            <span className="flex shrink-0 items-center gap-1 text-[color:var(--muted)]">
              <GitBranch className="size-3" />
              <code className="font-mono !text-[color:var(--muted)]">{label}</code>
            </span>
            {countLabel ? (
              <>
                <ChatRowMetaSeparator />
                <code className="font-mono tabular-nums !text-[color:var(--muted)]">
                  {countLabel}
                </code>
              </>
            ) : null}
            <Disclosure.Indicator className="size-3.5 shrink-0 text-[color:var(--muted)]" />
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className={`${chatRowBodyClass} pt-1`}>{children}</Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </div>
  );
}

function WorkflowResultRow({
  item,
  labelKey,
  detailKeys,
}: {
  item: Record<string, unknown>;
  labelKey: string | null;
  detailKeys: string[];
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const actions = useChatPaneActions();
  const label = pickLabel(item, labelKey);
  const detail = detailKeys.map((key) => item[key]).find(isNonEmptyString);
  const otherKeys = Object.keys(item).filter(
    (key) => key !== labelKey && !detailKeys.includes(key) && item[key] !== undefined,
  );

  return (
    <li>
      <Disclosure
        className="text-[length:var(--lc-chat-font-size-command)] leading-tight"
        isExpanded={isExpanded}
        onExpandedChange={(next) => {
          setIsExpanded(next);
          actions?.onContentHeightChange?.();
        }}
      >
        <Disclosure.Heading>
          <Disclosure.Trigger className="flex w-full min-w-0 items-baseline gap-2 py-0.5 text-left">
            {label ? (
              <code className="shrink-0 font-mono !text-[color:var(--foreground)]">{label}</code>
            ) : null}
            {detail ? (
              <span className="min-w-0 flex-1 truncate text-[color:var(--muted)]">{detail}</span>
            ) : (
              <span className="min-w-0 flex-1 truncate text-[color:var(--muted)]">
                {summarizeObject(item)}
              </span>
            )}
            <Disclosure.Indicator className="size-3.5 shrink-0 text-[color:var(--muted)]" />
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className="pb-1 pl-3 pt-1">
            {detail ? (
              <div className="pb-2 text-[length:var(--lc-chat-font-size-command)] text-foreground">
                <ItemMarkdown text={detail} />
              </div>
            ) : null}
            {otherKeys.length > 0 ? (
              <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[length:var(--lc-chat-font-size-meta)]">
                {otherKeys.map((key) => (
                  <ResultFieldRow key={key} fieldKey={key} value={item[key]} />
                ))}
              </dl>
            ) : null}
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </li>
  );
}

function ResultFieldRow({ fieldKey, value }: { fieldKey: string; value: unknown }) {
  return (
    <>
      <dt className="font-mono text-foreground-muted">{fieldKey}</dt>
      <dd className="min-w-0 break-words text-foreground">
        {typeof value === "string" ? value : <ResultJsonBlock value={value} compact />}
      </dd>
    </>
  );
}

function ResultJsonBlock({ value, compact = false }: { value: unknown; compact?: boolean }) {
  const text = typeof value === "string" ? value : safeStringify(value, compact ? undefined : 2);
  return (
    <pre className="whitespace-pre-wrap break-words rounded border border-[color:var(--border)] bg-[var(--composer-surface)] px-2 py-1 font-mono text-[length:var(--lc-chat-font-size-meta)] text-foreground/90">
      {text}
    </pre>
  );
}

interface ResultList {
  items: Record<string, unknown>[];
  labelKey: string | null;
  detailKeys: string[];
}

/**
 * Find the first array-of-objects in the parsed result. Workflows usually
 * stash their output array at the root or under a nested key like
 * `findings`, `confirmedBugs`, `dimensionSummaries` — sometimes through an
 * outer wrapper (`{result: {findings: [...]}}`). Walk a few levels deep so
 * common wrapper shapes resolve.
 */
function findResultList(value: unknown, depth = 0): ResultList | null {
  if (depth > 3) return null;
  if (Array.isArray(value)) return buildResultList(value);
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const inner = obj[key];
    if (Array.isArray(inner)) {
      const built = buildResultList(inner);
      if (built) return built;
    }
  }
  // No array found at this level — recurse into nested objects.
  for (const key of Object.keys(obj)) {
    const inner = obj[key];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      const built = findResultList(inner, depth + 1);
      if (built) return built;
    }
  }
  return null;
}

function buildResultList(raw: unknown[]): ResultList | null {
  const items: Record<string, unknown>[] = [];
  for (const entry of raw) {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      items.push(entry as Record<string, unknown>);
    }
  }
  if (items.length === 0) return null;
  const labelKey = pickLabelKey(items);
  const detailKeys = pickDetailKeys(items);
  return { items, labelKey, detailKeys };
}

const LABEL_PRIORITY = ["dimension", "area", "label", "title", "name", "key", "id", "category"];

const DETAIL_PRIORITY = [
  "summary",
  "detail",
  "description",
  "message",
  "reasoning",
  "content",
  "text",
  "note",
];

function pickLabelKey(items: Record<string, unknown>[]): string | null {
  for (const candidate of LABEL_PRIORITY) {
    if (items.every((item) => isNonEmptyString(item[candidate]))) return candidate;
  }
  for (const candidate of LABEL_PRIORITY) {
    if (items.some((item) => isNonEmptyString(item[candidate]))) return candidate;
  }
  return null;
}

function pickDetailKeys(items: Record<string, unknown>[]): string[] {
  const out: string[] = [];
  for (const candidate of DETAIL_PRIORITY) {
    if (items.some((item) => isNonEmptyString(item[candidate]))) out.push(candidate);
  }
  return out;
}

function pickLabel(item: Record<string, unknown>, labelKey: string | null): string | undefined {
  if (labelKey && isNonEmptyString(item[labelKey])) return item[labelKey];
  for (const candidate of LABEL_PRIORITY) {
    if (isNonEmptyString(item[candidate])) return item[candidate];
  }
  return undefined;
}

function prettifyKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.endsWith("s") ? spaced.slice(0, -1) : spaced;
}

function pluralize(noun: string): string {
  if (/(?:s|x|z|ch|sh)$/i.test(noun)) return `${noun}es`;
  if (/[^aeiou]y$/i.test(noun)) return `${noun.slice(0, -1)}ies`;
  return `${noun}s`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function tryParseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function safeStringify(value: unknown, indent?: number): string {
  try {
    return JSON.stringify(value, null, indent);
  } catch {
    return String(value);
  }
}

function summarizeObject(item: Record<string, unknown>): string {
  const pairs = Object.entries(item)
    .filter(([, value]) => value !== undefined)
    .slice(0, 3)
    .map(([key, value]) => {
      const rendered =
        typeof value === "string"
          ? value
          : typeof value === "number" || typeof value === "boolean"
            ? String(value)
            : safeStringify(value);
      return `${key}: ${rendered}`;
    });
  return pairs.join(" · ");
}
