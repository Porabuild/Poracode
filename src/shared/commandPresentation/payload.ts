import { commandActionSchema } from "../contracts/runtimeEvent";
import { deriveCommandActionsIntent } from "./actions";
import { deriveCommandIntent } from "./interpret";
import { readToolValuePath } from "../toolPresentationSource";
import { readCommandInvocation } from "./invocation";

export function deriveCommandPayloadIntent(payload: unknown, options?: { retainInput?: boolean }) {
  const actions = commandActionSchema.array().safeParse(readToolValuePath(payload, ["actions"]));
  return (
    (actions.success ? deriveCommandActionsIntent(actions.data) : null) ??
    deriveCommandIntent(readCommandInvocation(payload), options)
  );
}
