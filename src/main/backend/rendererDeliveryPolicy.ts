interface RendererIpcInterests {
  terminalThreadIds: string[];
  runtimeThreadIds: string[];
}

const EMPTY_INTERESTS: RendererIpcInterests = {
  terminalThreadIds: [],
  runtimeThreadIds: [],
};

/** A configured direct stream exclusively owns renderer events, including reconnect replay. */
export function rendererIpcInterests(
  directStreamConfigured: boolean,
  interests: RendererIpcInterests,
): RendererIpcInterests {
  return directStreamConfigured ? EMPTY_INTERESTS : interests;
}

export function shouldDispatchRendererIpcEvent(directStreamConfigured: boolean): boolean {
  return !directStreamConfigured;
}
