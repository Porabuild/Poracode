import { protocol } from "electron";

export const PICKER_SCHEME = "poracode-picker";
export const PICKER_COMMIT_ORIGIN = `${PICKER_SCHEME}://commit`;

export type PickerPayload =
  | { kind: "cancelled" }
  | {
      kind: "picked";
      selector: string;
      rect: { x: number; y: number; width: number; height: number };
      dpr: number;
      url: string;
      title: string;
    };

export interface PickerCommit {
  tabId: string;
  payload: PickerPayload;
}

type PickerListener = (commit: PickerCommit) => void;

const listeners = new Set<PickerListener>();

export function onPickerCommit(listener: PickerListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function registerPickerProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: PICKER_SCHEME,
      privileges: { standard: false, secure: true, supportFetchAPI: true },
    },
  ]);
}

export function installPickerProtocolHandler(): void {
  protocol.handle(PICKER_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const tabId = url.searchParams.get("tabId") ?? "";
      const raw = url.searchParams.get("payload") ?? "";
      const payload = JSON.parse(raw) as PickerPayload;
      for (const l of listeners) {
        try {
          l({ tabId, payload });
        } catch {}
      }
    } catch {}
    return new Response(null, { status: 204 });
  });
}
