// poracode: Poracode block art for the session epilogue.
import type { RGBA } from "@opentui/core"
import { wordmarkRows } from "../logo"

const reset = "\x1b[0m"
const bold = "\x1b[1m"
const dim = "\x1b[90m"

const rgb = (color: RGBA) => color.toInts().slice(0, 3).join(";")

export function sessionEpilogue(input: {
  title: string
  sessionID?: string
  width?: number
  colors?: { brand: RGBA; shadow: RGBA }
}) {
  // poracode: strokes stay bold on the terminal's own foreground so the art
  // remains legible after the TUI exits; shadow and the Pora dot are truecolor
  // when the theme is known, 256-colour otherwise.
  const shadowFg = input.colors ? `\x1b[38;2;${rgb(input.colors.shadow)}m` : "\x1b[38;5;238m"
  const shadowBg = input.colors ? `\x1b[48;2;${rgb(input.colors.shadow)}m` : "\x1b[48;5;238m"
  const brandFg = input.colors ? `\x1b[38;2;${rgb(input.colors.brand)}m` : "\x1b[38;5;105m"
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

  const weak = (text: string) => `${dim}${text.padEnd(10, " ")}${reset}`
  return [
    ...wordmarkRows((input.width ?? 80) - 2).map((row) => `  ${draw(row)}`),
    "",
    `  ${weak("Session")}${bold}${input.title}${reset}`,
    `  ${weak("Continue")}${bold}poracode tui --session ${input.sessionID}${reset}`,
    "",
  ].join("\n")
}
