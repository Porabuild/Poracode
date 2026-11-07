import { Plugin } from "@opencode/plugin/tui"
import { createMemo, Show } from "solid-js"
import { FilePath } from "../../ui/file-path"
import { useWorkingDirectoryActions } from "../../ui/working-directory-actions"
import { usePromptMove } from "../../component/prompt/move"

// poracode: provider setup is managed by the host app.
export function SidebarOnboarding(_props: { context: Plugin.Context; sessionID: string }) {
  return null
}

function SidebarFooter(props: { context: Plugin.Context; sessionID: string }) {
  const session = createMemo(() => props.context.data.session.get(props.sessionID))
  const move = usePromptMove({
    projectID: () => session()?.projectID,
    sessionID: () => props.sessionID,
  })
  const actions = useWorkingDirectoryActions({
    directory: () => props.context.location?.directory,
    onMove: () => void move.open(),
  })
  const directory = createMemo(() => {
    if (!props.context.location) return undefined
    const value = props.context.ui.format.path(props.context.location.directory)
    const branch = props.context.data.location.vcs.info(props.context.location)?.branch.current
    return branch ? `${value}:${branch}` : value
  })
  return (
    <box gap={1}>
      <Show when={directory()}>
        {(value) => (
          <box
            id="sidebar.footer.location"
            onMouseOver={actions.onMouseOver}
            onMouseOut={actions.onMouseOut}
            onMouseUp={actions.onMouseUp}
          >
            <FilePath
              value={value()}
              maxWidth={38}
              fg={actions.hovered() ? props.context.theme.text.base : props.context.theme.text.muted}
            />
          </box>
        )}
      </Show>
    </box>
  )
}

export default Plugin.define({
  id: "opencode.sidebar.footer",
  setup(context) {
    // Append keeps the path open to additive plugin claims; an external
    // replace still takes the boundary over.
    context.ui.slot({
      append: "sidebar.footer",
      render: (props) => <SidebarFooter context={context} sessionID={props.sessionID} />,
    })
  },
})
