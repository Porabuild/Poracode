import { createEffect, createMemo, createResource, createSignal, onCleanup, Show } from "solid-js";
import type { BoxRenderable, RGBA } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/solid";
import type { Plugin } from "@opencode/plugin/tui";
import { openUrl } from "@opencode/util/open";
import { allUsageProviderDescriptors } from "@poracode/agents-usage/providers";
import { usageWindowDisplayLabel } from "@poracode/agents-usage/formatters";
import { isHomeProjectId } from "@/shared/homeScope";
import { CHANGELOG_URL, parseChangelogDocument } from "@/shared/changelog";
import { changelogHighlightPool, highlightHeadline } from "@/shared/changelogHighlights";
import { NEWS_FEED_URL, parseNewsFeed, selectNewsFeedItems } from "@/shared/newsFeed";
import { qualifiedRemoteName } from "@/shared/worktreeBaseRef";
import { resolveImplicitThreadWorktreeBase } from "@/shared/threadWorktreeLaunch";
import type { Adapter } from "../../adapter";
import { pickUsageFact } from "../../desktop/presentation";
import { endTruncate, textWidth } from "../textFit";

export function registerDraftUi(context: Plugin.Context, adapter: Adapter) {
  const [revision, setRevision] = createSignal(0);
  const currentProject = (directory: string) =>
    adapter.draftProject(directory).catch(() => undefined);
  context.ui.slot({
    append: "home.draft.header",
    render: () => (
      <DraftHeaderChips
        context={context}
        adapter={adapter}
        onProjectChange={() => setRevision((value) => value + 1)}
      />
    ),
  });
  context.ui.slot({
    append: "prompt.footer.status.draft",
    render: () => {
      const [availableWidth, setAvailableWidth] = createSignal(73);
      const [project] = createResource(() => context.location?.directory, currentProject);
      const [branches] = createResource(
        () => {
          const item = project();
          return item && !isHomeProjectId(item.id) ? item.id : false;
        },
        (id) => adapter.draftBranches(id).catch(() => undefined),
      );
      const startPoint = () => {
        revision();
        const item = project();
        return item && adapter.draftWorktreeStartPoint(item.id);
      };
      const chooseCheckout = async () => {
        const item = project();
        const git = branches();
        if (!item || !git) return;
        const choice = await context.ui.dialog.select({
          title: "Checkout",
          current: startPoint() ? "worktree" : "local",
          options: [
            { title: "Current checkout", value: "local" },
            { title: "New worktree", value: "worktree" },
          ],
        });
        if (!choice || project()?.id !== item.id) return;
        const base =
          startPoint() ??
          resolveImplicitThreadWorktreeBase(
            item.defaultBranch ?? undefined,
            git.branches,
            git.defaultBranch,
            git.current,
          );
        adapter.setDraftWorktree(item.id, choice === "worktree" ? base : undefined);
        setRevision((value) => value + 1);
      };
      const chooseBranch = async () => {
        const item = project();
        const git = branches();
        if (!item || !git) return;
        const names = [
          ...new Set(
            [
              startPoint(),
              git.current,
              ...git.branches.map((branch) => qualifiedRemoteName(branch) ?? branch.name),
            ].filter((name): name is string => Boolean(name)),
          ),
        ];
        const branch = await context.ui.dialog.select({
          title: "Worktree base branch",
          current: startPoint(),
          options: names.map((name) => ({ title: name, value: name })),
        });
        if (!branch || project()?.id !== item.id) return;
        adapter.setDraftWorktree(item.id, branch);
        setRevision((value) => value + 1);
      };
      return (
        <box
          flexDirection="row"
          gap={1}
          flexGrow={1}
          flexShrink={1}
          minWidth={0}
          onSizeChange={function (this: BoxRenderable) {
            const width = this.width;
            queueMicrotask(() => setAvailableWidth(width));
          }}
        >
          <Show when={branches()?.current || branches()?.defaultBranch}>
            <DraftChip
              context={context}
              prefix={startPoint() ? "● " : "○ "}
              prefixColor={
                startPoint() ? context.theme.text.brand : context.theme.background.raised.max
              }
              label={startPoint() ? "Worktree" : "Current checkout"}
              tone={startPoint() ? "primary" : "muted"}
              onClick={() => void chooseCheckout()}
            />
            <Show when={startPoint()}>
              {(branch) => (
                <>
                  <text fg={context.theme.text.muted} wrapMode="none">
                    from
                  </text>
                  <DraftChip
                    context={context}
                    label={branch()}
                    tone="primary"
                    maxWidth={Math.max(6, Math.min(36, availableWidth() - 20))}
                    onClick={() => void chooseBranch()}
                  />
                </>
              )}
            </Show>
          </Show>
        </box>
      );
    },
  });
  context.ui.slot({
    prepend: "home.footer",
    render: () => <DraftNews context={context} adapter={adapter} />,
  });
  context.ui.slot({
    prepend: "home.footer.status",
    render: () => <DraftShortcuts context={context} />,
  });
}

