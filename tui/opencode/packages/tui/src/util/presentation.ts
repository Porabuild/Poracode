// poracode: Poracode block art for the session epilogue.
import type { RGBA } from "@opentui/core"
import { wordmarkRows } from "../logo"

const reset = "\x1b[0m"
const bold = "\x1b[1m"
const dim = "\x1b[90m"

const rgb = (color: RGBA) => color.toInts().slice(0, 3).join(";")

export type SessionEpilogue = {
  readonly title: string
  readonly sessionID?: string
  readonly width?: number
  readonly colors?: { readonly brand: RGBA; readonly shadow: RGBA }
}

// Printed after the TUI closes.
export function epilogue(input: { readonly session?: SessionEpilogue; readonly updatedVersion?: string }) {
  if (!input.session && !input.updatedVersion) return
  // poracode: strokes stay bold on the terminal's own foreground so the art
  // remains legible after the TUI exits; shadow and the Pora dot are truecolor
  // when the theme is known, 256-colour otherwise.
  const colors = input.session?.colors
  const shadowFg = colors ? `\x1b[38;2;${rgb(colors.shadow)}m` : "\x1b[38;5;238m"
  const shadowBg = colors ? `\x1b[48;2;${rgb(colors.shadow)}m` : "\x1b[48;5;238m"
  const brandFg = colors ? `\x1b[38;2;${rgb(colors.brand)}m` : "\x1b[38;5;105m"
  const draw = (line: string) =>
    [...line]
      .map((char) => {
        if (char === "_") return `${shadowBg} ${reset}`
        if (char === "^") return `${bold}${shadowBg}▀${reset}`
        if (char === "~") return `${shadowFg}▀${reset}`
        if (char === ",") return `${shadowFg}▄${reset}`
        if (char === ".") return `${brandFg}▀${reset}`
        if (char === " ") return " "
        return `${bold}${char}${reset}`
      })
      .join("")
  const row = (label: string, value: string) => `  ${dim}${label.padEnd(10, " ")}${reset}${bold}${value}${reset}`
  return [
    ...wordmarkRows((input.session?.width ?? 80) - 2).map((line) => `  ${draw(line)}`),
    "",
    ...(input.updatedVersion
      ? [`  ${dim}Run ${reset}${bold}poracode${reset}${dim} to use ${reset}${bold}${input.updatedVersion}${reset}`, ""]
      : []),
    ...(input.session
      ? [
          row("Session", input.session.title),
          row("Continue", `poracode tui --session ${input.session.sessionID}`),
          "",
        ]
      : []),
  ].join("\n")
}
