import { type FormEvent } from "react";
import { useSortable } from "@dnd-kit/react/sortable";
import { ChevronDown, ChevronRight, GripVertical, LogOut, RefreshCw } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { usageWindowDisplayLabel } from "@poracode/agents-usage/formatters";
import type { UsageSnapshot } from "@poracode/agents-usage/types";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { UsageWindowBars } from "@/renderer/components/providers/UsageWindowBars";
import {
  formatCreditBalance,
  formatMoney,
  formatTokens,
  formatWindowValue,
  hasDisplayableCredits,
  sharedWindowResetLabel,
  usageStatusText,
} from "@/renderer/components/providers/usageFormat";
import { usageToneColor } from "@/renderer/components/providers/usageTone";
import { usesSharedWindowReset } from "@/renderer/components/providers/usageProviders";
import { useProviderUsageRefresh } from "@/renderer/components/providers/useProviderUsageRefresh";
import { useUsageProviderLogin } from "@/renderer/components/providers/useUsageProviderLogin";
import { useProviderUsage } from "@/renderer/state/providerUsageStore";

/** Compact one-line window chips shown when the card is collapsed. */
function WindowChips(props: {
  windows: UsageSnapshot["windows"];
  credits?: UsageSnapshot["credits"];
}) {
  const { t } = useLingui();
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {props.windows.map((w) => (
        <span key={w.id} className="flex items-center gap-1 whitespace-nowrap text-xs">
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: usageToneColor(w.usedPercent) }}
          />
          <span className="text-muted">{usageWindowDisplayLabel(w)}</span>
          <span className="tabular-nums text-foreground">{formatWindowValue(w)}</span>
        </span>
      ))}
      {props.credits ? (
        <span className="flex items-center gap-1 whitespace-nowrap text-xs">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-muted/60" />
          <span className="text-muted">{props.credits.label ?? t`Credits`}</span>
          <span className="tabular-nums text-foreground">
            {props.credits.unlimited ? t`Unlimited` : formatCreditBalance(props.credits)}
          </span>
        </span>
      ) : null}
    </div>
  );
}

function PlanLabel(props: { plan: string; account?: string }) {
  if (!props.account) {
    return <span className="truncate text-xs text-muted">{props.plan}</span>;
  }

  return (
    <span className="group/account relative min-w-0" title={props.account}>
      <span className="block truncate text-xs text-muted">{props.plan}</span>
      <span className="pointer-events-none absolute left-0 top-full z-[1000] mt-1 whitespace-nowrap rounded-md bg-surface px-2 py-1 text-xs text-foreground opacity-0 shadow-lg ring-1 ring-[color:var(--separator)] transition-opacity group-hover/account:opacity-100">
        {props.account}
      </span>
    </span>
  );
}

