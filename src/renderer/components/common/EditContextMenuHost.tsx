import { useEffect, useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  ContextMenuSurface,
  dismissOpenContextMenus,
  type ContextMenuEntry,
  type ContextMenuItem,
} from "@/renderer/components/common/ContextMenu";
import {
  resolveEditContextMenu,
  runEditContextAction,
  type EditActionId,
  type EditContextRequest,
  type EditMenuModelEntry,
} from "@/renderer/components/common/editContextMenu";

/**
 * Right-click menu for text fields, selections, and links.
 *
 * The popup is the shared {@link ContextMenuSurface}: same rows, shortcuts,
 * and dismissal as the rest of the app. This host only decides when that menu
 * should open and which of its actions apply. Surfaces that already call
 * preventDefault (threads, files, the terminal) keep their own menu.
 */
export function EditContextMenuHost() {
  const { t } = useLingui();
  const requestRef = useRef<EditContextRequest | null>(null);
  const [request, setRequest] = useState<EditContextRequest | null>(null);

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if (isCoarsePointerOnly()) return;
      const target = event.target;
      const element =
        target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
      if (element?.closest("[role='menu'], [role='menuitem']")) {
        event.preventDefault();
        return;
      }
      if (event.defaultPrevented) return;
      const next = resolveEditContextMenu(event);
      if (!next) return;
      event.preventDefault();
      dismissOpenContextMenus();
      requestRef.current = next;
      setRequest(next);
    };
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);

  const labels: Record<EditActionId, string> = {
    cut: t`Cut`,
    copy: t`Copy`,
    paste: t`Paste`,
    "select-all": t`Select all`,
    "open-in-app-browser": t`Open in Poracode browser`,
    "open-in-system-browser": t`Open in system browser`,
    "copy-link": t`Copy link`,
    "add-to-chat": t`Add to chat`,
    "add-to-side-chat": t`Add to side chat`,
  };
  const items = request ? toContextMenuEntries(request.entries, labels, modifierLabel()) : [];
  const position = request ? { x: request.x, y: request.y } : null;

  return (
    <ContextMenuSurface
      position={position}
      items={items}
      onAction={(key) => {
        const current = requestRef.current;
        if (current) runEditContextAction(key, current);
      }}
      onClose={() => setRequest(null)}
    />
  );
}

function toContextMenuEntries(
  entries: readonly EditMenuModelEntry[],
  labels: Record<EditActionId, string>,
  modifier: string,
): ContextMenuEntry[] {
  return entries.map((entry) => {
    if (entry.type === "separator") return { type: "separator" };
    const item: ContextMenuItem = {
      id: entry.id,
      label: labels[entry.id],
      isDisabled: !entry.enabled,
    };
    if (entry.shortcut) item.shortcut = `${modifier}+${entry.shortcut}`;
    return item;
  });
}

function modifierLabel(): string {
  const platform = document.documentElement.dataset.platform;
  if (platform === "darwin") return "Cmd";
  if (platform && platform !== "unknown") return "Ctrl";
  return /Mac|iPhone|iPad/i.test(navigator.platform) ? "Cmd" : "Ctrl";
}

function isCoarsePointerOnly(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  return (
    window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches
  );
}
