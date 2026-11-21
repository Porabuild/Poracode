import { expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import { epilogue } from "../../src/util/presentation"

const rows = (text: string | undefined) =>
  Bun.stripANSI(text ?? "")
    .split("\n")
    .filter((line) => line.trim() && !/[▀▄█]/.test(line))

test("prints nothing without a session or update", () => {
  expect(epilogue({})).toBeUndefined()
})

test("formats session continuation summary", () => {
  expect(rows(epilogue({ session: { title: "A session", sessionID: "ses_123" } }))).toEqual([
    "  Session   A session",
    "  Continue  poracode tui --session ses_123",
  ])
})

test("tells the user to start Poracode again after an update", () => {
  expect(rows(epilogue({ updatedVersion: "2.0.0" }))).toEqual(["  Run poracode to use 2.0.0"])
})

test("keeps the session continuation after an update", () => {
  expect(rows(epilogue({ session: { title: "A session", sessionID: "ses_123" }, updatedVersion: "2.0.0" }))).toEqual([
    "  Run poracode to use 2.0.0",
    "  Session   A session",
    "  Continue  poracode tui --session ses_123",
  ])
})

test("renders theme colours as truecolor escapes", () => {
  const out = epilogue({
    session: {
      title: "A session",
      sessionID: "ses_123",
      colors: { brand: RGBA.fromHex("#8892ef"), shadow: RGBA.fromHex("#333333") },
    },
  })
  expect(out).toContain("\x1b[38;2;136;146;239m")
  expect(out).toContain("\x1b[48;2;51;51;51m")
})

test("falls back to the 256-colour palette without theme colours", () => {
  const out = epilogue({ session: { title: "A session", sessionID: "ses_123" } })
  expect(out).toContain("\x1b[38;5;105m")
  expect(out).toContain("\x1b[48;5;238m")
})

test("picks the wordmark variant from the available width", () => {
  // 4 art rows + blank + session + continue + trailing blank
  expect(epilogue({ session: { title: "x", width: 80 } })!.split("\n")).toHaveLength(8)
  expect(epilogue({ session: { title: "x", width: 30 } })!.split("\n")).toHaveLength(11)
  expect(epilogue({ session: { title: "x", width: 15 } })!.split("\n")).toHaveLength(7)
})
