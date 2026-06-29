import { useEffect, useRef, useState } from "react";
import type { ProjectLocation, SkillScan } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";

export interface UseSkillsResult {
  scan: SkillScan | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function loadSkills(input: {
  projectLocation?: ProjectLocation;
  run: number;
  currentRun: () => number;
  setScan: (scan: SkillScan) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}): Promise<void> {
  const { projectLocation, run, currentRun, setScan, setLoading, setError } = input;
  setLoading(true);
  setError(null);
  try {
    const result = await readBridge().scanSkills(projectLocation ? { projectLocation } : {});
    if (currentRun() === run) setScan(result);
  } catch (err) {
    if (currentRun() === run) setError(errorMessage(err, "Couldn't load skills."));
  } finally {
    if (currentRun() === run) setLoading(false);
  }
}

/**
 * Load the skill scan for the given project (or just the global scopes when no
 * location is provided). Re-runs whenever the location changes; `reload()`
 * re-scans on demand after a mutation.
 */
export function useSkills(projectLocation?: ProjectLocation): UseSkillsResult {
  const [scan, setScan] = useState<SkillScan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(0);

  async function reload(): Promise<void> {
    const run = runRef.current + 1;
    runRef.current = run;
    await loadSkills({
      ...(projectLocation ? { projectLocation } : {}),
      run,
      currentRun: () => runRef.current,
      setScan,
      setLoading,
      setError,
    });
  }

  useEffect(() => {
    const run = runRef.current + 1;
    runRef.current = run;
    void loadSkills({
      ...(projectLocation ? { projectLocation } : {}),
      run,
      currentRun: () => runRef.current,
      setScan,
      setLoading,
      setError,
    });
  }, [projectLocation]);

  return { scan, loading, error, reload };
}
