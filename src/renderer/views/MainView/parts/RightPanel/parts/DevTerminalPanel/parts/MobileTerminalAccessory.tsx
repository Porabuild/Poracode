import { useState } from "react";
import { toast } from "@heroui/react";
import { readBridge } from "@/renderer/bridge";
import { friendlyError } from "@/shared/messages";

const CTRL_TAB_SEQUENCE = "\x1b[9;5u";

type Modifier = "shift" | "ctrl" | "cmd";

const MODIFIERS: ReadonlyArray<{ readonly id: Modifier; readonly label: string }> = [
  { id: "shift", label: "\u21e7" },
  { id: "ctrl", label: "^" },
  { id: "cmd", label: "\u2318" },
];

const KEYS: ReadonlyArray<{ readonly id: string; readonly label: string; readonly code: string }> =
  [
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

const NO_MODIFIERS: Record<Modifier, boolean> = { shift: false, ctrl: false, cmd: false };

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
  if (!hasModifier(modifiers)) return KEY_DATA[key] ?? key;

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

/** Touch keyboard and common terminal key chords for the compact terminal page. */
export function MobileTerminalAccessory(props: { readonly terminalId: string }) {
  const [modifiers, setModifiers] = useState<Record<Modifier, boolean>>(NO_MODIFIERS);

  function send(data: string): void {
    if (!data) return;
    void readBridge()
      .writeTerminal({ threadId: props.terminalId, data })
      .catch((error: unknown) => toast.danger(friendlyError(error)));
  }

  function sendKey(key: string): void {
    send(encodeKey(key, modifiers));
    if (hasModifier(modifiers)) setModifiers(NO_MODIFIERS);
  }

  return (
    <div className="m-terminal-accessory">
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
