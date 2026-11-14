import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { type DiffFile, highlighter } from "@git-diff-view/react";
import { Plural, Trans } from "@lingui/react/macro";
import type { Project } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { readGitDiffSearchLines } from "@/renderer/components/find/gitDiffSearch";
import { buildInWorker, diffFileFromBundle } from "../../diffBuildClient";
import { FileHeader } from "./FileHeader";
import { entryKey, type DiffEntry } from "./diffHelpers";
import { DiffAnnotationView } from "../../DiffAnnotationView";

export function DiffSection(props: {
  entry: DiffEntry;
  mode: number;
  theme: "light" | "dark";
  projectLocation: Project["location"];
  projectId: Project["id"];
  worktreePath: string | undefined;
  scrollRef: RefObject<HTMLDivElement | null>;
  visible: boolean;
  contentKey: string;
}) {
  const {
    entry,
    mode: rawMode,
    theme,
    projectLocation,
    projectId,
    worktreePath,
    scrollRef,
    visible,
    contentKey,
  } = props;
  const isNewFile = entry.deletions === 0 && (!entry.oldName || entry.oldName === "/dev/null");
  const mode = isNewFile ? 4 : rawMode;
  const [collapsed, setCollapsed] = useState(false);
  const [nearViewport, setNearViewport] = useState(false);
  const [editing, setEditing] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState<number | null>(null);
  const [contentDiffFile, setContentDiffFile] = useState<DiffFile | null>(null);
  const [ready, setReady] = useState(false);
  const requestKey = `${contentKey}\0${entry.rawDiff}`;
  const [previousRequest, setPreviousRequest] = useState(requestKey);
  if (previousRequest !== requestKey) {
    setPreviousRequest(requestKey);
    setContentDiffFile(null);
    setReady(false);
    setBodyHeight(null);
  }

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(
      ([record]) => {
        setNearViewport(record?.isIntersecting ?? false);
      },
      { root: scrollRef.current, rootMargin: "600px 0px" },
    );
    observer.observe(section);
    const reveal = () => {
      setCollapsed(false);
      setNearViewport(true);
    };
    section.addEventListener("poracode-reveal-diff", reveal);
    return () => {
      observer.disconnect();
      section.removeEventListener("poracode-reveal-diff", reveal);
    };
  }, [scrollRef]);

  // Keep an open comment editor alive when its file leaves the viewport.
  const renderBody = (visible && nearViewport && !collapsed) || editing;
  const hasDiff = !entry.loading && !entry.tooLarge && !!entry.rawDiff.trim();
  useEffect(() => {
    if (!renderBody || !hasDiff || ready) return;
    let cancelled = false;
    async function load() {
      try {
        // A missing content response must still leave the patch readable.
        const content = await readBridge()
          .getGitFileContent({
            projectLocation,
            filePath: entry.filePath,
            staged: entry.staged,
          })
          .catch(() => ({}));
        if (cancelled) return;
        const item = {
          key: `${entryKey(entry)}:${contentKey}`,
          diff: entry.rawDiff,
          oldName: entry.oldName,
          newName: entry.newName,
          fileLang: entry.fileLang,
        };
        const [fullResult] = await buildInWorker([{ ...item, ...content }]).catch(() => []);
        const result = fullResult?.bundle ? fullResult : (await buildInWorker([item]))[0];
        if (!cancelled && result?.bundle) {
          setContentDiffFile(diffFileFromBundle(result.data, result.bundle));
        }
      } catch {
        // Keep the existing unavailable-diff state when a build fails.
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [renderBody, hasDiff, ready, contentKey, entry, projectLocation]);

  useEffect(() => () => contentDiffFile?.clear(), [contentDiffFile]);

  // Preserve the measured space when the expensive body unmounts. Models are
  // built once per visited file so context expansion survives scrolling back.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body || !renderBody || !contentDiffFile || collapsed) return;
    const measure = () => {
      setBodyHeight(body.getBoundingClientRect().height);
      if (sectionRef.current)
        readGitDiffSearchLines(sectionRef.current, `${rawMode}\0${contentKey}\0${entry.rawDiff}`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [renderBody, contentDiffFile, collapsed, rawMode, contentKey, entry.rawDiff]);

  return (
    <div ref={sectionRef} data-diff-key={entryKey(entry)} className="rounded border border-border">
      <FileHeader
        entry={entry}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
      />
      {entry.tooLarge ? (
        !collapsed && (
          <div className="px-4 py-3 text-xs text-muted">
            <Trans>
              File too large to display (
              <Plural
                value={entry.insertions + entry.deletions}
                one="# line changed"
                other="# lines changed"
              />
              )
            </Trans>
          </div>
        )
      ) : (
        <div
          ref={bodyRef}
          aria-hidden={collapsed || undefined}
          className={isNewFile ? "diff-new-file" : undefined}
          style={
            collapsed
              ? { display: "none" }
              : renderBody && contentDiffFile
                ? undefined
                : { height: bodyHeight ?? entry.estimatedHeight }
          }
        >
          {renderBody && contentDiffFile ? (
            <div className="poracode-git-diff-body">
              <DiffAnnotationView
                diffFile={contentDiffFile}
                filePath={entry.filePath}
                projectId={projectId}
                staged={entry.staged}
                worktreePath={worktreePath}
                diffViewMode={mode}
                diffViewTheme={theme}
                diffViewFontSize={12}
                registerHighlighter={highlighter}
                diffViewHighlight={true}
                diffViewWrap={false}
                onEditingChange={setEditing}
              />
            </div>
          ) : renderBody && (entry.loading || (hasDiff && !ready)) ? (
            <div className="flex h-16 items-center justify-center">
              <PixelLoader />
            </div>
          ) : renderBody ? (
            <div className="px-4 py-3 text-xs text-muted">
              <Trans>No diff available for {entry.filePath}</Trans>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
