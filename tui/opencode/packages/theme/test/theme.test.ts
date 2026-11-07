import { expect, test } from "bun:test"
import { migrateV1, parseThemeDocument, resolveThemeDocument } from "../src/tui/index.js"
import type { ThemeV1Json } from "../src/tui/v1.js"

const source: ThemeV1Json = await Bun.file(
  new URL("../../tui/src/theme/assets/opencode.json", import.meta.url),
).json()
const document = migrateV1(source)
const v2Source: unknown = await Bun.file(
  new URL("../../tui/src/theme/assets/v2/opencode.json", import.meta.url),
).json()

test.each(["light", "dark"] as const)("resolves %s themes without status tokens", (mode) => {
  const theme = resolveThemeDocument(document, mode)
  expect("status" in theme.text).toBeFalse()
  expect(theme.text.brand).toEqual(theme.hue.accent[200])
  expect(theme.hue.accent[800]).toBeDefined()
  expect(theme.hue.interactive[800]).toBeDefined()
})

test.each(["light", "dark"] as const)("provides the brand token for older %s themes", (mode) => {
  const theme = resolveThemeDocument(parseThemeDocument(v2Source, "legacy"), mode)
  expect(theme.text.brand).toEqual(theme.text.action.primary.selected)
})
