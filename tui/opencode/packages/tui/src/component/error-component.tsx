import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createSignal, For, Show } from "solid-js"
import { getScrollAcceleration } from "../util/scroll"
import { useClipboard } from "../context/clipboard"
import { useExit } from "../context/exit"
import { useTuiApp } from "../context/runtime"
import { describeOS, describeTerminal } from "../util/system"
import { BRAND } from "../brand"

export function ErrorComponent(props: { error: Error; reset: () => void; mode?: "dark" | "light" }) {
  const term = useTerminalDimensions()
  const exit = useExit()
  const clipboard = useClipboard()
  const app = useTuiApp()
  const [copyState, setCopyState] = createSignal<"idle" | "copied" | "failed">("idle")

  // poracode: keep fatal screens on the built-in brand palette if theme setup failed.
  const isLight = props.mode === "light"
  const palette = isLight ? BRAND.palette.light : BRAND.palette.dark
  const colors = {
    bg: palette.background,
    element: palette.raised,
    borderSubtle: palette.borderSubtle,
    text: palette.foreground,
    muted: palette.muted,
    primary: palette.accent,
    onPrimary: palette.accentForeground,
    error: palette.danger,
    success: palette.success,
  }

  const message = props.error.message || "An unknown error occurred."
  const stack = props.error.stack || "No stack trace available."
  const report = buildCrashReport(message, stack, app.version)

  const copyReport = () => {
    void clipboard
      .write(report)
      .then(() => setCopyState("copied"))
      .catch(() => setCopyState("failed"))
  }

  const actions = [
    {
      key: "c",
      label: () => ({ idle: "Copy report", copied: "✓ Copied", failed: "Copy failed" })[copyState()],
      copy: true,
      onUse: copyReport,
    },
    { key: "r", label: () => "Restart", onUse: props.reset },
    { key: "q", label: () => "Quit", onUse: () => exit() },
  ]
  const [selected, setSelected] = createSignal(0)
  const move = (delta: number) => setSelected((prev) => (prev + delta + actions.length) % actions.length)
  let scroll: ScrollBoxRenderable | undefined

  useKeyboard((evt) => {
    if (evt.ctrl && evt.name === "c") return exit()
    if (evt.name === "return") {
      evt.preventDefault()
      evt.stopPropagation()
      return actions[selected()].onUse()
    }
    if (evt.name === "left") {
      evt.preventDefault()
      evt.stopPropagation()
      return move(-1)
    }
    if (evt.name === "right") {
      evt.preventDefault()
      evt.stopPropagation()
      return move(1)
    }
    if (evt.name === "tab") {
      evt.preventDefault()
      evt.stopPropagation()
      return move(evt.shift ? -1 : 1)
    }
    // Vertical keys scroll the stack trace; buttons navigate horizontally.
    if (evt.name === "up") return scroll?.scrollBy(-1)
    if (evt.name === "down") return scroll?.scrollBy(1)
    if (evt.name === "pageup" && scroll) return scroll.scrollBy(-scroll.height)
    if (evt.name === "pagedown" && scroll) return scroll.scrollBy(scroll.height)
    if (evt.name === "home" && scroll) return scroll.scrollTo(0)
    if (evt.name === "end" && scroll) return scroll.scrollTo(scroll.scrollHeight)
    if (evt.name === "q") return exit()
    if (evt.name === "c") return copyReport()
    if (evt.name === "r") return props.reset()
  })

  // Responsive thresholds.
  const contentWidth = () => Math.min(84, Math.max(24, term().width - 4))
  const showSubtext = () => term().height >= 18
  const showFooter = () => term().height >= 20

  return (
    <box
      width={term().width}
      height={term().height}
      backgroundColor={colors.bg}
      flexDirection="column"
      alignItems="center"
    >
      <box width={contentWidth()} flexGrow={1} flexDirection="column" paddingTop={1} paddingBottom={1} gap={1}>
        {/* Headline */}
        <box flexDirection="column" alignItems="center" flexShrink={0}>
          <text attributes={TextAttributes.BOLD} fg={colors.text}>
            {BRAND.name} crashed
          </text>
          <Show when={showSubtext()}>
            <text fg={colors.muted}>An unexpected error stopped the session.</text>
          </Show>
        </box>

        {/* Error message panel */}
        <box
          flexShrink={0}
          border
          borderStyle="rounded"
          borderColor={colors.error}
          title=" Error "
          titleColor={colors.error}
          paddingLeft={2}
          paddingRight={2}
        >
          <text fg={colors.text}>{message}</text>
        </box>

        {/* Actions */}
        <box flexDirection="row" flexWrap="wrap" justifyContent="center" gap={2} rowGap={1} flexShrink={0}>
          <For each={actions}>
            {(action, index) => {
              const isSelected = () => selected() === index()
              const copyColor = () =>
                action.copy
                  ? copyState() === "copied"
                    ? colors.success
                    : copyState() === "failed"
                      ? colors.error
                      : undefined
                  : undefined
              return (
                <box flexDirection="column" alignItems="center" flexShrink={0}>
                  <box
                    onMouseDown={() => setSelected(index())}
                    onMouseUp={() => action.onUse()}
                    backgroundColor={copyColor() ?? (isSelected() ? colors.primary : colors.element)}
                    minWidth={15}
                    alignItems="center"
                    paddingLeft={2}
                    paddingRight={2}
                  >
                    <text
                      attributes={TextAttributes.BOLD}
                      fg={copyColor() || isSelected() ? colors.onPrimary : colors.text}
                    >
                      {action.label()}
                    </text>
                  </box>
                  <text fg={isSelected() ? colors.primary : colors.muted}>{action.key}</text>
                </box>
              )
            }}
          </For>
        </box>

        {/* Stack trace */}
        <box
          flexGrow={1}
          flexBasis={0}
          minHeight={3}
          border
          borderStyle="rounded"
          borderColor={colors.borderSubtle}
          title=" Stack trace "
          titleColor={colors.muted}
          bottomTitle=" ↑↓ scroll "
          bottomTitleAlignment="right"
          paddingLeft={1}
          paddingRight={1}
        >
          <scrollbox
            ref={(element: ScrollBoxRenderable) => (scroll = element)}
            flexGrow={1}
            scrollAcceleration={getScrollAcceleration()}
          >
            <text fg={colors.muted}>{stack}</text>
          </scrollbox>
        </box>

        {/* Footer */}
        <Show when={showFooter()}>
          <box flexDirection="column" alignItems="center" flexShrink={0}>
            <text fg={colors.muted}>
              {copyState() === "copied"
              ? "Report copied. Share it with the Poracode team."
                : copyState() === "failed"
                  ? "Clipboard write failed. Try again or report the crash manually."
                  : "Copy the report to share it with the Poracode team."}
            </text>
            <text fg={colors.muted}>{BRAND.name} {app.version}</text>
          </box>
        </Show>
      </box>
    </box>
  )
}

function buildCrashReport(message: string, stack: string, version: string) {
  return [
    `${BRAND.name} TUI crash report`,
    `Version: ${version}`,
    `OS: ${describeOS()}`,
    `Terminal: ${describeTerminal()}`,
    `Error: ${message}`,
    "Stack trace:",
    stack.slice(0, 6000),
  ].join("\n")
}
