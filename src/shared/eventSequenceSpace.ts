export const EVENT_SEQUENCE_SPACES = ["ipc", "loopback"] as const;
export type EventSequenceSpace = (typeof EVENT_SEQUENCE_SPACES)[number];
