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
import {
  pickLabel,
  pickResultDetail,
  safeStringify,
  summarizeObject,
  workflowResultView,
} from "./workflowResult";

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
  const view = workflowResultView(resultText);
  if (view.kind === "none") return null;
  if (view.kind === "json") return <WorkflowJsonResult json={view.json} />;
  // No structured list to fan out — render the text inline. Wrapping a single
  // string in a "Workflow result" disclosure adds chrome without information.
  if (view.kind === "text") {
    return (
      <Surface variant="transparent" className={chatMessageSurfaceClass}>
        <div className="min-w-0 leading-snug text-foreground">
          <ItemMarkdown text={view.text} />
        </div>
      </Surface>
    );
  }
  return (
    <WorkflowResultShell
      label={t`Workflow results`}
      countLabel={view.countLabel}
      isExpanded={isExpanded}
      onToggle={(next) => {
        setIsExpanded(next);
        actions?.onContentHeightChange?.();
      }}
    >
      <ul className="flex flex-col gap-1">
        {view.list.items.map((item, index) => (
          <WorkflowResultRow
            key={`${index}-${pickLabel(item, view.list.labelKey) ?? "row"}`}
            item={item}
            labelKey={view.list.labelKey}
            detailKeys={view.list.detailKeys}
          />
        ))}
      </ul>
    </WorkflowResultShell>
  );
});

function WorkflowJsonResult({ json }: { json: string }) {
  return (
    <pre className="w-full min-w-0 overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-[color:var(--border)] bg-[var(--composer-surface)] px-2 py-1.5 font-mono text-[length:var(--lc-chat-font-size-meta)] text-foreground/90">
      {json}
    </pre>
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
  const detail = pickResultDetail(item, detailKeys);
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
