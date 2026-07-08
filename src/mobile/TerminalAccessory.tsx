import { useRef, useState } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Keyboard, RotateCw } from "lucide-react";
import type {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ClipboardEvent as ReactClipboardEvent,
} from "react";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";

const CTRL_TAB_SEQUENCE = "\x1b[9;5u";

type Modifier = "shift" | "ctrl" | "cmd";

const MODIFIERS: ReadonlyArray<{
  readonly id: Modifier;
  readonly label: string;
}> = [
  { id: "shift", label: "\u21e7" },
  { id: "ctrl", label: "^" },
  { id: "cmd", label: "\u2318" },
];

const KEYS: ReadonlyArray<{
  readonly id: string;
  readonly label: string;
  readonly code: string;
}> = [
  { id: "escape", label: "Esc", code: "Escape" },
  { id: "tab", label: "Tab", code: "Tab" },
  { id: "enter", label: "\u21b5", code: "Enter" },
  { id: "backspace", label: "\u232b", code: "Backspace" },
  { id: "arrow-up", label: "\u2191", code: "ArrowUp" },
  { id: "arrow-down", label: "\u2193", code: "ArrowDown" },
  { id: "arrow-left", label: "\u2190", code: "ArrowLeft" },
  { id: "arrow-right", label: "\u2192", code: "ArrowRight" },
  { id: "key-t", label: "T", code: "t" },
  { id: "key-c", label: "C", code: "c" },
];

const KEY_DATA: Record<string, string> = {
  Enter: "\r",
  Backspace: "\x7f",
  Tab: "\t",
  Escape: "\x1b",
  ArrowUp: "\x1b[A",
  ArrowDown: "\x1b[B",
  ArrowRight: "\x1b[C",
  ArrowLeft: "\x1b[D",
};

const ARROW_SUFFIX: Record<string, string> = {
  ArrowUp: "A",
  ArrowDown: "B",
  ArrowRight: "C",
  ArrowLeft: "D",
};

const KEY_CODE_POINTS: Record<string, number> = {
  Enter: 13,
  Backspace: 127,
  Escape: 27,
  Tab: 9,
};

function modifierValue(modifiers: Record<Modifier, boolean>): number {
  return 1 + (modifiers.shift ? 1 : 0) + (modifiers.ctrl ? 4 : 0) + (modifiers.cmd ? 8 : 0);
}

function hasModifier(modifiers: Record<Modifier, boolean>): boolean {
  return modifiers.shift || modifiers.ctrl || modifiers.cmd;
}

function controlCode(key: string): string | null {
  if (!/^[a-z]$/i.test(key)) return null;
  return String.fromCharCode(key.toUpperCase().charCodeAt(0) - 64);
}

function encodeKey(key: string, modifiers: Record<Modifier, boolean>): string {
  const modified = hasModifier(modifiers);
  if (!modified) return KEY_DATA[key] ?? key;

  if (modifiers.ctrl && !modifiers.shift && !modifiers.cmd) {
    if (key === "Tab") return CTRL_TAB_SEQUENCE;
    const ctrl = controlCode(key);
    if (ctrl) return ctrl;
  }

  if (key === "Tab" && modifiers.shift && !modifiers.ctrl && !modifiers.cmd) {
    return "\x1b[Z";
  }

  const value = modifierValue(modifiers);
  const arrowSuffix = ARROW_SUFFIX[key];
  if (arrowSuffix) return `\x1b[1;${value}${arrowSuffix}`;

  const codePoint = KEY_CODE_POINTS[key] ?? key.codePointAt(0);
  return codePoint === undefined ? "" : `\x1b[${codePoint};${value}u`;
}

const NO_MODIFIERS: Record<Modifier, boolean> = { shift: false, ctrl: false, cmd: false };

