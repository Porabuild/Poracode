/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import type { Context } from "@opencode/plugin/tui/context"
import { createStore, produce } from "solid-js/store"
import { SidebarOnboarding } from "../../src/feature-plugins/sidebar/footer"

function context(options?: {
  dismissed?: boolean
  integrations?: Array<{ connections: unknown[] }>
  dispatched?: string[]
}) {
  const color = RGBA.fromInts(200, 200, 200)
  const [onboarding, setOnboarding] = createStore({ dismissed: options?.dismissed ?? false })
  const location = { directory: "/workspace" }
  return {
    location,
    theme: {
      background: { raised: { high: color } },
      text: { base: color, muted: color },
    },
    storage: {
      store: () => [
        onboarding,
        (mutation: (draft: { dismissed: boolean }) => void) => {
          setOnboarding(produce(mutation))
          return Promise.resolve()
        },
      ],
    },
    keymap: {
      dispatch: (id: string) => options?.dispatched?.push(id),
    },
    ui: {
      format: { path: (value: string) => value },
    },
    data: {
      session: {
        get: () => ({ location }),
      },
      location: {
        integration: { list: () => options?.integrations },
        vcs: { info: () => undefined },
      },
    },
  } as unknown as Context
}

async function render(input: Context, height = 22) {
  const app = await testRender(
    () => (
      <box width={38}>
        <SidebarOnboarding context={input} sessionID="session" />
      </box>
    ),
    { width: 38, height },
  )
  await app.renderOnce()
  return app
}

test("sidebar waits for integrations before showing onboarding", async () => {
  const app = await render(context())

  try {
    expect(app.captureCharFrame()).not.toContain("Getting started")
  } finally {
    app.renderer.destroy()
  }
})

test("sidebar preserves the compact layout when the onboarding card cannot fit", async () => {
  const app = await render(context({ integrations: [] }), 21)

  try {
    expect(app.captureCharFrame()).not.toContain("Getting started")
  } finally {
    app.renderer.destroy()
  }
})

test("Poracode hides provider onboarding", async () => {
  const app = await render(context({ integrations: [] }))

  try {
    const frame = app.captureCharFrame()
    expect(frame).not.toContain("Getting started")
    expect(frame.toLowerCase()).not.toContain("opencode")
    expect(frame).not.toContain("Connect provider")
    expect(frame).not.toContain("/connect")
  } finally {
    app.renderer.destroy()
  }
})

test("sidebar hides onboarding after an integration is connected or the card is dismissed", async () => {
  const connected = await render(context({ integrations: [{ connections: [{}] }] }))
  const dismissed = await render(context({ integrations: [], dismissed: true }))

  try {
    expect(connected.captureCharFrame()).not.toContain("Getting started")
    expect(dismissed.captureCharFrame()).not.toContain("Getting started")
  } finally {
    connected.renderer.destroy()
    dismissed.renderer.destroy()
  }
})

test("disabled provider onboarding has no connect or dismiss controls", async () => {
  const dispatched: string[] = []
  const app = await render(context({ integrations: [], dispatched }))

  try {
    expect(app.renderer.root.findDescendantById("sidebar.footer.getting-started.connect")).toBeUndefined()
    expect(app.renderer.root.findDescendantById("sidebar.footer.getting-started.dismiss")).toBeUndefined()
    expect(dispatched).toEqual([])
  } finally {
    app.renderer.destroy()
  }
})
