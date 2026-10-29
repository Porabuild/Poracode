import { expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import { resolveThemeDocument } from "@opencode/theme/tui"
import { BRAND, displayThemeName } from "../src/brand"
import { resolve as resolveConfig } from "../src/config"
import { allThemes, parseTheme, resolveThemeWithFallback } from "../src/theme"
import { createAppFixture } from "./fixture/app"
import { agent } from "./fixture/local"
import { json } from "./fixture/tui-client"

test("Poracode is the default built-in theme without replacing a user choice", () => {
  expect(displayThemeName(BRAND.defaultTheme)).toBe(BRAND.name)
  expect(displayThemeName("opencode")).toBe("Poracode Classic")
  expect(resolveConfig({}, { terminalSuspend: true }).theme?.name).toBe(BRAND.defaultTheme)
  expect(resolveConfig({ theme: { name: "github" } }, { terminalSuspend: true }).theme?.name).toBe("github")

  const themes = allThemes()
  expect(themes[BRAND.defaultTheme]).toBeDefined()
  const document = parseTheme(themes[BRAND.defaultTheme]!, BRAND.defaultTheme)
  for (const mode of ["light", "dark"] as const) {
    const resolved = resolveThemeDocument(document, mode)
    expect(resolved.background.base.equals(RGBA.fromHex(BRAND.palette[mode].background))).toBe(true)
    expect(resolved.text.brand.equals(RGBA.fromHex(BRAND.palette[mode].accent))).toBe(true)
  }
})

test("an invalid custom theme falls back to Poracode", () => {
  const resolved = resolveThemeWithFallback(
    "broken-custom",
    { ...allThemes(), "broken-custom": { theme: {} } },
    "dark",
  )

  expect(resolved.name).toBe(BRAND.defaultTheme)
  expect("error" in resolved).toBe(true)
  expect(resolved.theme.background.base.equals(RGBA.fromHex(BRAND.palette.dark.background))).toBe(true)
})

test("the rendered home screen uses Poracode branding only", async () => {
  const worktree = "/tmp/poracode"
  const directory = `${worktree}/packages/tui`
  await using app = await createAppFixture({
    width: 100,
    height: 30,
    config: { animations: false },
    fetch: (url) => {
      if (url.pathname === "/path") return json({ home: "", state: "", config: "", worktree, directory })
      if (url.pathname === "/api/agent")
        return json({
          location: { directory, project: { id: "proj_test", directory: worktree, canonical: worktree } },
          data: [agent("build")],
        })
      if (url.pathname === "/api/location")
        return json({ directory, project: { id: "proj_test", directory: worktree, canonical: worktree } })
      if (url.pathname === "/api/fs/list")
        return json({
          location: { directory, project: { id: "proj_test", directory: worktree, canonical: worktree } },
          data: [],
        })
    },
  })
  await app.ready
  await app.waitForFrame((frame) => frame.includes("█▀▀█ █▀▀█ █▀▀▄ ▀▀▀█   █▀▀▀ █▀▀█ █▀▀█ █▀▀█"))
  await app.waitForFrame((frame) => frame.includes("No model selected"))

  const frame = app.captureCharFrame()
  expect(frame).toContain("█▀▀█ █▀▀█ █▀▀▄ ▀▀▀█   █▀▀▀ █▀▀█ █▀▀█ █▀▀█")
  expect(frame).not.toContain("PORA.CODE")
  expect(frame.toLowerCase()).not.toContain("opencode")
  expect(frame).toContain("No model selected")
  expect(frame).not.toContain("Connect a provider")
})
