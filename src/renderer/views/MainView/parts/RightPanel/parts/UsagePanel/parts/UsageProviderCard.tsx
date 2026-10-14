import { type FormEvent } from "react";
import { Button, Tooltip } from "@heroui/react";
import { LogIn, LogOut } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { browserSessionAddsDetails } from "@/renderer/components/providers/usageProviders";
import { useProviderUsageRefresh } from "@/renderer/components/providers/useProviderUsageRefresh";
import { useUsageProviderLogin } from "@/renderer/components/providers/useUsageProviderLogin";
import { useProviderUsage } from "@/renderer/state/providerUsageStore";
import { UsageProviderCardView } from "@/renderer/components/providers/UsageProviderCardView";

export function UsageProviderCard(props: {
  id: string;
  label: string;
  index: number;
  compact: boolean;
  collapsed: boolean;
  draggable?: boolean | undefined;
  onToggleCollapse: (id: string) => void;
}) {
  const { id, label, compact } = props;
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
  const optionalBrowserSignIn = canBrowserSignIn && browserSessionAddsDetails(id);
  const { refreshing, refresh } = useProviderUsageRefresh(id);
  const onSubmitApiKey = (event: FormEvent) => {
    event.preventDefault();
    void handleSubmitApiKey();
  };
  return (
    <UsageProviderCardView
      {...props}
      snapshot={snapshot}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      credentialActions={
        <>
          {optionalBrowserSignIn ? (
            <Tooltip>
              <Button
                isIconOnly
                variant="ghost"
                aria-label={signingIn ? t`Signing in…` : t`Browser sign-in`}
                onPress={() => void handleSignIn()}
                isDisabled={signingIn}
                className={`min-w-0 shrink-0 rounded-md p-0 text-muted/60 hover:bg-muted/10 hover:text-foreground ${
                  compact ? "size-11" : "size-5"
                }`}
              >
                <LogIn className="size-3.5" />
              </Button>
              <Tooltip.Content placement="top">
                {signingIn ? <Trans>Signing in…</Trans> : <Trans>Browser sign-in</Trans>}
              </Tooltip.Content>
            </Tooltip>
          ) : null}
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
        </>
      }
      credentialEmptyBody={
        <>
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
        </>
      }
      credentialBody={
        <>
          {canBrowserSignIn && !optionalBrowserSignIn ? (
            <button
              type="button"
              onClick={() => void handleSignIn()}
              disabled={signingIn}
              className="rounded-lg border border-[color:var(--separator)] bg-surface px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted/10 disabled:opacity-50"
            >
              {signingIn ? <Trans>Signing in…</Trans> : <Trans>Browser sign-in</Trans>}
            </button>
          ) : null}
        </>
      }
    />
  );
}