function DraftHeaderChips(props: {
  context: Plugin.Context;
  adapter: Adapter;
  onProjectChange: () => void;
}) {
  const dimensions = useTerminalDimensions();
  const headerMaxWidth = () =>
    Math.max(6, Math.floor((Math.min(75, dimensions().width - 4) - 10) / 2));
  const [project] = createResource(
    () => props.context.location?.directory,
    (directory) => props.adapter.draftProject(directory).catch(() => undefined),
  );
  const chooseProject = async () => {
    const inventory = await props.adapter.draftProjects().catch(() => undefined);
    if (!inventory) return;
    const next = await props.context.ui.dialog.select({
      title: "Project",
      current: project()?.id,
      options: inventory.map((entry) => ({
        title: entry.name,
        description: entry.directory,
        value: entry.id,
      })),
    });
    const selected = inventory.find((entry) => entry.id === next);
    if (!selected || selected.id === project()?.id) return;
    props.adapter.setDraftWorktree(selected.id);
    props.onProjectChange();
    props.context.ui.router.navigate({ type: "home", location: { directory: selected.directory } });
  };
  return (
    <>
      <DraftChip
        context={props.context}
        label={project()?.name ?? "Project"}
        tone="primary"
        maxWidth={headerMaxWidth()}
        onClick={() => void chooseProject()}
      />
      <DraftChip
        context={props.context}
        prefix="● "
        prefixColor={props.context.theme.text.feedback.success.base}
        label={props.adapter.server?.name ?? "Local"}
        tone="primary"
        maxWidth={headerMaxWidth()}
        onClick={() => props.context.keymap.dispatch("poracode.server.switch")}
      />
    </>
  );
}

function ShortcutHint(props: {
  context: Plugin.Context;
  shortcut: string;
  label: string;
  command: string;
}) {
  const [hovered, setHovered] = createSignal(false);
  return (
    <box
      flexShrink={0}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      onMouseUp={() => props.context.keymap.dispatch(props.command)}
    >
      <text
        fg={hovered() ? props.context.theme.text.brand : props.context.theme.text.base}
        wrapMode="none"
      >
        {props.shortcut}{" "}
        <span
          style={{ fg: hovered() ? props.context.theme.text.base : props.context.theme.text.muted }}
        >
          {props.label}
        </span>
      </text>
    </box>
  );
}

