import { Show } from "solid-js";

// Slot mounts insert render results into a <box>, where a bare string is an
// orphan text node that crashes the renderer. Wrap slot text in <text>.
export function SlotText(props: { value: () => string | null | undefined }) {
  return (
    <Show when={props.value()}>
      <text>{props.value()}</text>
    </Show>
  );
}
