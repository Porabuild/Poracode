import { useState, type ReactNode } from "react";
import { Button, Disclosure, Popover } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ChevronDown, LogOut, Plus } from "lucide-react";
import type { AgentConnectedProvider } from "@/shared/contracts";
import { PixelLoader } from "@/renderer/components/common";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";

/** Pending key for the add action, so it can share one pending slot with the rows. */
export const ADD_PROVIDER_KEY = "__add__";

/** Stable per-row key; providers without an id fall back to their label. */
export function providerActionKey(provider: AgentConnectedProvider, index: number): string {
  return provider.id ?? `${provider.label}:${index}`;
}

/**
 * Connected upstream AI accounts for agents that authenticate per provider
 * rather than once. The caller owns what "add" and "sign out" actually do —
 * some agents drive their CLI, others call their own API — so this section only
 * renders the list and reports presses.
 */
export function ProviderAccountsSection(props: {
  agentKind: string;
  description: ReactNode;
  providers: readonly AgentConnectedProvider[];
  /** Row key (or {@link ADD_PROVIDER_KEY}) whose action is in flight. */
  pendingKey: string | undefined;
  /** When true, Add is shown but cannot start a login (no login command). */
  addDisabled?: boolean;
  /**
   * Accounts the agent signs in to one at a time. When set, Add opens a menu of
   * these and passes the chosen id to onAdd; otherwise Add starts the agent's
   * single login.
   */
  addOptions?: readonly { id: string; label: string }[];
  onAdd: (optionId?: string) => void;
  onSignOut: (provider: AgentConnectedProvider, index: number) => void;
}) {
  const { t } = useLingui();
  const { agentKind, providers, pendingKey, addDisabled = false } = props;
  const isBusy = pendingKey !== undefined;
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const addMenuDisabled = isBusy || addDisabled || props.addOptions?.length === 0;

  const addButton = (
    <Button
      size="sm"
      variant="secondary"
      className="h-7 min-h-7 shrink-0 gap-1 px-2 text-[11px] text-foreground"
      isDisabled={addMenuDisabled}
      isPending={pendingKey === ADD_PROVIDER_KEY}
      {...(props.addOptions ? {} : { onPress: () => props.onAdd() })}
    >
      <Plus className="size-3" />
      <Trans>Add provider</Trans>
      {props.addOptions ? <ChevronDown className="size-3 shrink-0 text-muted" /> : null}
    </Button>
  );

  return (
    <div className="border-t border-border/10 pt-3">
      <div className="flex items-start gap-4">
        <Disclosure className="min-w-0 flex-1">
          <Disclosure.Heading>
            <Disclosure.Trigger className="flex w-full min-w-0 items-start gap-3 py-1 text-left">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  <Trans>AI providers</Trans>
                </p>
                <p className="text-xs text-muted">{props.description}</p>
              </div>
              <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs tabular-nums text-muted">
                {providers.length}
              </span>
              <Disclosure.Indicator className="mt-1 size-3.5 shrink-0 text-muted" />
            </Disclosure.Trigger>
          </Disclosure.Heading>

          <Disclosure.Content>
            <Disclosure.Body className="pt-2">
              {providers.length === 0 ? (
                <p className="py-2 text-[11px] text-muted/60">
                  <Trans>No providers connected yet.</Trans>
                </p>
              ) : (
                <div className="space-y-0.5">
                  {providers.map((provider, index) => {
                    const key = providerActionKey(provider, index);
                    return (
                      <div
                        key={key}
                        className="group/provider -mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-secondary/40"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <ProviderIcon
                            kind={agentKind}
                            tone="active"
                            className="size-3.5 shrink-0"
                          />
                          <span className="min-w-0 truncate text-sm font-medium text-foreground/90">
                            {provider.label}
                          </span>
                          {provider.detail ? (
                            <span className="shrink-0 text-[11px] tabular-nums text-muted/60">
                              {provider.detail}
                            </span>
                          ) : null}
                        </div>
                        <Button
                          size="sm"
                          variant="tertiary"
                          className="h-6 min-h-6 shrink-0 gap-1 px-2 text-[10px] text-muted hover:text-foreground"
                          aria-label={t`Sign out of ${provider.label}`}
                          isDisabled={isBusy}
                          isPending={pendingKey === key}
                          onPress={() => props.onSignOut(provider, index)}
                        >
                          {pendingKey === key ? (
                            <PixelLoader size="xs" />
                          ) : (
                            <LogOut className="size-3 text-danger" />
                          )}
                          <Trans>Logout</Trans>
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>

        {props.addOptions ? (
          <Popover
            isOpen={isAddMenuOpen && !addMenuDisabled}
            onOpenChange={(open) => setIsAddMenuOpen(open && !addMenuDisabled)}
          >
            <Popover.Trigger>{addButton}</Popover.Trigger>
            <Popover.Content placement="bottom end" className="w-48 p-0">
              <Popover.Dialog className="!p-0">
                <div role="menu" aria-label={t`Add provider`} className="poracode-menu py-1">
                  {props.addOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center px-3 py-1.5 text-sm text-foreground hover:bg-surface-secondary/50"
                      onClick={() => {
                        props.onAdd(option.id);
                        setIsAddMenuOpen(false);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </Popover.Dialog>
            </Popover.Content>
          </Popover>
        ) : (
          addButton
        )}
      </div>
    </div>
  );
}