function DraftShortcuts(props: { context: Plugin.Context }) {
  const dimensions = useTerminalDimensions();
  const shortcut = (id: string) => props.context.keymap.shortcuts(id)[0];
  const mcpList = createMemo(
    () => props.context.data.location.mcp.server.list(props.context.location) ?? [],
  );
  // Reserve full space for the MCP status pill and app version before showing
  // bottom-left keybind hints so `⊙ N MCP /mcps` is never crowded or clipped.
  const layout = createMemo(() => {
    const width = dimensions().width;
    const mcps = mcpList();
    const hasMcp = mcps.length > 0;
    const failed = mcps.filter((item) => item.status.status === "failed").length;
    const connected = mcps.filter((item) => item.status.status === "connected").length;
    const mcpText = !hasMcp
      ? 0
      : failed > 0
        ? textWidth(`⊙ ${failed} MCP failed`) + (width >= 64 ? 6 : 0)
        : textWidth(`⊙ ${connected} MCP`) + (width >= 64 ? 6 : 0);
    const versionText = width >= 64 ? textWidth(props.context.app.version) : 0;
    const reserved = 4 + (hasMcp ? mcpText + 2 : 0) + (versionText > 0 ? versionText + 2 : 0) + 2;
    const remaining = width - reserved;
    const agentsKey = shortcut("agent.cycle");
    const commandsKey = shortcut("command.palette.show");
    const agentsWidth = agentsKey ? textWidth(`${agentsKey} agents`) : 0;
    const commandsWidth = commandsKey ? textWidth(`${commandsKey} commands`) : 0;
    const dividerWidth = hasMcp ? 3 : 0;
    const showBoth =
      Boolean(agentsKey && commandsKey) &&
      remaining >= dividerWidth + agentsWidth + 2 + commandsWidth;
    const showCommandsOnly =
      !showBoth && Boolean(commandsKey) && remaining >= dividerWidth + commandsWidth;
    return {
      showDivider: hasMcp && (showBoth || showCommandsOnly),
      showAgents: showBoth,
      showCommands: showBoth || showCommandsOnly,
      agentsKey,
      commandsKey,
    };
  });
  return (
    <>
      <Show when={layout().showDivider}>
        <text fg={props.context.theme.background.raised.max} wrapMode="none" flexShrink={0}>
          ·
        </text>
      </Show>
      <Show when={layout().showAgents && layout().agentsKey}>
        {(key) => (
          <ShortcutHint
            context={props.context}
            shortcut={key()}
            label="agents"
            command="agent.cycle"
          />
        )}
      </Show>
      <Show when={layout().showCommands && layout().commandsKey}>
        {(key) => (
          <ShortcutHint
            context={props.context}
            shortcut={key()}
            label="commands"
            command="command.palette.show"
          />
        )}
      </Show>
    </>
  );
}

function DraftChip(props: {
  context: Plugin.Context;
  prefix?: string;
  prefixColor?: RGBA;
  label: string;
  tone?: "primary" | "muted";
  maxWidth?: number;
  onClick: () => void;
}) {
  const [hovered, setHovered] = createSignal(false);
  const labelFg = () =>
    hovered() || props.tone === "primary"
      ? props.context.theme.text.base
      : props.context.theme.text.muted;
  const chevronFg = () =>
    hovered() ? props.context.theme.text.brand : props.context.theme.text.muted;
  return (
    <box
      flexShrink={0}
      onMouseUp={props.onClick}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
    >
      <text wrapMode="none">
        {props.prefix ? (
          <span style={{ fg: props.prefixColor ?? props.context.theme.text.muted }}>
            {props.prefix}
          </span>
        ) : null}
        <span style={{ fg: labelFg() }}>{endTruncate(props.label, props.maxWidth ?? 24)}</span>
        <span style={{ fg: chevronFg() }}> ▾</span>
      </text>
    </box>
  );
}

type DraftNewsItem = {
  text?: string;
  url?: string;
  actionLabel?: string;
  command?: string;
  usage?: { provider: string; window: string; percent: number };
};

async function loadDraftNews(
  context: Plugin.Context,
  adapter: Adapter,
  signal: AbortSignal,
): Promise<DraftNewsItem[]> {
  const settings = await adapter.newsLineSettings().catch(() => undefined);
  if (!settings?.enabled || signal.aborted) return [];
  const request = (url: string) =>
    fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
    })
      .then((result) => (result.ok ? result.json() : undefined))
      .catch(() => undefined);
  const [feed, releases, usage] = await Promise.all([
    request(NEWS_FEED_URL),
    request(CHANGELOG_URL),
    settings.activity ? adapter.providerUsage() : undefined,
  ]);
  const labels = allUsageProviderDescriptors();
  const usageFact = pickUsageFact(
    Object.fromEntries((usage?.snapshots ?? []).map((snapshot) => [snapshot.providerId, snapshot])),
    settings.disabledProviders,
    (id) => labels.find((provider) => provider.id === id)?.label,
  );
  const announcements = selectNewsFeedItems(parseNewsFeed(feed), {
    now: Date.now(),
    appVersion: context.app.version,
    platform:
      process.platform === "win32" || process.platform === "darwin" ? process.platform : "linux",
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
    isFeatureUsed: () => undefined,
  }).map(({ content, action, actionLabel }) => {
    const text =
      "text" in content
        ? content.text
        : content.template.name === "github-stars-milestone"
          ? `Poracode just passed ${content.template.count.toLocaleString()} stars on GitHub`
          : `${content.template.count.toLocaleString()} good first issues on GitHub`;
    return {
      text,
      url:
        action?.type === "url"
          ? action.url
          : action?.type === "whats-new"
            ? "https://poracode.com/changelog"
            : undefined,
      actionLabel,
    };
  });
  const highlights = changelogHighlightPool(
    parseChangelogDocument(releases) ?? [],
    context.app.version,
  );
  return [
    ...(usageFact
      ? [
          {
            actionLabel: "Usage",
            command: "poracode.usage",
            usage: {
              provider: usageFact.providerLabel,
              window: usageWindowDisplayLabel(usageFact.window),
              percent: Math.max(0, Math.min(100, Math.round(usageFact.window.usedPercent))),
            },
          },
        ]
      : []),
    ...announcements,
    ...highlights.map((item) => ({
      text: highlightHeadline(item.change),
      url: "https://poracode.com/changelog",
      actionLabel: "What's new",
    })),
  ];
}

