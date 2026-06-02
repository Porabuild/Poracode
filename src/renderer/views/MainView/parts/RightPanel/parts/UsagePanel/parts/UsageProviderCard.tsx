import { useState } from "react";
import { useSortable } from "@dnd-kit/react/sortable";
import { ChevronDown, ChevronRight, GripVertical, LogOut } from "lucide-react";
import type { UsageSnapshot } from "@lightcode/agents-usage";
import { readBridge } from "@/renderer/bridge";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import {
  formatUsageWindowLabel,
  UsageWindowBars,
} from "@/renderer/components/providers/UsageWindowBars";
import {
  formatMoney,
  formatTokens,
  formatWindowValue,
  sharedWindowResetLabel,
  usageStatusText,
} from "@/renderer/components/providers/usageFormat";
import { usageToneColor } from "@/renderer/components/providers/usageTone";
import {
  supportsCookieLogin,
  usesSharedWindowReset,
} from "@/renderer/components/providers/usageProviders";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useProviderUsage, useProviderUsageStore } from "@/renderer/state/providerUsageStore";

/** Compact one-line window chips shown when the card is collapsed. */
function WindowChips(props: { windows: UsageSnapshot["windows"] }) {
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {props.windows.map((w) => (
        <span key={w.id} className="flex items-center gap-1 whitespace-nowrap text-xs">
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: usageToneColor(w.usedPercent) }}
          />
          <span className="text-muted">{formatUsageWindowLabel(w)}</span>
          <span className="tabular-nums text-foreground">{formatWindowValue(w)}</span>
        </span>
      ))}
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
  collapsed: boolean;
  onToggleCollapse: (id: string) => void;
}) {
  const { id, label, index, collapsed, onToggleCollapse } = props;
  const snapshot = useProviderUsage(id);
  const [signingIn, setSigningIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const supportsLogin = supportsCookieLogin(id);
  const canSignIn = snapshot?.status === "auth-missing" && supportsLogin;

  const handleSignIn = async () => {
    setSigningIn(true);
    // Open the browser-overlay drawer (not maximized) so the login tab renders
    // there. Force-clear maximized in case a prior session left it fullscreen.
    usePanelStore.getState().setBrowserOverlayMaximized(false);
    usePanelStore.getState().setBrowserOverlayOpen(true);

    // Release the moment the user closes the overlay — don't depend on main's
    // cancel round-trip resolving, so the button can never hang in "Signing in…".
    let unsubscribe = () => {};
    const overlayClosed = new Promise<"closed">((resolve) => {
      unsubscribe = usePanelStore.subscribe((state, prev) => {
        if (prev.browserOverlayOpen && !state.browserOverlayOpen) resolve("closed");
      });
    });

    try {
      const outcome = await Promise.race([
        readBridge().startUsageLogin({ providerId: id }),
        overlayClosed,
      ]);
      if (outcome === "closed") {
        // Best-effort: tell main to stop the in-flight capture.
        void readBridge()
          .cancelUsageLogin({ providerId: id })
          .catch(() => {});
        return;
      }
      // Dismiss the overlay once the login completes.
      usePanelStore.getState().setBrowserOverlayOpen(false);
      if (!outcome.ok) return;
      // Pull a fresh snapshot now that the cookie is captured; the supervisor
      // also emits `provider-usage`, but merge the reply for immediacy.
      const usage = await readBridge().refreshProviderUsage({ providerIds: [id] });
      const fresh = usage.snapshots.find((s) => s.providerId === id);
      if (fresh) useProviderUsageStore.getState().mergeSnapshot(fresh);
    } finally {
      unsubscribe();
      setSigningIn(false);
    }
  };
  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await readBridge().clearUsageLogin({ providerId: id });
      const usage = await readBridge().refreshProviderUsage({ providerIds: [id] });
      const fresh = usage.snapshots.find((s) => s.providerId === id);
      if (fresh) useProviderUsageStore.getState().mergeSnapshot(fresh);
    } finally {
      setSigningOut(false);
    }
  };
  const { ref, handleRef, isDragging } = useSortable({
    id: `usage-order:${id}`,
    index,
    type: "usage-provider-order",
    accept: ["usage-provider-order"],
    group: "usage-provider-order",
    data: { id },
  });

  const hasUsage =
    snapshot?.status === "ok" &&
    (snapshot.windows.length > 0 || Boolean(snapshot.cost) || Boolean(snapshot.credits));
  const hasWindows = snapshot?.status === "ok" && snapshot.windows.length > 0;
  const canSignOut = supportsLogin && snapshot !== undefined && snapshot.status !== "auth-missing";
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
      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        <button
          ref={handleRef}
          type="button"
          aria-label={`Reorder ${label}`}
          className="flex size-4 shrink-0 cursor-grab items-center justify-center text-muted/40 transition-colors hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${label}`}
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
              <span className="text-xs text-muted">{usageStatusText(snapshot, label)}</span>
            ) : null}
          </span>
        </button>
        {canSignOut ? (
          <button
            type="button"
            aria-label={`Sign out ${label}`}
            title={`Sign out ${label}`}
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="flex size-5 shrink-0 items-center justify-center rounded-md text-muted/60 transition-colors hover:bg-muted/10 hover:text-foreground disabled:opacity-50"
          >
            <LogOut className="size-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${label}`}
          onClick={() => onToggleCollapse(id)}
          className="flex size-5 shrink-0 items-center justify-center rounded-md text-muted/60 transition-colors hover:bg-muted/10 hover:text-foreground"
        >
          <Chevron className="size-4" />
        </button>
      </div>
      {collapsed && hasWindows && snapshot ? (
        <div className="px-2.5 pb-2">
          <WindowChips windows={snapshot.windows} />
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
              <UsageProviderMeta snapshot={snapshot} />
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted">{usageStatusText(snapshot, label)}</p>
              {canSignIn ? (
                <button
                  type="button"
                  onClick={() => void handleSignIn()}
                  disabled={signingIn}
                  className="rounded-lg border border-[color:var(--separator)] bg-surface px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted/10 disabled:opacity-50"
                >
                  {signingIn ? "Signing in…" : "Sign in"}
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function UsageProviderMeta(props: { snapshot: UsageSnapshot }) {
  const { snapshot } = props;
  const lines: string[] = [];
  if (snapshot.cost) {
    const tokens = snapshot.tokens?.total ? ` · ${formatTokens(snapshot.tokens.total)} tokens` : "";
    lines.push(
      `~${formatMoney(snapshot.cost.amount, snapshot.cost.currency)}${tokens} · ${snapshot.cost.period} · est.`,
    );
  }
  if (snapshot.credits && !snapshot.credits.unlimited) {
    lines.push(
      `${snapshot.credits.label ?? "Credits"}: ${formatMoney(
        snapshot.credits.balance,
        snapshot.credits.currency,
      )}`,
    );
  }

  if (lines.length === 0) return null;

  return (
    <div className="space-y-0.5">
      {lines.map((line) => (
        <p key={line} className="truncate text-[11px] text-muted">
          {line}
        </p>
      ))}
    </div>
  );
}
