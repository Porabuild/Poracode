// poracode: pure computation for the `session.transcript.top` slot — which
// prompt the visible transcript content answers once that prompt's rows have
// scrolled out of view.

export type StickyPromptMessage = {
  readonly id: string
  readonly type: string
  readonly text?: string
}

/**
 * The prompt to pin over the transcript top, or undefined while the prompt
 * is still (at least partly) on screen.
 *
 * `scrollTop`/`viewportY` are the scrollbox's content-space viewport top and
 * screen offset; a row's content-y follows findMessageBoundary's convention
 * (`scrollTop + y - viewportY`). `positions` are the mounted message anchors
 * in content order; `anchorFor` returns the union bounds of every mounted
 * row belonging to a message.
 */
export function stickyPromptID(input: {
  readonly scrollTop: number
  readonly viewportY: number
  readonly positions: readonly { readonly id: string; readonly y: number }[]
  readonly anchorFor: (messageID: string) => { readonly y: number; readonly height: number } | undefined
  readonly messages: readonly StickyPromptMessage[]
}): string | undefined {
  const top = input.scrollTop
  const atTop = input.positions.findLast((position) => top + position.y - input.viewportY <= top)
  if (!atTop) return undefined
  const index = input.messages.findIndex((message) => message.id === atTop.id)
  if (index < 0) return undefined
  let prompt: StickyPromptMessage | undefined
  for (let i = index; i >= 0; i--) {
    const message = input.messages[i]!
    if (message.type === "user" && message.text?.trim()) {
      prompt = message
      break
    }
  }
  if (!prompt) return undefined
  const anchor = input.anchorFor(prompt.id)
  // No mounted rows means the prompt is entirely above the viewport.
  if (!anchor) return prompt.id
  const bottom = top + anchor.y + anchor.height - input.viewportY
  return bottom > top ? undefined : prompt.id
}