const USAGE_BAR_WIDTH = 8;

function DraftNews(props: { context: Plugin.Context; adapter: Adapter }) {
  const [index, setIndex] = createSignal(0);
  const [hovered, setHovered] = createSignal(false);
  const [actionHovered, setActionHovered] = createSignal(false);
  const abort = new AbortController();
  onCleanup(() => abort.abort());
  const [items] = createResource(() => loadDraftNews(props.context, props.adapter, abort.signal));
  createEffect(() => {
    if ((items()?.length ?? 0) < 2 || hovered()) return;
    const timer = setInterval(() => setIndex((value) => (value + 1) % items()!.length), 5_000);
    onCleanup(() => clearInterval(timer));
  });
  const usageTone = (percent: number): RGBA => {
    if (percent >= 90) return props.context.theme.text.feedback.error.base;
    if (percent >= 75) return props.context.theme.text.feedback.warning.base;
    return props.context.theme.text.brand;
  };
  return (
    <Show when={items()?.[index()]}>
      {(item) => (
        <box
          width="100%"
          flexDirection="row"
          justifyContent="center"
          paddingLeft={2}
          paddingRight={2}
          gap={2}
          flexShrink={0}
          onMouseOver={() => setHovered(true)}
          onMouseOut={() => setHovered(false)}
        >
          <Show
            when={item().usage}
            fallback={
              <text
                fg={props.context.theme.text.muted}
                wrapMode="none"
                flexShrink={1}
                minWidth={0}
                truncate
              >
                <span style={{ fg: props.context.theme.text.brand }}>▪ </span>
                {item().text}
              </text>
            }
          >
            {(usage) => {
              const filled = Math.round((usage().percent / 100) * USAGE_BAR_WIDTH);
              const empty = USAGE_BAR_WIDTH - filled;
              return (
                <text wrapMode="none" flexShrink={1} minWidth={0} truncate>
                  <span style={{ fg: props.context.theme.text.base }}>{usage().provider} </span>
                  <span style={{ fg: props.context.theme.text.muted }}>{usage().window} </span>
                  <span style={{ fg: usageTone(usage().percent) }}>{"━".repeat(filled)}</span>
                  <span style={{ fg: props.context.theme.border.base }}>{"━".repeat(empty)}</span>
                  <span style={{ fg: props.context.theme.text.muted }}>
                    {" "}
                    {usage().percent}% used
                  </span>
                </text>
              );
            }}
          </Show>
          <Show when={item().command || item().url}>
            <box
              flexShrink={0}
              onMouseOver={() => setActionHovered(true)}
              onMouseOut={() => setActionHovered(false)}
              onMouseUp={() => {
                const { command, url } = item();
                if (command) props.context.keymap.dispatch(command);
                if (url)
                  void openUrl(url).catch(() => {
                    props.context.ui.toast.show({
                      variant: "error",
                      message: "Could not open the news link.",
                    });
                  });
              }}
            >
              <text wrapMode="none">
                <span
                  style={{
                    fg: actionHovered()
                      ? props.context.theme.text.brand
                      : props.context.theme.text.base,
                  }}
                >
                  {item().actionLabel ?? "Open"}{" "}
                </span>
                <span style={{ fg: props.context.theme.text.brand }}>›</span>
              </text>
            </box>
          </Show>
        </box>
      )}
    </Show>
  );
}
