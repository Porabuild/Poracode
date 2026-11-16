// poracode: publishes each transcript row through the `session.transcript.row`
// slot so an embedding client can present rows its own way; without a claim the
// host rows render unchanged.
import { createMemo } from "solid-js"
import { useRenderer, type JSX } from "@opentui/solid"
import type { TranscriptEntry, TranscriptRow } from "@opencode/plugin/tui/context"
import { useNewDesigns } from "../../config"
import { useData } from "../../context/data"
import { usePromptRef } from "../../context/prompt"
import { usePlugin } from "../../plugin/context"
import { Slot } from "../../plugin/render"
import { useDialog } from "../../ui/dialog"
import { DialogSelect } from "../../ui/dialog-select"
import { visitEntries } from "./anchor-view"
import { groupID } from "./anchors"
import { DialogMessage } from "./dialog-message"
import type { SessionEntry, SessionRow } from "./grouping/session"
import { SessionImages, userMessageImages } from "./index"
import { use } from "./render-context"

export function TranscriptRowSlot(props: {
  row: SessionRow
  live: boolean
  render: () => JSX.Element
  entry: (entry: SessionEntry) => JSX.Element
  hide: (hidden: boolean) => void
}) {
  const ctx = use()
  const data = useData()
  const actions = useMessageActions()
  const plugins = usePlugin()
  const row = createMemo(() => transcriptRow(props.row))
  return (
    <Slot
      path="session.transcript.row"
      input={{
        get sessionID() {
          return ctx.sessionID
        },
        get row() {
          return row()
        },
        get live() {
          return props.live
        },
        get width() {
          return ctx.width
        },
        fallback: props.render,
        entry: (entry) => props.entry(sessionEntry(entry)),
        // poracode: same hooks the host TextPart uses for its markdown.
        markdown: {
          get mode() {
            return ctx.markdownMode()
          },
          get renderNode() {
            return plugins.markdown()
          },
        },
        actions,
        // poracode: the same image strip the host's UserMessage renders.
        images: (messageID) => {
          const message = data.session.message.get(ctx.sessionID, messageID)
          if (message?.type !== "user") return <></>
          return <SessionImages images={userMessageImages(message)} paddingLeft={0} />
        },
        hide: props.hide,
        disclosure: {
          get: ctx.savedDisclosure,
          set: (key, expanded, anchor) => ctx.setDisclosure(key, expanded, anchor, props.live),
        },
      }}
    >
      {props.render()}
    </Slot>
  )
}

/** A user message's click actions: pending-steer choices, otherwise the message actions dialog. */
export function useMessageActions() {
  const ctx = use()
  const dialog = useDialog()
  const renderer = useRenderer()
  const promptRef = usePromptRef()
  const newDesigns = useNewDesigns()
  return (messageID: string) => {
    if (renderer.getSelection()?.getSelectedText()) return
    if (ctx.pendingDelivery(messageID) === "steer") {
      dialog.replace(() => (
        <DialogSelect
          title="Pending steer"
          renderFilter={!newDesigns()}
          options={[
            { title: "Move to queue", value: "queue" as const },
            { title: "Delete", value: "cancel" as const },
          ]}
          onSelect={(option) => {
            void ctx.mutatePending(option.value, messageID).then((done) => done && dialog.clear())
          }}
        />
      ))
      return
    }
    // The dialog outlives the row, whose props go stale when a resync drops the message.
    const sessionID = ctx.sessionID
    dialog.replace(() => (
      <DialogMessage
        messageID={messageID}
        sessionID={sessionID}
        setPrompt={(value) => promptRef.current?.set(value)}
      />
    ))
  }
}

function transcriptRow(row: SessionRow): TranscriptRow {
  if (row.type !== "group") return transcriptEntry(row)
  const entries: TranscriptEntry[] = []
  visitEntries(row.children, (entry) => entries.push(transcriptEntry(entry)))
  return {
    type: "group",
    id: groupID(row, 0) ?? "",
    kind: row.kind,
    completed: row.completed,
    entries,
    pending:
      row.kind === "exploration" || row.kind === "activity"
        ? row.pending.map((ref) => ({ messageID: ref.messageID, partID: ref.partID }))
        : [],
  }
}

function transcriptEntry(entry: SessionEntry): TranscriptEntry {
  switch (entry.type) {
    case "part":
      return { type: "part", messageID: entry.ref.messageID, partID: entry.ref.partID }
    case "turn-usage":
      return { type: "turn-usage", messageIDs: [...entry.messageIDs] }
    default:
      return { ...entry }
  }
}

function sessionEntry(entry: TranscriptEntry): SessionEntry {
  switch (entry.type) {
    case "part":
      return { type: "part", ref: { messageID: entry.messageID, partID: entry.partID } }
    case "turn-usage":
      return { type: "turn-usage", messageIDs: [...entry.messageIDs] }
    default:
      return { ...entry }
  }
}
