import { useEffect, useRef, useState } from "react";
import type { FileEntry, ProjectLocation } from "../../../shared/contracts";
import { readBridge } from "../../bridge";

export function useDebouncedFileSearch(
  projectLocation: ProjectLocation | undefined,
  query: string,
  isActive: boolean,
): FileEntry[] {
  const [results, setResults] = useState<FileEntry[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef(0);

  useEffect(() => {
    if (!isActive || !projectLocation) {
      setResults([]);
      return;
    }

    if (timerRef.current !== undefined) clearTimeout(timerRef.current);

    const requestId = ++abortRef.current;

    // For empty query, fetch immediately (show top files)
    const delay = query.length === 0 ? 0 : 150;

    timerRef.current = setTimeout(async () => {
      try {
        const result = await readBridge().searchProjectFiles({
          projectLocation,
          query,
          limit: 20,
        });
        // Only apply if this is still the latest request
        if (abortRef.current === requestId) {
          setResults(result.entries);
        }
      } catch {
        if (abortRef.current === requestId) {
          setResults([]);
        }
      }
    }, delay);

    return () => {
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    };
  }, [projectLocation, query, isActive]);

  return results;
}
