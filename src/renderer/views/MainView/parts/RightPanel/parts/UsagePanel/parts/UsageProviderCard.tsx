import { type FormEvent } from "react";
import { Tooltip } from "@heroui/react";
import { LogIn, LogOut } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button, Input } from "@/renderer/components/common";
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
                size="sm"
                variant="ghost"
                aria-label={signingIn ? t`Signing in…` : t`Browser sign-in`}
                onPress={() => void handleSignIn()}
                isDisabled={signingIn}
                className={`min-w-0 shrink-0 rounded-md p-0 text-muted/60 hover:text-foreground ${
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
            <Tooltip>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label={t`Sign out ${label}`}
                onPress={() => void handleSignOut()}
                isDisabled={signingOut}
                className={`min-w-0 shrink-0 rounded-md p-0 text-muted/60 hover:text-foreground ${
                  compact ? "size-11" : "size-5"
                }`}
              >
                <LogOut className="size-3.5" />
              </Button>
              <Tooltip.Content placement="top">
                <Trans>Sign out</Trans>
              </Tooltip.Content>
            </Tooltip>
          ) : null}
        </>
      }
      credentialEmptyBody={
        <>
          {canApiKeySignIn ? (
            <form onSubmit={onSubmitApiKey} className="flex items-center gap-1.5">
              <Input
                size="sm"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t`Paste ${label} API key`}
                aria-label={t`${label} API key`}
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 px-2.5 text-xs"
              />
              <Button
                size="sm"
                variant="ghost"
                type="submit"
                className="shrink-0 px-2.5 text-foreground"
                isDisabled={signingIn || apiKey.trim().length === 0}
              >
                {signingIn ? <Trans>Signing in…</Trans> : <Trans>Sign in</Trans>}
              </Button>
            </form>
          ) : null}
        </>
      }
      credentialBody={
        <>
          {canBrowserSignIn && !optionalBrowserSignIn ? (
            <Button
              size="sm"
              variant="ghost"
              className="-ml-2 px-2 text-foreground"
              isDisabled={signingIn}
              onPress={() => void handleSignIn()}
            >
              {signingIn ? <Trans>Signing in…</Trans> : <Trans>Browser sign-in</Trans>}
            </Button>
          ) : null}
        </>
      }
    />
  );
}
