import { useEffect, useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { AgentPluginPackage, ManageAgentPluginsPayload } from "@/shared/contracts";
import { agentEnvKey, type AgentEnv } from "@/shared/machines";
import { readBridge } from "@/renderer/bridge";
import { ConfirmDialog, PixelLoader } from "@/renderer/components/common";
import { LightballTabs } from "@/renderer/components/common/LightballTabs";
import { OpenCode2PluginRow, OpenCode2FeaturedPlugin } from "./OpenCode2PluginCards";

const GOAL_PACKAGE = "@prevalentware/opencode-goal-plugin";

type PluginAction = ManageAgentPluginsPayload["action"];
/** The single in-flight operation, so only its own button shows a spinner. */
type PendingAction = { action: PluginAction; target?: string };

export function OpenCode2PluginManager({ agentKind, env }: { agentKind: string; env: AgentEnv }) {
  const { t } = useLingui();
  const [packages, setPackages] = useState<AgentPluginPackage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<PendingAction | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [target, setTarget] = useState("");
  const [changed, setChanged] = useState(false);
  const [upToDate, setUpToDate] = useState(false);
  const [removing, setRemoving] = useState<AgentPluginPackage | undefined>();
  const [tab, setTab] = useState<"installed" | "discover">("installed");
  const environmentKey = agentEnvKey(env);
  const busy = pending !== undefined;
  const isPending = (action: PluginAction, packageTarget?: string) =>
    pending?.action === action && pending.target === packageTarget;

  useEffect(() => {
    let current = true;
    setPending({ action: "list" });
    void readBridge()
      .manageAgentPlugins({ agentKind, env, action: "list" })
      .then((result) => {
        if (current) {
          setPackages(result.packages);
          setLoaded(true);
          setError(undefined);
        }
      })
      .catch(() => {
        if (current) setError(t`Couldn't load plugins.`);
      })
      .finally(() => {
        if (current) setPending(undefined);
      });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- environment identity is stable across status refreshes.
  }, [agentKind, environmentKey]);

  const run = async (action: PluginAction, packageTarget?: string) => {
    setPending({ action, ...(packageTarget ? { target: packageTarget } : {}) });
    setError(undefined);
    setUpToDate(false);
    try {
      const result = await readBridge().manageAgentPlugins({
        agentKind,
        env,
        action,
        ...(packageTarget ? { target: packageTarget } : {}),
      });
      setPackages(result.packages);
      setLoaded(true);
      if (action !== "list" && action !== "check") setChanged(true);
      // Nothing moves on screen when every package is current, so say so.
      if (action === "check") setUpToDate(!result.packages.some((pkg) => pkg.outdated));
      if (action === "install") {
        setTarget("");
        setTab("installed");
      }
    } catch {
      // A failed read is a different problem from a failed package change —
      // telling the user to check a package name they never typed is noise.
      setError(
        action === "list" || action === "check"
          ? t`Couldn't load plugins.`
          : t`Couldn't manage plugins. Check the package name, OpenCode version, and network connection, then retry.`,
      );
    } finally {
      setPending(undefined);
    }
  };
  const removingTarget = removing?.target ?? "";
  const goal = packages.find(
    (pkg) => pkg.target === GOAL_PACKAGE || pkg.target.startsWith(`${GOAL_PACKAGE}@`),
  );

  return (
    <div className="space-y-4" data-plugin-manager>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LightballTabs
          ariaLabel={t`Plugin views`}
          active={tab}
          onChange={(next) => {
            setError(undefined);
            setTab(next);
          }}
          tabs={[
            { id: "installed", label: <Trans>Installed</Trans> },
            { id: "discover", label: <Trans>Discover</Trans> },
          ]}
        />
        {tab === "installed" ? (
          <div className="flex flex-wrap items-center justify-end gap-1">
            {upToDate ? (
              <p role="status" className="mr-1 text-[11px] text-muted">
                <Trans>All plugins are up to date.</Trans>
              </p>
            ) : null}
            <Button
              size="sm"
              variant="tertiary"
              className="h-7 min-h-7 px-2 text-xs"
              isDisabled={busy}
              isPending={isPending("list")}
              onPress={() => void run("list")}
            >
              <Trans>Refresh</Trans>
            </Button>
            <Button
              size="sm"
              variant="tertiary"
              className="h-7 min-h-7 px-2 text-xs"
              isDisabled={busy || !loaded}
              isPending={isPending("check")}
              aria-label={t`Check agent plugin updates`}
              onPress={() => void run("check")}
            >
              <Trans>Check for updates</Trans>
            </Button>
          </div>
        ) : null}
      </div>
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {error}
        </div>
      ) : null}
      {tab === "installed" ? (
        <div role="tabpanel" aria-label={t`Installed`} className="space-y-3">
          {!loaded && busy ? (
            <div
              role="status"
              className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted"
            >
              <PixelLoader size="xs" />
              <Trans>Loading plugins…</Trans>
            </div>
          ) : null}
          {loaded && packages.length === 0 ? (
            <div className="space-y-3 py-6 text-center">
              <p className="text-sm text-muted">
                <Trans>No package plugins installed.</Trans>
              </p>
              <Button size="sm" variant="secondary" onPress={() => setTab("discover")}>
                <Trans>Browse plugins</Trans>
              </Button>
            </div>
          ) : null}
          <div className="divide-y divide-border/10">
            {packages.map((pkg) => (
              <OpenCode2PluginRow
                key={pkg.target}
                pkg={pkg}
                busy={busy}
                updating={isPending("update", pkg.target)}
                removing={isPending("remove", pkg.target)}
                onUpdate={() => void run("update", pkg.target)}
                onRemove={() => setRemoving(pkg)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div role="tabpanel" aria-label={t`Discover`} className="space-y-4">
          <OpenCode2FeaturedPlugin
            status={goal?.status}
            disabled={busy || !loaded}
            pending={isPending("install", GOAL_PACKAGE)}
            onInstall={() => void run("install", GOAL_PACKAGE)}
          />

          <form
            className="flex items-end gap-2 border-t border-border/10 pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy && target.trim()) void run("install", target.trim());
            }}
          >
            <TextField
              className="min-w-0 flex-1"
              value={target}
              onChange={setTarget}
              isDisabled={busy}
            >
              <Label>
                <Trans>Package name or Git URL</Trans>
              </Label>
              <Input placeholder={t`@scope/plugin@version`} />
            </TextField>
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              isDisabled={busy || !target.trim()}
              isPending={isPending("install", target.trim())}
            >
              <Trans>Install</Trans>
            </Button>
          </form>
          <p className="text-xs text-muted">
            <Trans>
              Plugins run code with your account's access. Install packages from authors you trust.
            </Trans>
          </p>
        </div>
      )}
      {changed ? (
        <p role="status" className="border-t border-border/10 pt-3 text-xs text-muted">
          <Trans>
            OpenCode reloads watched configuration automatically. Reopen your thread to refresh
            plugin commands; terminal-only changes may need a new terminal session.
          </Trans>
        </p>
      ) : null}
      <ConfirmDialog
        isOpen={removing !== undefined}
        title={t`Remove plugin`}
        body={
          <Trans>
            Remove “{removingTarget}” from OpenCode 2? You can install it again from Discover.
          </Trans>
        }
        confirmLabel={t`Remove`}
        onConfirm={() => {
          const pkg = removing;
          setRemoving(undefined);
          if (pkg) void run("remove", pkg.target);
        }}
        onClose={() => setRemoving(undefined)}
      />
    </div>
  );
}
