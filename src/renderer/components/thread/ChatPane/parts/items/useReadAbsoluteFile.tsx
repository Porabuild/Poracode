import { useEffect, useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { ProjectLocation } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { resolveAbsolutePath as resolveAbsolutePathForLocation } from "@/renderer/utils/resolveAbsolutePath";

export interface FetchTarget {
  path: string;
  projectLocation: ProjectLocation;
}

export type ReadState =
  | "idle"
  | "loading"
  | "ready"
  | "missing"
  | "binary"
  | "too_large"
  | "unsupported"
  | "error";

export interface ReadResult {
  state: ReadState;
  content?: string;
  reason?: string;
}

export function useReadAbsoluteFile(target: FetchTarget | null): ReadResult {
  const [result, setResult] = useState<ReadResult>({ state: "idle" });
  const path = target?.path;
  const projectLocation = target?.projectLocation;
  // Every input that restarts the read, folded into one key so the effect
  // consumes the request identity instead of resetting state synchronously.
  // Starts as null so the mount pass applies the same reset the effect ran.
  const requestKey = path && projectLocation ? `${path}\0${JSON.stringify(projectLocation)}` : null;
  const activeRequestKeyRef = useRef(requestKey);
  const [prevRequestKey, setPrevRequestKey] = useState<string | null>(null);
  if (prevRequestKey !== requestKey) {
    setPrevRequestKey(requestKey);
    setResult(requestKey === null ? { state: "idle" } : { state: "loading" });
  }

  useEffect(() => {
    activeRequestKeyRef.current = requestKey;
    if (requestKey === null || !path || !projectLocation) return;
    let cancelled = false;
    const capturedKey = requestKey;
    const absolutePath = resolveAbsolutePath(path, projectLocation);
    readBridge()
      .readAbsoluteFile({ projectLocation, absolutePath })
      .then((res) => {
        if (cancelled || activeRequestKeyRef.current !== capturedKey) return;
        if (res.status === "ready") {
          setResult({ state: "ready", content: res.content ?? "" });
        } else {
          setResult({ state: res.status });
        }
      })
      .catch((err: unknown) => {
        if (cancelled || activeRequestKeyRef.current !== capturedKey) return;
        setResult({ state: "error", reason: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [path, projectLocation, requestKey]);

  return result;
}

interface FileContentPlaceholderProps {
  state: ReadState;
  reason?: string | undefined;
}

export function FileContentPlaceholder({ state, reason }: FileContentPlaceholderProps) {
  const { t } = useLingui();
  const message =
    state === "loading" || state === "idle"
      ? t`Loading file…`
      : state === "missing"
        ? t`File no longer exists on disk.`
        : state === "binary"
          ? t`Binary file — preview unavailable.`
          : state === "too_large"
            ? t`File is too large to preview.`
            : state === "unsupported"
              ? t`File uses an unsupported encoding.`
              : (reason ?? t`Could not read file.`);
  return <div className="font-mono text-[color:var(--muted)]/80 text-xs">{message}</div>;
}

function resolveAbsolutePath(rawPath: string, location: ProjectLocation): string {
  if (isAbsolutePath(rawPath)) return rawPath;
  return resolveAbsolutePathForLocation(location, rawPath.replace(/^[\\/]+/, ""));
}

function isAbsolutePath(p: string): boolean {
  if (p.startsWith("/")) return true;
  if (/^[a-zA-Z]:[\\/]/.test(p)) return true;
  if (p.startsWith("\\\\")) return true;
  return false;
}
