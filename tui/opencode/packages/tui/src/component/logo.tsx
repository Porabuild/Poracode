import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { logo } from "../logo"

export function Logo() {
  const theme = useTheme()
  const dimensions = useTerminalDimensions()
  const compact = () => dimensions().width < 22

  // poracode: the period is the brand accent in the ASCII wordmark.
  return (
    <box flexDirection="row">
      {dimensions().height < 12 ? null : (
        <>
          <text fg={theme.text.base} attributes={TextAttributes.BOLD} selectable={false}>
            {compact() ? logo.compact.slice(0, -1) : logo.beforeDot}
          </text>
          <text fg={theme.text.brand} attributes={TextAttributes.BOLD} selectable={false}>
            {logo.dot}
          </text>
          {compact() ? null : (
            <text fg={theme.text.base} attributes={TextAttributes.BOLD} selectable={false}>
              {logo.afterDot}
            </text>
          )}
        </>
      )}
    </box>
  )
}