export function UsageProviderCard(props: {
  id: string;
  label: string;
  index: number;
  compact: boolean;
  collapsed: boolean;
  draggable?: boolean | undefined;
  onToggleCollapse: (id: string) => void;
}) {
  const { id, label, index, compact, collapsed, draggable = true, onToggleCollapse } = props;
  const { t } = useLingui();
  const snapshot = useProviderUsage(id);
  const {
    canBrowserSignIn,
    canApiKeySignIn,
    canSignOut,
    signingIn,
    signingOut,
    apiKey,
    setApiKey,
    handleSignIn,
    handleSubmitApiKey,
    handleSignOut,
  } = useUsageProviderLogin(id);
  const { refreshing, refresh } = useProviderUsageRefresh(id);
  const onSubmitApiKey = (event: FormEvent) => {
    event.preventDefault();
    void handleSubmitApiKey();
  };
  const { ref, handleRef, isDragging } = useSortable({
    id: `usage-order:${id}`,
    index,
    type: "usage-provider-order",
    accept: ["usage-provider-order"],
    group: "usage-provider-order",
    data: { id },
    disabled: !draggable,
  });

  const credits = hasDisplayableCredits(snapshot?.credits, snapshot?.windows ?? [])
    ? snapshot?.credits
    : undefined;
  const hasUsage =
    snapshot?.status === "ok" &&
    (snapshot.windows.length > 0 || Boolean(snapshot.cost) || Boolean(credits));
  const hasWindows = snapshot?.status === "ok" && snapshot.windows.length > 0;
  const sharedReset = usesSharedWindowReset(id)
    ? sharedWindowResetLabel(snapshot, Date.now())
    : undefined;
  const Chevron = collapsed ? ChevronRight : ChevronDown;

  return (
    <div
      ref={ref}
      className={`rounded-2xl border border-[color:var(--separator)] bg-surface ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div
        className={
          compact
            ? `flex min-h-[3.25rem] items-center gap-0 ${draggable ? "px-1" : "pl-3 pr-1"}`
            : `flex items-center gap-1.5 ${draggable ? "px-2.5" : "pl-3 pr-2.5"} py-1.5`
        }
      >
        {draggable ? (
          <button
            ref={handleRef}
            type="button"
            aria-label={t`Reorder ${label}`}
            className={`flex shrink-0 cursor-grab items-center justify-center text-muted/40 transition-colors hover:text-foreground active:cursor-grabbing ${
              compact ? "size-11 touch-none" : "size-4"
            }`}
          >
            <GripVertical className={compact ? "size-4" : "size-3.5"} />
          </button>
        ) : null}
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={collapsed ? t`Expand ${label}` : t`Collapse ${label}`}
          onClick={() => onToggleCollapse(id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:focus-ring"
        >
          <ProviderIcon kind={id} fallbackLabel={label} className="size-4 shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate text-sm font-medium text-foreground">{label}</span>
              {snapshot?.plan ? (
                <PlanLabel
                  plan={snapshot.plan}
                  {...(snapshot.authenticatedAs ? { account: snapshot.authenticatedAs } : {})}
                />
              ) : null}
              {sharedReset ? (
                <>
                  {snapshot?.plan ? (
                    <span className="shrink-0 text-xs text-muted/60" aria-hidden>
                      ·
                    </span>
                  ) : null}
                  <span className="shrink-0 text-xs tabular-nums text-muted">{sharedReset}</span>
                </>
              ) : null}
            </span>
            {collapsed && (!hasWindows || !snapshot) ? (
              <span className="text-xs text-muted">{usageStatusText(snapshot, label, id)}</span>
            ) : null}
          </span>
        </button>
        <button
          type="button"
          aria-label={t`Refresh ${label}`}
          title={t`Refresh ${label}`}
          onClick={() => void refresh()}
          disabled={refreshing}
          className={`flex shrink-0 items-center justify-center rounded-md text-muted/60 transition-colors hover:bg-muted/10 hover:text-foreground disabled:opacity-50 ${
            compact ? "size-11" : "size-5"
          }`}
        >
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
        {canSignOut ? (
          <button
            type="button"
            aria-label={t`Sign out ${label}`}
            title={t`Sign out ${label}`}
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className={`flex shrink-0 items-center justify-center rounded-md text-muted/60 transition-colors hover:bg-muted/10 hover:text-foreground disabled:opacity-50 ${
              compact ? "size-11" : "size-5"
            }`}
          >
            <LogOut className="size-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={collapsed ? t`Expand ${label}` : t`Collapse ${label}`}
          onClick={() => onToggleCollapse(id)}
          className={`flex shrink-0 items-center justify-center rounded-md text-muted/60 transition-colors hover:bg-muted/10 hover:text-foreground ${
            compact ? "size-11" : "size-5"
          }`}
        >
          <Chevron className="size-4" />
        </button>
      </div>
      {collapsed && hasWindows && snapshot ? (
        <div className="px-2.5 pb-2">
          <WindowChips windows={snapshot.windows} {...(credits ? { credits } : {})} />
        </div>
      ) : null}

      {!collapsed ? (
        <div className="space-y-2.5 border-t border-[color:var(--separator)] px-3 pb-4 pt-3">
          {hasUsage && snapshot ? (
            <>
              {snapshot.windows.length > 0 ? (
                <UsageWindowBars
                  windows={snapshot.windows}
                  showReset={!usesSharedWindowReset(id)}
                />
              ) : null}
              {credits ? (
                <UsageCreditsRow credits={credits} showSeparator={snapshot.windows.length > 0} />
              ) : null}
              <UsageProviderMeta snapshot={snapshot} />
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted">{usageStatusText(snapshot, label, id)}</p>
              {canBrowserSignIn ? (
                <button
                  type="button"
                  onClick={() => void handleSignIn()}
                  disabled={signingIn}
                  className="rounded-lg border border-[color:var(--separator)] bg-surface px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted/10 disabled:opacity-50"
                >
                  {signingIn ? <Trans>Signing in…</Trans> : <Trans>Browser sign-in</Trans>}
                </button>
              ) : null}
              {canApiKeySignIn ? (
                <form onSubmit={onSubmitApiKey} className="flex items-center gap-1.5">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={t`Paste ${label} API key`}
                    aria-label={t`${label} API key`}
                    autoComplete="off"
                    spellCheck={false}
                    className="min-w-0 flex-1 rounded-lg border border-[color:var(--separator)] bg-background px-2 py-1 text-xs text-foreground outline-none focus-visible:focus-ring"
                  />
                  <button
                    type="submit"
                    disabled={signingIn || apiKey.trim().length === 0}
                    className="shrink-0 rounded-lg border border-[color:var(--separator)] bg-surface px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted/10 disabled:opacity-50"
                  >
                    {signingIn ? <Trans>Signing in…</Trans> : <Trans>Sign in</Trans>}
                  </button>
                </form>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function UsageCreditsRow(props: {
  credits: NonNullable<UsageSnapshot["credits"]>;
  showSeparator: boolean;
}) {
  const { t } = useLingui();
  const { credits } = props;

  return (
    <div
      className={`flex items-center justify-between gap-3 ${
        props.showSeparator ? "border-t border-[color:var(--separator)] pt-2" : ""
      }`}
    >
      <span className="text-xs text-muted">{credits.label ?? t`Credits`}</span>
      <span className="tabular-nums text-xs text-foreground">
        {credits.unlimited ? t`Unlimited` : formatCreditBalance(credits)}
      </span>
    </div>
  );
}

function UsageProviderMeta(props: { snapshot: UsageSnapshot }) {
  const { t } = useLingui();
  const { snapshot } = props;
  if (!snapshot.cost) return null;

  const tokens = snapshot.tokens?.total
    ? ` · ${t`${formatTokens(snapshot.tokens.total)} tokens`}`
    : "";
  const money = formatMoney(snapshot.cost.amount, snapshot.cost.currency);
  const line = t`~${money}${tokens} · ${snapshot.cost.period} · est.`;

  return <p className="truncate text-[11px] text-muted">{line}</p>;
}
