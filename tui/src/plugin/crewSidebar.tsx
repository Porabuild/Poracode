import type { Plugin } from "@opencode/plugin/tui";
import { createMemo, For, Show } from "solid-js";
import type { Adapter } from "../adapter";

export function CrewSidebar(props: {
  context: Plugin.Context;
  adapter: Adapter;
  sessionID: string;
  tick: () => number;
}) {
  const theme = props.context.theme;
  const crew = createMemo(() => {
    props.tick();
    return props.adapter.crewSidebar(props.sessionID);
  });
  return (
    <Show when={crew()}>
      <box>
        <text fg={theme.text.base}>
          <b>Crew</b>
        </text>
        <text fg={theme.text.base}>{crew()!.title}</text>
        <For each={crew()!.members}>
          {(member) => (
            <text>
              <span style={{ fg: theme.text.base }}>{member.label}</span>
              <Show when={member.detail}>
                <span style={{ fg: theme.text.muted }}> · {member.detail}</span>
              </Show>
            </text>
          )}
        </For>
      </box>
    </Show>
  );
}
