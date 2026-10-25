import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { toast } from "@heroui/react";
import type { ForgeGetPrViewedFilesPayload, ForgePrViewedFilesResult } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { fileViewState, usePrViewedFiles } from "./prViewedFiles";

export function useSyncedPrViewedFiles(scope: string, input?: ForgeGetPrViewedFilesPayload) {
  const local = usePrViewedFiles(scope);
  const [snapshot, setSnapshot] = useState<{ scope: string; result: ForgePrViewedFilesResult }>();
  const [busy, setBusy] = useState(false);
  const currentScope = useRef<string | null>(scope);
  const generation = useRef(0);
  const writes = useRef({ scope, promise: Promise.resolve() });
  const active = snapshot?.scope === scope ? snapshot.result : undefined;
  const marks = Object.fromEntries(
    active?.files.map((file) => [file.path, file.fingerprint]) ?? [],
  );

  useLayoutEffect(() => {
    currentScope.current = scope;
    generation.current++;
    return () => {
      currentScope.current = null;
    };
  }, [scope]);

  async function refresh() {
    if (!input) return;
    const ticket = ++generation.current;
    setBusy(true);
    try {
      if (writes.current.scope === scope) await writes.current.promise;
      if (currentScope.current !== scope || generation.current !== ticket) return;
      const result = await readBridge().forgeGetPrViewedFiles(input);
      if (currentScope.current === scope && generation.current === ticket)
        setSnapshot({ scope, result });
    } catch (error) {
      if (currentScope.current === scope && generation.current === ticket)
        toast.danger(friendlyError(error));
    } finally {
      if (currentScope.current === scope && generation.current === ticket) setBusy(false);
    }
  }

  const refreshOnFocus = useEffectEvent(() => {
    void refresh();
  });
  useEffect(() => {
    const onFocus = () => {
      refreshOnFocus();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  function update(path: string, fingerprint: string | null) {
    if (!input || !active || currentScope.current !== scope) return;
    const ticket = ++generation.current;
    setBusy(true);
    const previous = writes.current.scope === scope ? writes.current.promise : Promise.resolve();
    const write = previous.then(async () => {
      if (currentScope.current !== scope) return;
      const result = await readBridge().forgeSetPrFileViewed({ ...input, path, fingerprint });
      if (currentScope.current === scope && generation.current === ticket)
        setSnapshot({ scope, result });
    });
    writes.current = { scope, promise: write.catch(() => {}) };
    void write
      .catch((error) => {
        if (currentScope.current === scope && generation.current === ticket)
          toast.danger(friendlyError(error));
      })
      .finally(() => {
        if (currentScope.current === scope && generation.current === ticket) setBusy(false);
      });
  }

  if (!input) return { ...local, loading: false, storage: "device" as const, refresh };
  return {
    storage: active?.storage ?? "host",
    loading: busy || !active,
    refresh,
    state: (path: string, fingerprint: string) => {
      if (active?.storage === "forge") {
        return marks[path] === "VIEWED"
          ? ("viewed" as const)
          : marks[path] === "DISMISSED"
            ? ("changed" as const)
            : ("unread" as const);
      }
      return fileViewState({ [scope]: marks }, scope, path, fingerprint);
    },
    mark: (path: string, fingerprint: string) => update(path, fingerprint),
    clear: (path: string) => update(path, null),
    absorb: undefined,
  };
}