export function TerminalAccessory(props: {
  readonly terminalId: string;
  readonly onReload?: (() => void) | undefined;
}) {
  const { t } = useLingui();
  const [modifiers, setModifiers] = useState<Record<Modifier, boolean>>(NO_MODIFIERS);

  function send(data: string): void {
    if (!data) return;
    void readBridge()
      .writeTerminal({ threadId: props.terminalId, data })
      .catch((error: unknown) => {
        toast.danger(friendlyError(error));
      });
  }

  function sendKey(key: string): void {
    send(encodeKey(key, modifiers));
    if (hasModifier(modifiers)) {
      setModifiers(NO_MODIFIERS);
    }
  }

  /** Send typed text, applying any sticky modifier to a single character. */
  function sendText(text: string): void {
    if (hasModifier(modifiers) && text.length === 1) {
      send(encodeKey(text, modifiers));
      setModifiers(NO_MODIFIERS);
    } else {
      send(text);
    }
  }

  function effectiveModifiers(event: ReactKeyboardEvent<HTMLInputElement>) {
    return {
      shift: modifiers.shift || event.shiftKey,
      ctrl: modifiers.ctrl || event.ctrlKey,
      cmd: modifiers.cmd || event.metaKey,
    };
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    const nextModifiers = effectiveModifiers(event);
    const shouldSend =
      (hasModifier(nextModifiers) && event.key.length === 1) || KEY_DATA[event.key] !== undefined;
    if (!shouldSend) return;
    event.preventDefault();
    send(encodeKey(event.key, nextModifiers));
    if (hasModifier(nextModifiers)) {
      setModifiers(NO_MODIFIERS);
    }
  }

  // beforeinput handles the insertion and preventDefault()s the paired input
  // event. Some Android IME/GBoard paths ignore that cancellation and still
  // deliver the character via `input`; this guard drops that duplicate. Cleared
  // on a microtask so it only suppresses the immediately-following input event,
  // never a later standalone one (e.g. composition/autocorrect that fires only
  // `input`).
  const beforeInputHandledRef = useRef(false);

  function onBeforeInput(event: FormEvent<HTMLInputElement>): void {
    const native = event.nativeEvent as InputEvent;
    const inputType = native.inputType ?? "";
    if (inputType.startsWith("insert") && native.data) {
      event.preventDefault();
      beforeInputHandledRef.current = true;
      queueMicrotask(() => {
        beforeInputHandledRef.current = false;
      });
      sendText(native.data);
    }
  }

  function onInput(event: FormEvent<HTMLInputElement>): void {
    const value = event.currentTarget.value;
    event.currentTarget.value = "";
    if (beforeInputHandledRef.current) {
      // Already sent via beforeinput; the value only arrived because the WebView
      // ignored preventDefault. Drop the duplicate.
      beforeInputHandledRef.current = false;
      return;
    }
    if (!value) return;
    sendText(value);
  }

  function onPaste(event: ReactClipboardEvent<HTMLInputElement>): void {
    const text = event.clipboardData.getData("text");
    if (!text) return;
    event.preventDefault();
    send(text);
  }

  return (
    <div className="m-terminal-accessory">
      {props.onReload ? (
        <button
          className="m-terminal-accessory__key m-terminal-accessory__key--icon"
          type="button"
          aria-label={t`Reload`}
          onClick={props.onReload}
          onPointerDown={(event) => event.preventDefault()}
        >
          <RotateCw className="size-4" />
        </button>
      ) : null}
      <label className="m-terminal-accessory__input">
        <Keyboard className="size-4" />
        <input
          aria-label={t`Terminal input`}
          autoCapitalize="off"
          autoCorrect="off"
          inputMode="text"
          spellCheck={false}
          value=""
          onBeforeInput={onBeforeInput}
          onChange={() => {}}
          onInput={onInput}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
      </label>
      <div className="m-terminal-accessory__mods" role="group">
        {MODIFIERS.map((modifier) => (
          <button
            key={modifier.id}
            className="m-terminal-accessory__key m-terminal-accessory__key--mod"
            type="button"
            aria-pressed={modifiers[modifier.id]}
            data-active={modifiers[modifier.id] || undefined}
            onClick={() =>
              setModifiers((current) => ({
                ...current,
                [modifier.id]: !current[modifier.id],
              }))
            }
            onPointerDown={(event) => event.preventDefault()}
          >
            {modifier.label}
          </button>
        ))}
      </div>
      <div className="m-terminal-accessory__keys" role="group">
        {KEYS.map((key) => (
          <button
            key={key.id}
            className="m-terminal-accessory__key"
            type="button"
            onClick={() => sendKey(key.code)}
            onPointerDown={(event) => event.preventDefault()}
          >
            {key.label}
          </button>
        ))}
      </div>
    </div>
  );
}
